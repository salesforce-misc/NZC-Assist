/**
 * DCH foundation: licenses and permission sets, OmniStudio + DocGen install
 * and configuration. Mirrors the DCH project's setup_omni_doc_gen flow.
 *
 * Permission-set and PSL names can differ per org (see the
 * nzc-foundation-licensing skill), so each is checked against the org first;
 * names that don't exist are reported as skipped instead of failing the run.
 */

import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cli from "../salesforce/cli.js";
import * as perms from "../salesforce/perms.js";
import { pluginPath } from "../paths.js";
import { licenseGate, deployDchDir, requireConfirm, runStep, runSteps, query, type StepOutcome, type StepResult } from "./common.js";
import { installDchPackage } from "./packages.js";
import { deployOmniStudioRemoteSites } from "./remote-site.js";

export const DCH_PSLS = [
  "NetZeroCloudUserPsl",
  "DataProcessingEnginePsl",
  "ManufacturingAdvancedAccountForecastPsl",
  "TCRMforSustainabilityPsl",
  "ClauseManagementUser",
  "DocGenDesignerPsl",
  "DisclosureAndComplianceHubUserPsl",
];

export const DCH_PERMSETS = [
  "NetZeroManager",
  "DataProcessingEngineUser",
  "TCRMforSustainabilityAdmin",
  "TCRMforSustainabilityUser",
  "ClauseDesigner",
  "OmniStudioAdmin",
  "DocGenDesigner",
  "ClauseUser",
  "DocGenUser",
  "DisclosureAndComplianceHubUser",
];

const CONTENT_USER_APEX = `User u = new User(Id = UserInfo.getUserId());
u.UserPermissionsSFContentUser = true;
update u;`;

const DOCGEN_PERMSET_APEX = "omnistudio.DocgenPostInstallClass.createPermissionSet();";

const DOCGEN_FONTS_APEX = "omnistudio.DocgenPostInstallClass.processDefaultFontFiles();";

/** `sf apex run` reports a failed script in the result body rather than through the exit code. */
async function runApexChecked(code: string): Promise<unknown> {
  const result = (await cli.runApex(code)) as { success?: boolean; compiled?: boolean; compileProblem?: string; exceptionMessage?: string };
  if (result.success === false) {
    throw new Error(result.compileProblem || result.exceptionMessage || "Anonymous Apex failed.");
  }
  return result;
}

