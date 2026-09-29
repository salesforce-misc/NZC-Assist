/**
 * Org connection tools: check_nzc_setup, list_sf_orgs, set_target_org, open_org.
 *
 * Org-selection behavior follows CLAUDE.md's "Org Selection" rules: auto-select
 * when exactly one org is authenticated, surface the full list and ask once when
 * there are several, and never re-ask once set_target_org has been called.
 */

import * as cli from "./cli.js";

export interface OrgSummary {
  alias?: string;
  username: string;
  orgId?: string;
  isDefaultUsername?: boolean;
  instanceUrl?: string;
  /** Matches `sf org list --json`'s actual field name — NOT `isScratchOrg`. */
  isScratch?: boolean;
  isSandbox?: boolean;
}

interface SfOrgListResult {
  nonScratchOrgs?: OrgSummary[];
  scratchOrgs?: OrgSummary[];
}

async function getCliVersion(): Promise<string | null> {
  try {
    return (await cli.version()).trim();
  } catch {
    return null;
  }
}

export async function listSfOrgs(): Promise<OrgSummary[]> {
  const result = (await cli.listOrgs()) as SfOrgListResult;
  return [...(result.nonScratchOrgs ?? []), ...(result.scratchOrgs ?? [])];
}

export interface SetupStatus {
  cliInstalled: boolean;
  cliVersion: string | null;
  orgs: OrgSummary[];
  targetOrg: string | undefined;
  autoSelected: boolean;
  needsSelection: boolean;
}

/**
 * Checks CLI install + authenticated orgs + current target. Auto-selects the
 * lone org when there's exactly one and none is selected yet; otherwise
 * leaves selection to an explicit set_target_org call.
 */
export async function checkNzcSetup(): Promise<SetupStatus> {
  const cliVersion = await getCliVersion();
  if (!cliVersion) {
    return {
      cliInstalled: false,
      cliVersion: null,
      orgs: [],
      targetOrg: undefined,
      autoSelected: false,
      needsSelection: false,
    };
  }

  const orgs = await listSfOrgs();
  let targetOrg = cli.getTargetOrg();
  let autoSelected = false;

  if (!targetOrg && orgs.length === 1) {
    const only = orgs[0];
    const alias = only.alias ?? only.username;
    cli.setTargetOrg(alias);
    targetOrg = alias;
    autoSelected = true;
  }

  return {
    cliInstalled: true,
    cliVersion,
    orgs,
    targetOrg,
    autoSelected,
    needsSelection: !targetOrg && orgs.length > 1,
  };
}

export function setTargetOrg(alias: string): { targetOrg: string } {
  cli.setTargetOrg(alias);
  return { targetOrg: alias };
}

export async function openOrg(path?: string): Promise<unknown> {
  return cli.openOrg(path);
}

/**
 * Cache of the last resolved alias → production-status lookup. `sf org list
 * --json` re-validates every authenticated org's connection on each call —
 * on a machine with many orgs authenticated this can take several seconds —
 * and the production-write guard calls isProductionOrg on every single
 * mutating tool invocation, so re-resolving from scratch each time would
 * make every guarded call pay that cost. Keyed by alias (size 1 is enough:
 * only one org is ever the current target at a time); a call for a
 * different alias simply misses and re-resolves.
 */
let productionStatusCache: { alias: string; isProduction: boolean } | undefined;

/** True when the given org is production-type (not a scratch org or sandbox). Write tools must refuse-by-default when this is true. */
export async function isProductionOrg(alias: string): Promise<boolean> {
  if (productionStatusCache?.alias === alias) return productionStatusCache.isProduction;
  const orgs = await listSfOrgs();
  const match = orgs.find((o) => o.alias === alias || o.username === alias);
  // Unknown org — treat as production until proven otherwise.
  const isProduction = !match || (!match.isScratch && !match.isSandbox);
  productionStatusCache = { alias, isProduction };
  return isProduction;
}
