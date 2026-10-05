/** Full DCH setup: the foundation, then every framework (GRI → ESRS → CDP → SASB), as in the DCH project's setup_DCH flow. */

import { requireConfirm, type StepResult } from "./common.js";
import { setupDchFoundation } from "./foundation.js";
import { DCH_FRAMEWORKS, setupDchFramework } from "./frameworks.js";

export async function setupDch(opts: { confirm?: boolean } = {}): Promise<{ stage: string; steps: StepResult[] }[]> {
  requireConfirm(opts.confirm, "run the full DCH setup");
  const stages: { stage: string; steps: StepResult[] }[] = [];

  const foundation = await setupDchFoundation({ confirm: true });
  stages.push({ stage: "foundation", steps: foundation });
  if (foundation.some((s) => s.status === "failed")) return stages;

  for (const framework of DCH_FRAMEWORKS) {
    const steps = await setupDchFramework(framework, { confirm: true });
    stages.push({ stage: framework, steps });
    if (steps.some((s) => s.status === "failed")) break;
  }
  return stages;
}
