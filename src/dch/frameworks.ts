/**
 * Per-framework DCH setup (GRI, ESRS, CDP, SASB): install the framework
 * package, deploy its OmniStudio resources and page layouts, then upload and
 * link its report templates. Step order follows the DCH project's flows.
 */

import { licenseGate, deployDchDir, requireConfirm, runSteps, type StepResult } from "./common.js";
import { installDchPackage } from "./packages.js";
import { loadDchTemplates, type DchFramework } from "./templates.js";

/** Source directories under metadata/dch/, in deploy order (before the template upload, then after). */
const FRAMEWORKS: Record<DchFramework, { before: string[]; after: string[] }> = {
  gri: { before: ["gri", "layouts"], after: ["gri-disclosure"] },
  esrs: { before: ["esrs", "layouts"], after: ["esrs-disclosure"] },
  cdp: { before: ["cdp", "layouts"], after: [] },
  sasb: { before: ["sasb", "sasb-action-flows", "layouts"], after: [] },
};

export const DCH_FRAMEWORKS = Object.keys(FRAMEWORKS) as DchFramework[];

export async function setupDchFramework(
  framework: DchFramework,
  opts: { confirm?: boolean; packageVersion?: string } = {}
): Promise<StepResult[]> {
  requireConfirm(opts.confirm, `set up the DCH ${framework} framework`);
  const spec = FRAMEWORKS[framework];
  if (!spec) throw new Error(`Unknown framework "${framework}". Expected one of: ${DCH_FRAMEWORKS.join(", ")}.`);

  const results = await runSteps([
    ["license-gate", async () => licenseGate()],
    [
      `install-${framework}`,
      async () => {
        const r = await installDchPackage(framework, { version: opts.packageVersion });
        return r.skipped ? { skipped: r.skipped } : { detail: r };
      },
    ],
    ...spec.before.map((dir): [string, () => Promise<void>] => [`deploy-${dir}`, async () => void (await deployDchDir(dir))]),
  ]);
  if (results.some((r) => r.status === "failed")) return results;

  results.push(...(await loadDchTemplates(framework)));
  if (results.some((r) => r.status === "failed")) return results;

  results.push(
    ...(await runSteps(spec.after.map((dir): [string, () => Promise<void>] => [`deploy-${dir}`, async () => void (await deployDchDir(dir))])))
  );
  return results;
}
