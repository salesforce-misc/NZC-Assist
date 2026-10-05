/**
 * Shared plumbing for the Disclosure & Compliance Hub (DCH) setup tools: a
 * per-step result shape, the confirm/license gates, and the source-format
 * metadata deploy helper.
 *
 * Every setup tool returns a step-by-step report rather than a single
 * pass/fail, and stops at the first hard failure — later steps depend on
 * earlier ones (packages before the resources that reference them).
 */

import * as cli from "../salesforce/cli.js";
import * as dataTools from "../salesforce/data.js";
import { pluginPath } from "../paths.js";

/** Folder holding metadata/dch's sfdx-project.json; every DCH source dir sits inside one of its package directories. */
export const DCH_PROJECT_DIR = pluginPath("metadata", "dch");

export type StepStatus = "ok" | "skipped" | "failed";

export interface StepResult {
  step: string;
  status: StepStatus;
  detail?: unknown;
}

/** What a step body returns: nothing (ok), extra detail, or `skipped` with the reason. */
export type StepOutcome = void | { skipped?: string; detail?: unknown };

export async function runStep(step: string, body: () => Promise<StepOutcome>): Promise<StepResult> {
  try {
    const outcome = await body();
    if (outcome && outcome.skipped !== undefined) return { step, status: "skipped", detail: outcome.skipped };
    return { step, status: "ok", detail: outcome ? outcome.detail : undefined };
  } catch (err) {
    return { step, status: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Runs step bodies in order, stopping after the first failure. */
export async function runSteps(steps: [string, () => Promise<StepOutcome>][]): Promise<StepResult[]> {
  const results: StepResult[] = [];
  for (const [name, body] of steps) {
    const result = await runStep(name, body);
    results.push(result);
    if (result.status === "failed") break;
  }
  return results;
}

export function requireConfirm(confirm: boolean | undefined, what: string): void {
  if (confirm !== true) {
    throw new Error(
      `Refusing to ${what} without confirm: true. This installs managed packages and deploys metadata to the ` +
        `target org, and package installs are hard to reverse — confirm the target org with the user first, then ` +
        `re-invoke with confirm: true.`
    );
  }
}

/** Same gate as every other NZC write path: DCH builds on Net Zero Cloud, so stop early on an unlicensed org. */
export async function licenseGate(): Promise<void> {
  try {
    await dataTools.describeSObject("StnryAssetEnvrSrc");
  } catch (err) {
    throw new Error(
      `Net Zero Cloud does not appear to be licensed/provisioned on this org — describe_sobject("StnryAssetEnvrSrc") ` +
        `failed: ${err instanceof Error ? err.message : String(err)}. Nothing was changed.`
    );
  }
}

/** Deploys one of the source-format directories under metadata/dch/. */
export async function deployDchDir(dir: string): Promise<unknown> {
  return cli.deploySourceDir(dir, DCH_PROJECT_DIR);
}

export function soqlString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

interface SoqlResult<T> {
  records: T[];
}

export async function query<T>(soql: string, tooling = false): Promise<T[]> {
  const result = (await dataTools.runSoql(soql, tooling)) as SoqlResult<T>;
  return result.records ?? [];
}
