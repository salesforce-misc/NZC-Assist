/**
 * Permission tools: assign_permset, assign_permset_license, list_permission_sets.
 *
 * assign_permset_license prefers `sf org assign permsetlicense`; if that
 * fails (some orgs/CLI versions reject it for certain PSLs), it falls back
 * to an anonymous-Apex insert of PermissionSetLicenseAssign and reports
 * which path actually succeeded — never silently swallow which one ran.
 */

import * as cli from "./cli.js";

export async function assignPermset(name: string): Promise<unknown> {
  return cli.assignPermset(name);
}

export interface PermsetLicenseAssignResult {
  path: "cli" | "apex-fallback";
  result: unknown;
}

export async function assignPermsetLicense(name: string, targetUsername?: string): Promise<PermsetLicenseAssignResult> {
  try {
    const result = await cli.assignPermsetLicenseCli(name);
    return { path: "cli", result };
  } catch (cliErr) {
    const assigneeExpr = targetUsername
      ? `[SELECT Id FROM User WHERE Username = '${targetUsername}' LIMIT 1].Id`
      : "UserInfo.getUserId()";
    const apexCode = `
PermissionSetLicense psl = [SELECT Id FROM PermissionSetLicense WHERE DeveloperName = '${name}' LIMIT 1];
insert new PermissionSetLicenseAssign(
  AssigneeId = ${assigneeExpr},
  PermissionSetLicenseId = psl.Id
);
System.debug('Assigned PSL ${name} via anonymous Apex fallback.');
`.trim();
    try {
      const result = await cli.runApex(apexCode);
      return { path: "apex-fallback", result };
    } catch (apexErr) {
      throw new Error(
        `assign_permset_license failed on both paths for "${name}".\n` +
          `CLI path: ${cliErr instanceof Error ? cliErr.message : String(cliErr)}\n` +
          `Apex fallback: ${apexErr instanceof Error ? apexErr.message : String(apexErr)}`
      );
    }
  }
}

interface PermissionSetLicenseRow {
  Id: string;
  DeveloperName: string;
  MasterLabel: string;
  TotalLicenses?: number;
  UsedLicenses?: number;
}

interface PermissionSetRow {
  Id: string;
  Name: string;
  Label: string;
  License?: { DeveloperName: string } | null;
}

interface SoqlResult<T> {
  records: T[];
  totalSize: number;
}

/** Lists Net Zero Cloud-relevant PSLs and permission sets with assignment/capacity counts. */
export async function listPermissionSets(): Promise<{
  permissionSetLicenses: PermissionSetLicenseRow[];
  permissionSets: PermissionSetRow[];
}> {
  const pslResult = (await cli.runSoql(
    "SELECT Id, DeveloperName, MasterLabel, TotalLicenses, UsedLicenses FROM PermissionSetLicense ORDER BY MasterLabel"
  )) as SoqlResult<PermissionSetLicenseRow>;
  const psResult = (await cli.runSoql(
    "SELECT Id, Name, Label, License.DeveloperName FROM PermissionSet ORDER BY Label"
  )) as SoqlResult<PermissionSetRow>;
  return {
    permissionSetLicenses: pslResult.records ?? [],
    permissionSets: psResult.records ?? [],
  };
}
