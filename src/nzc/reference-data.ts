/**
 * load_reference_data: bulk-inserts the committed reference/emission-factor
 * seed data (data/reference/*.json — see that directory for provenance notes
 * per file) via one `sf data import tree --plan` call against
 * data/reference/reference-load-order.json, which is itself a real plan
 * definition file (verified against @salesforce/plugin-data's
 * DataImportPlanArraySchema — a bare top-level array of `{sobject, files}`,
 * NOT `{items: [...]}` as an earlier draft of this file assumed). The CLI
 * resolves each `files` entry relative to the plan file's own directory
 * (confirmed by reading importPlan.js, not assumed), so the plan lists bare
 * filenames as siblings of itself in data/reference/.
 *
 * Unlike enableNetZeroSettings' metadata deploy, this is NOT idempotent — a
 * second run duplicates every row instead of upserting, because these
 * objects have no external-id field. So before importing, this queries live
 * COUNT()s for each of the 14 root sobjects in the plan and refuses by
 * default if any already has rows, requiring explicit `force: true` — a
 * distinct axis of risk from confirmProductionWrite (which guards prod-vs-
 * sandbox, not duplication risk in any org, including a scratch org this ran
 * against twice by mistake).
 *
 * After a successful import, re-queries the same COUNT()s (ground truth from
 * the org, not the seed files' static row counts, which can drift) and
 * writes a ReferenceDataLoadLog marker record — a real, package-provided
 * object (confirmed via describe: custom=false, keyPrefix "18E") that NZC's
 * own built-in reference-data loader already writes to in this project's
 * dev org, using a `LOAD-LOG-<yyyyMMddHHmmssSSS>` Name convention (confirmed
 * from that org's existing rows). This mirrors that same convention. The
 * object carries no other fields worth setting (describe showed only Name +
 * standard system fields as createable) — the rich per-object counts live in
 * this tool's return value, not on the Salesforce record itself.
 *
 * Known, deliberate gaps (not fabricated — see the project plan / commit
 * history): ElectrLifecyclEmssnFctrSet, OthrLifecyclEmssnFctrSet(+Item),
 * BldgSizeCategory, and SustnUomConversion were empty/near-empty in the
 * source org and are not seeded here. BldgEnrgyIntensity rows land under the
 * object's default record type — RecordTypeId was dropped from every export
 * for cross-org portability (a source-org RecordTypeId value is meaningless,
 * and often invalid, in another org).
 */

import { readFile } from "node:fs/promises";
import * as dataTools from "../salesforce/data.js";
import { pluginPath } from "../paths.js";

const PLAN_PATH = pluginPath("data", "reference", "reference-load-order.json");

interface PlanEntry {
  sobject: string;
  files: string[];
}

export interface ReferenceDataLoadResult {
  planEntries: number;
  importResult: unknown;
  /** Live COUNT() per root sobject, queried immediately before the import. */
  countsBefore: Record<string, number>;
  /** Live COUNT() per root sobject, queried immediately after the import. */
  countsAfter: Record<string, number>;
  loadLogId: string;
}

/** COUNT() per sobject, queried in parallel — each is an independent, stateless `sf data query` call. */
async function countsBySobject(sobjects: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  await Promise.all(
    sobjects.map(async (sobject) => {
      const result = (await dataTools.runSoql(`SELECT COUNT() FROM ${sobject}`)) as { totalSize: number };
      counts[sobject] = result.totalSize;
    })
  );
  return counts;
}

/** Matches the `LOAD-LOG-<yyyyMMddHHmmssSSS>` convention already in use by NZC's own built-in loader (see file header). */
function loadLogName(): string {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `LOAD-LOG-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${pad(now.getUTCMilliseconds(), 3)}`
  );
}

export async function loadReferenceData(opts: { force?: boolean } = {}): Promise<ReferenceDataLoadResult> {
  // Pre-check: NZC must be licensed/provisioned before any of this data model exists.
  try {
    await dataTools.describeSObject("StnryAssetEnvrSrc");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Net Zero Cloud does not appear to be licensed/provisioned on this org — ` +
        `describe_sobject("StnryAssetEnvrSrc") failed: ${detail}. ` +
        `Enable Net Zero Cloud licensing in Setup before running this tool.`
    );
  }

  const planRaw = await readFile(PLAN_PATH, "utf8");
  const plan = JSON.parse(planRaw) as PlanEntry[];
  // Root sobjects only — sufficient signal for "already loaded", since every child tier in this
  // seed is nested inside its parent's file and can't be non-empty while its root is empty.
  const sobjects = plan.map((entry) => entry.sobject);

  const countsBefore = await countsBySobject(sobjects);
  const alreadyLoaded = Object.entries(countsBefore).filter(([, count]) => count > 0);
  if (alreadyLoaded.length > 0 && !opts.force) {
    const detail = alreadyLoaded.map(([sobject, count]) => `${sobject} (${count} rows)`).join(", ");
    throw new Error(
      `Refusing to load reference data — these objects already have rows, and this import is a pure insert, ` +
        `not an upsert (re-running it will duplicate data): ${detail}. ` +
        `Pass force: true only after confirming with the user that duplication is intended — e.g. this really is ` +
        `an empty target and the counts above are from unrelated data.`
    );
  }

  const importResult = await dataTools.importTree(PLAN_PATH);
  const countsAfter = await countsBySobject(sobjects);

  const loadLog = (await dataTools.createRecord("ReferenceDataLoadLog", { Name: loadLogName() })) as { id: string };

  return {
    planEntries: plan.length,
    importResult,
    countsBefore,
    countsAfter,
    loadLogId: loadLog.id,
  };
}
