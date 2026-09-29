/**
 * Cross-cutting status tools: get_org_status, health_check.
 *
 * Every section here fails independently (try/catch per check) so one
 * inaccessible object or unlicensed domain doesn't take down the whole
 * report — a missing count is reported as `null` ("not accessible"), never
 * silently omitted or guessed at.
 */

import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cli from "./cli.js";
import * as auth from "./auth.js";
import * as perms from "./perms.js";

interface SoqlCountResult {
  totalSize: number;
}

async function safeCount(object: string, where?: string): Promise<number | null> {
  try {
    const query = `SELECT COUNT() FROM ${object}${where ? ` WHERE ${where}` : ""}`;
    const result = (await cli.runSoql(query)) as SoqlCountResult;
    return result.totalSize;
  } catch {
    return null;
  }
}

async function licenseProbe(): Promise<{ licensed: boolean; detail: string }> {
  try {
    await cli.describeSObject("StnryAssetEnvrSrc");
    return { licensed: true, detail: "StnryAssetEnvrSrc describes successfully." };
  } catch (err) {
    return {
      licensed: false,
      detail: `describe_sobject StnryAssetEnvrSrc failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Attempts to read the current Industries/Sustainability settings by
 * retrieving the Settings:Industries metadata and scanning the returned XML
 * for enableSC*-style boolean elements. This is a lightweight regex scan,
 * not a full XML parse — good enough to report which flags are on, but the
 * exact flag name set should be confirmed against a real retrieve rather
 * than trusted blindly, since it can vary by release.
 */
async function settingsProbe(): Promise<{ available: boolean; flags: Record<string, boolean>; detail: string }> {
  try {
    const dir = await mkdtemp(join(tmpdir(), "nzc-settings-"));
    try {
      const manifest = join(dir, "package.xml");
      await writeFile(
        manifest,
        `<?xml version="1.0" encoding="UTF-8"?>\n<Package xmlns="http://soap.sforce.com/2006/04/metadata">\n  <types>\n    <members>Industries</members>\n    <name>Settings</name>\n  </types>\n  <version>60.0</version>\n</Package>\n`,
        "utf8"
      );
      await cli.retrieveMetadata(manifest, dir);
      const xmlPath = join(dir, "settings", "Industries.settings");
      const xml = await readFile(xmlPath, "utf8").catch(async () => readFile(`${xmlPath}-meta.xml`, "utf8"));
      const flags: Record<string, boolean> = {};
      const matches = xml.matchAll(/<(enableSC\w+)>(true|false)<\/\1>/g);
      for (const m of matches) flags[m[1]] = m[2] === "true";
      return { available: true, flags, detail: `Parsed ${Object.keys(flags).length} enableSC* flag(s).` };
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  } catch (err) {
    return { available: false, flags: {}, detail: `Settings retrieval unavailable: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const PIPELINE_OBJECTS: { label: string; object: string; where?: string }[] = [
  { label: "Annual Emissions Inventories", object: "AnnualEmssnInventory" },
  { label: "Stationary/Building sources", object: "StnryAssetEnvrSrc" },
  { label: "Stationary energy use records", object: "StnryAssetEnrgyUse" },
  { label: "Stationary footprints", object: "StnryAssetCrbnFtprnt" },
  { label: "Vehicle/Fleet sources", object: "VehicleAssetEmssnSrc" },
  { label: "Vehicle energy use records", object: "VehicleAssetEnrgyUse" },
  { label: "Vehicle footprints", object: "VehicleAssetCrbnFtprnt" },
  { label: "Generated waste records", object: "GeneratedWaste" },
  { label: "Stationary water activity records", object: "StnryAssetWaterActvty" },
  { label: "Scope 3 sources", object: "Scope3EmssnSrc" },
  { label: "Scope 3 procurement items", object: "Scope3PcmtItem" },
  { label: "Scope 3 footprints", object: "Scope3CrbnFtprnt" },
  { label: "Suppliers", object: "Supplier" },
];

export interface OrgStatus {
  targetOrg: string | undefined;
  isProduction: boolean | null;
  license: { licensed: boolean; detail: string };
  settings: { available: boolean; flags: Record<string, boolean>; detail: string };
  permissionSetLicenses: Awaited<ReturnType<typeof perms.listPermissionSets>>["permissionSetLicenses"];
  permissionSets: Awaited<ReturnType<typeof perms.listPermissionSets>>["permissionSets"];
  pipelineCounts: { label: string; object: string; count: number | null }[];
  footprintsMissingInventoryLink: number | null;
}

export async function getOrgStatus(): Promise<OrgStatus> {
  const targetOrg = cli.getTargetOrg();
  const isProduction = targetOrg ? await auth.isProductionOrg(targetOrg).catch(() => null) : null;
  const license = await licenseProbe();

  if (!license.licensed) {
    return {
      targetOrg,
      isProduction,
      license,
      settings: { available: false, flags: {}, detail: "Skipped — license not confirmed." },
      permissionSetLicenses: [],
      permissionSets: [],
      pipelineCounts: PIPELINE_OBJECTS.map((o) => ({ label: o.label, object: o.object, count: null })),
      footprintsMissingInventoryLink: null,
    };
  }

  const settings = await settingsProbe();
  const { permissionSetLicenses, permissionSets } = await perms.listPermissionSets().catch(() => ({
    permissionSetLicenses: [],
    permissionSets: [],
  }));

  const pipelineCounts = await Promise.all(
    PIPELINE_OBJECTS.map(async (o) => ({ label: o.label, object: o.object, count: await safeCount(o.object, o.where) }))
  );

  const footprintsMissingInventoryLink = await safeCount("StnryAssetCrbnFtprnt", "AnnualEmssnInventoryId = null");

  return {
    targetOrg,
    isProduction,
    license,
    settings,
    permissionSetLicenses,
    permissionSets,
    pipelineCounts,
    footprintsMissingInventoryLink,
  };
}

export interface HealthCheckResult {
  setup: Awaited<ReturnType<typeof auth.checkNzcSetup>>;
  orgStatus: OrgStatus | null;
  note: string;
}

/**
 * Combines setup + org status into one report. Full validation-rule
 * auditing (audit_nzc_config) is a separate milestone's tool — this reports
 * what it can determine directly and says so plainly rather than pretending
 * to cover ground the rules engine owns.
 */
export async function healthCheck(): Promise<HealthCheckResult> {
  const setup = await auth.checkNzcSetup();
  if (!setup.cliInstalled || !setup.targetOrg) {
    return { setup, orgStatus: null, note: "Skipped org status — no CLI/target org available yet." };
  }
  const orgStatus = await getOrgStatus();
  return {
    setup,
    orgStatus,
    note: "This covers setup + org status only. Run audit_nzc_config for full validation-rule coverage once available.",
  };
}