/** Freshly deployed remote sites take a while to become callable, so font processing retries on callout errors. */
async function runApexWithCalloutRetry(code: string, attempts = 5, delayMs = 20_000): Promise<unknown> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await runApexChecked(code);
    } catch (err) {
      if (attempt >= attempts || !/CalloutException/.test(String(err))) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

interface AssignmentContext {
  existingPsls: Set<string>;
  existingPermsets: Set<string>;
  assignedPsls: Set<string>;
  assignedPermsets: Set<string>;
}

async function loadAssignmentContext(): Promise<AssignmentContext> {
  const { username } = await cli.orgDisplay();
  const [user] = await query<{ Id: string }>(`SELECT Id FROM User WHERE Username = '${username}' LIMIT 1`);
  const assigneeId = user?.Id;
  const [psls, permsets, assignedPsls, assignedPermsets] = await Promise.all([
    query<{ DeveloperName: string }>("SELECT DeveloperName FROM PermissionSetLicense"),
    query<{ Name: string }>("SELECT Name FROM PermissionSet"),
    assigneeId
      ? query<{ PermissionSetLicense: { DeveloperName: string } }>(
          `SELECT PermissionSetLicense.DeveloperName FROM PermissionSetLicenseAssign WHERE AssigneeId = '${assigneeId}'`
        )
      : Promise.resolve([]),
    assigneeId
      ? query<{ PermissionSet: { Name: string } }>(`SELECT PermissionSet.Name FROM PermissionSetAssignment WHERE AssigneeId = '${assigneeId}'`)
      : Promise.resolve([]),
  ]);
  return {
    existingPsls: new Set(psls.map((p) => p.DeveloperName)),
    existingPermsets: new Set(permsets.map((p) => p.Name)),
    assignedPsls: new Set(assignedPsls.map((a) => a.PermissionSetLicense.DeveloperName)),
    assignedPermsets: new Set(assignedPermsets.map((a) => a.PermissionSet.Name)),
  };
}

/** Assigns each PSL then permission set to the running user, skipping names that are absent or already assigned. */
export async function assignDchPermissions(
  psls: string[] = DCH_PSLS,
  permsets: string[] = DCH_PERMSETS
): Promise<{ assigned: string[]; alreadyAssigned: string[]; notPresent: string[] }> {
  const ctx = await loadAssignmentContext();
  const out = { assigned: [] as string[], alreadyAssigned: [] as string[], notPresent: [] as string[] };

  for (const name of psls) {
    if (!ctx.existingPsls.has(name)) out.notPresent.push(`PSL ${name}`);
    else if (ctx.assignedPsls.has(name)) out.alreadyAssigned.push(`PSL ${name}`);
    else {
      await perms.assignPermsetLicense(name);
      out.assigned.push(`PSL ${name}`);
    }
  }
  for (const name of permsets) {
    if (!ctx.existingPermsets.has(name)) out.notPresent.push(`permset ${name}`);
    else if (ctx.assignedPermsets.has(name)) out.alreadyAssigned.push(`permset ${name}`);
    else {
      await perms.assignPermset(name);
      out.assigned.push(`permset ${name}`);
    }
  }
  return out;
}

/** Deploys the DocGen sample packs with the Vlocity Build Tools CLI; skips with install guidance if it isn't on PATH. */
async function deployDocGenPacks(): Promise<StepOutcome> {
  const projectPath = pluginPath("data", "dch", "docgen-packs");
  const cwd = await mkdtemp(join(tmpdir(), "nzc-dch-vlocity-"));
  try {
    const jobFile = join(cwd, "docgen-job.yaml");
    await writeFile(
      jobFile,
      `projectPath: ${JSON.stringify(projectPath)}\nqueries:\n  - IntegrationProcedure\n  - DataRaptor\n  - OmniScriptDataRaptor\n`,
      "utf8"
    );
    const result = await cli.vlocityPackDeploy(jobFile, cwd);
    if (!result.installed) {
      return {
        skipped:
          "The vlocity CLI is not installed. Install it with `npm install -g vlocity`, then re-run setup_dch_foundation " +
          "(the earlier steps will skip) to deploy the DocGen OmniScripts.",
      };
    }
    return { detail: result.stdout?.split("\n").slice(-5).join("\n") };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}

export async function setupDchFoundation(opts: { confirm?: boolean; omnistudioVersion?: string } = {}): Promise<StepResult[]> {
  requireConfirm(opts.confirm, "set up the DCH foundation");

  const results = await runSteps([
    ["license-gate", async () => licenseGate()],
    [
      "assign-permissions",
      async () => {
        const r = await assignDchPermissions();
        return { detail: r };
      },
    ],
    [
      "install-omnistudio",
      async () => {
        const r = await installDchPackage("omnistudio", { version: opts.omnistudioVersion });
        return r.skipped ? { skipped: r.skipped } : { detail: r };
      },
    ],
    ["omnistudio-remote-sites", async () => ({ detail: await deployOmniStudioRemoteSites() })],
    ["deploy-settings", async () => void (await deployDchDir("settings"))],
    ["ensure-crm-content-user", async () => void (await runApexChecked(CONTENT_USER_APEX))],
    ["docgen-permission-set", async () => void (await runApexChecked(DOCGEN_PERMSET_APEX))],
    ["deploy-document-generation-settings", async () => void (await deployDchDir("document-generation-settings"))],
    ["docgen-font-resources", async () => void (await runApexWithCalloutRetry(DOCGEN_FONTS_APEX))],
    ["deploy-omni-interaction-config", async () => void (await deployDchDir("omni-interaction-config"))],
  ]);
  if (results.some((r) => r.status === "failed")) return results;

  // Permission sets delivered by the OmniStudio/DocGen packages (OmniStudioAdmin, DocGen*) only exist after
  // the install above, so names skipped as absent on the first pass get a second chance here.
  results.push(
    await runStep("assign-permissions-post-install", async () => {
      const r = await assignDchPermissions();
      return r.assigned.length === 0 ? { skipped: "nothing new to assign", detail: r } : { detail: r };
    })
  );
  results.push(await runStep("deploy-docgen-packs", deployDocGenPacks));
  return results;
}
