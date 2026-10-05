/** Read-only DCH status: which packages are installed, which PSLs are assigned, and which report templates are linked. */

import { DCH_PACKAGES, installedVersions } from "./packages.js";
import { DCH_PSLS } from "./foundation.js";
import { loadManifest } from "./templates.js";
import { query, soqlString } from "./common.js";

export async function getDchStatus(): Promise<{
  packages: Record<string, { wanted: string; installed: string | null }>;
  permissionSetLicensesPresent: string[];
  templates: { title: string; omniProcess: string; linked: boolean }[];
}> {
  const installed = await installedVersions();
  const packages: Record<string, { wanted: string; installed: string | null }> = {};
  for (const pkg of Object.values(DCH_PACKAGES)) {
    packages[pkg.namespace] = { wanted: pkg.version, installed: installed[pkg.namespace] ?? null };
  }

  const existing = new Set((await query<{ DeveloperName: string }>("SELECT DeveloperName FROM PermissionSetLicense")).map((p) => p.DeveloperName));

  const templates = [];
  for (const entry of await loadManifest()) {
    // ContentDocumentLink must be filtered by a single LinkedEntityId, so resolve the OmniProcess first.
    const [process] = await query<{ Id: string }>(
      `SELECT Id FROM OmniProcess WHERE Name = '${soqlString(entry.omniProcessName)}' AND IsActive = true LIMIT 1`
    );
    const links = process
      ? await query<{ ContentDocument: { Title: string } }>(
          `SELECT ContentDocument.Title FROM ContentDocumentLink WHERE LinkedEntityId = '${process.Id}'`
        )
      : [];
    templates.push({ title: entry.title, omniProcess: entry.omniProcessName, linked: links.some((l) => l.ContentDocument.Title === entry.title) });
  }

  return { packages, permissionSetLicensesPresent: DCH_PSLS.filter((p) => existing.has(p)), templates };
}
