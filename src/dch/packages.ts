/**
 * Managed package installs for DCH. Installs by namespace + version through an
 * InstalledPackage metadata deploy — the same mechanism CumulusCI's
 * InstallPackageVersion uses for namespaced packages — so no 04t package
 * version IDs are needed. Versions default to the ones the DCH project pinned
 * and can be overridden per call.
 */

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cli from "../salesforce/cli.js";
import { query } from "./common.js";

export type DchPackageKey = "omnistudio" | "gri" | "esrs" | "cdp" | "sasb";

export const DCH_PACKAGES: Record<DchPackageKey, { namespace: string; version: string }> = {
  omnistudio: { namespace: "omnistudio", version: "250.7" },
  gri: { namespace: "NZCDCHGRI", version: "244.1" },
  esrs: { namespace: "NZCDCHESRS", version: "244.0" },
  cdp: { namespace: "NZCDCHCDP", version: "244.0" },
  sasb: { namespace: "NZCDCHSASB", version: "244.1" },
};

/** Errors the metadata API returns while a just-published package version is still propagating. */
const RETRYABLE = /not yet available|package.*not.*available|try again/i;

export function installedPackageManifest(namespace: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
  <types>
    <members>${namespace}</members>
    <name>InstalledPackage</name>
  </types>
  <version>43.0</version>
</Package>
`;
}

export function installedPackageXml(version: string, activateRSS: boolean, securityType = "FULL"): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<InstalledPackage xmlns="http://soap.sforce.com/2006/04/metadata">
  <versionNumber>${version}</versionNumber>
  <activateRSS>${activateRSS}</activateRSS>
  <securityType>${securityType}</securityType>
</InstalledPackage>
`;
}

interface InstalledRow {
  SubscriberPackage: { NamespacePrefix: string | null };
  SubscriberPackageVersion: { MajorVersion: number; MinorVersion: number };
}

/** Installed version ("major.minor") per namespace, from the Tooling API. */
export async function installedVersions(): Promise<Record<string, string>> {
  const rows = await query<InstalledRow>(
    "SELECT SubscriberPackage.NamespacePrefix, SubscriberPackageVersion.MajorVersion, SubscriberPackageVersion.MinorVersion FROM InstalledSubscriberPackage",
    true
  );
  const out: Record<string, string> = {};
  for (const r of rows) {
    const ns = r.SubscriberPackage?.NamespacePrefix;
    if (ns) out[ns] = `${r.SubscriberPackageVersion.MajorVersion}.${r.SubscriberPackageVersion.MinorVersion}`;
  }
  return out;
}

/** True when `installed` is the same or newer than `wanted`, comparing major then minor numerically. */
export function versionSatisfied(installed: string, wanted: string): boolean {
  const [iMaj = 0, iMin = 0] = installed.split(".").map(Number);
  const [wMaj = 0, wMin = 0] = wanted.split(".").map(Number);
  return iMaj > wMaj || (iMaj === wMaj && iMin >= wMin);
}

export interface InstallPackageOptions {
  version?: string;
  activateRSS?: boolean;
  retries?: number;
  retryDelayMs?: number;
}

export interface InstallPackageResult {
  namespace: string;
  version: string;
  installed: boolean;
  skipped?: string;
}

export async function installDchPackage(key: DchPackageKey, opts: InstallPackageOptions = {}): Promise<InstallPackageResult> {
  const pkg = DCH_PACKAGES[key];
  if (!pkg) throw new Error(`Unknown DCH package "${key}". Expected one of: ${Object.keys(DCH_PACKAGES).join(", ")}.`);
  const version = opts.version ?? pkg.version;

  try {
    const have = (await installedVersions())[pkg.namespace];
    if (have && versionSatisfied(have, version)) {
      return { namespace: pkg.namespace, version: have, installed: false, skipped: `already installed at ${have}` };
    }
  } catch {
    // Can't read the installed list — fall through and let the install itself report any problem.
  }

  const dir = await mkdtemp(join(tmpdir(), "nzc-dch-pkg-"));
  try {
    await mkdir(join(dir, "installedPackages"));
    await writeFile(join(dir, "package.xml"), installedPackageManifest(pkg.namespace), "utf8");
    await writeFile(
      join(dir, "installedPackages", `${pkg.namespace}.installedPackage`),
      installedPackageXml(version, opts.activateRSS ?? true),
      "utf8"
    );

    const retries = opts.retries ?? 5;
    const delay = opts.retryDelayMs ?? 15_000;
    for (let attempt = 0; ; attempt++) {
      try {
        await cli.deployMetadata(dir);
        return { namespace: pkg.namespace, version, installed: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (attempt >= retries || !RETRYABLE.test(message)) throw err;
        await new Promise((resolve) => setTimeout(resolve, delay * (attempt + 1)));
      }
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
