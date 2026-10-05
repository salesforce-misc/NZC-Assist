/**
 * create_scratch_org / delete_scratch_org: provisions a disposable,
 * non-production Net Zero Cloud org for testing — this plugin's own M8
 * dry-run testing, and the same path end users can take instead of ever
 * running write tools against a production org.
 *
 * Scope is deliberately narrow: create the org from
 * config/project-scratch-def.json (which bakes NZC licensing in via the
 * `SustainabilityApp` feature + `industriesSettings.enableSC*` flags, so the
 * org is already licensed the moment it exists), target it, and confirm the
 * license actually landed. PSL/permset assignment, Industries settings
 * metadata deploy, record types, reference data, and sample data are each
 * already their own tool/command (assign_permset[_license],
 * enable_net_zero_settings, deploy_metadata, load_reference_data,
 * scaffold_sample_data) — this module does not re-orchestrate them, so
 * there's exactly one place that owns each step's PSL/permset/settings
 * names rather than two copies drifting apart.
 */

import * as cli from "../salesforce/cli.js";
import * as dataTools from "../salesforce/data.js";
import { pluginPath } from "../paths.js";

const SCRATCH_DEFS = {
  nzc: pluginPath("config", "project-scratch-def.json"),
  dch: pluginPath("config", "dch-scratch-def.json"),
} as const;

export type ScratchDefinition = keyof typeof SCRATCH_DEFS;

interface SfOrgListResult {
  devHubs?: { alias?: string; username: string }[];
}

async function hasAnyDevHub(): Promise<boolean> {
  const result = (await cli.listOrgs()) as SfOrgListResult;
  return (result.devHubs?.length ?? 0) > 0;
}

export interface CreateScratchOrgResult {
  alias: string;
  createResult: unknown;
  licenseProbe: { provisioned: boolean; detail?: string };
}

export async function createNzcScratchOrg(opts: {
  alias: string;
  confirm?: boolean;
  devHub?: string;
  durationDays?: number;
  setAsTarget?: boolean;
  /** Which bundled scratch-def to use: "nzc" (default) or "dch" (adds OmniStudio/DocGen/DisclosureFramework). */
  definitionFile?: ScratchDefinition;
}): Promise<CreateScratchOrgResult> {
  if (opts.confirm !== true) {
    throw new Error(
      "Refusing to create a scratch org without confirm: true. This creates a real org against a DevHub and " +
        "consumes its scratch-org quota — confirm with the user first (which DevHub alias, if more than one is " +
        "authenticated, per CLAUDE.md's Org Selection rules), then re-invoke with confirm: true."
    );
  }

  if (!opts.devHub && !(await hasAnyDevHub())) {
    throw new Error(
      "No DevHub is authenticated. Run `sf org login web --set-default-dev-hub --alias <alias>` first, or pass " +
        "devHub explicitly."
    );
  }

  const createResult = await cli.createScratchOrg(SCRATCH_DEFS[opts.definitionFile ?? "nzc"], opts.alias, {
    devHub: opts.devHub,
    durationDays: opts.durationDays,
    setDefault: false,
  });

  if (opts.setAsTarget !== false) {
    cli.setTargetOrg(opts.alias);
  }

  let licenseProbe: { provisioned: boolean; detail?: string };
  try {
    await dataTools.describeSObject("StnryAssetEnvrSrc");
    licenseProbe = { provisioned: true };
  } catch (err) {
    licenseProbe = {
      provisioned: false,
      detail:
        (err instanceof Error ? err.message : String(err)) +
        " — the scratch-def's SustainabilityApp feature may not have provisioned the license as expected; check config/project-scratch-def.json.",
    };
  }

  return { alias: opts.alias, createResult, licenseProbe };
}

export async function deleteNzcScratchOrg(alias: string, confirm?: boolean): Promise<unknown> {
  if (confirm !== true) {
    throw new Error(
      "Refusing to delete scratch org without confirm: true — this permanently destroys the org and all its data."
    );
  }
  return cli.deleteScratchOrg(alias);
}
