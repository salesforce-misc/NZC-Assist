/**
 * scaffold_sample_data: loads the hybrid seed tier (data/seed/*) — the
 * accounts/suppliers relational graph, the annual emissions inventory
 * container, and the stationary/vehicle/scope3 emission sources — against
 * the connected org, following the dependency order fixed in JOURNEY_MAP.md
 * Part 2 (steps 10-12) and the project plan §9.
 *
 * Two committed seed formats, two loaders:
 *
 *   - Tree-import format (data/seed/accounts.json, suppliers.json, driven by
 *     accounts-suppliers-plan.json) — plain `sf data import tree --plan`,
 *     the same mechanism load_reference_data uses. Before importing, this
 *     preflight-checks every target sobject's *actually*-required fields
 *     (createable, not nillable, not defaultedOnCreate) against the fields
 *     present in the committed JSON, because an org can have installed-
 *     package fields the portable seed data was never written to know about
 *     — concretely, this project's dev org has Supplier.DitchCarbonID__c,
 *     required with no default, from an installed "Ditch Carbon" ISV package
 *     (siblings: Ditch_Carbon_Org_Relationship_Type__c,
 *     Ditch_Carbon_Sync_Status__c, Ditch_Carbon_Score__c) — not a stock NZC
 *     field. See preflightTreeImportPlan() below for exactly what it will
 *     and won't auto-fill, and what it refuses outright.
 *
 *   - "Symbolic seed" format (data/seed/{stnry,vehicle,scope3}-sources.json,
 *     annual-inventory.json) — a format specific to this project (NOT an sf
 *     data import tree shape), because these records' lookups cross the
 *     boundary into the separately-loaded data/reference/ tier, which tree
 *     import's own @Ref mechanism cannot reach (it only resolves
 *     referenceIds created within the same import call). Each record names
 *     its RecordType by DeveloperName and its lookups by
 *     {sobject, field, value} — a natural key resolved via SOQL at runtime,
 *     erroring hard on zero or multiple matches rather than guessing.
 *     (data/reference/10-building-energy-intensity.json has one genuine
 *     duplicate Name — "South - West South Central - 25,001 to 50,000 sqft -
 *     CBECS 2018" — so a silent LIMIT 1 here could wire a source to the
 *     wrong factor with no visible error.) See loadSymbolicSeedFile() below.
 *
 * Tier 6 — generated transactional records (data/generators/*.spec.yaml):
 * once tiers 1-5 land the accounts/suppliers/inventory/sources graph above,
 * this same function generates the *volume* tiers (StnryAssetEnrgyUse,
 * VehicleAssetEnrgyUse, GeneratedWaste, StnryAssetWaterActvty, the four
 * Scope3 travel USE objects, and Scope3PcmtItem) rather than requiring a
 * second tool call. Design principle: every generated child record reuses
 * its own already-loaded parent's own already-resolved emission-factor
 * lookup Id(s) (e.g. each StnryAssetEnvrSrc's ElectricityEmssnFctrId) rather
 * than independently re-resolving a factor per record — this guarantees
 * coherence with how the source itself is configured and avoids a whole
 * class of "child points at a factor its own parent disagrees with" bugs,
 * at the cost of the generated data being less independently random than a
 * from-scratch generator might be. Each generator's tunables (target count,
 * date window, small enum/range pools) live in one data/generators/*.yaml
 * file per tier — loaded via loadGeneratorSpec() — but the relational
 * coherence logic itself (which parent(s) to use, which factor field to
 * copy, the Scope3PcmtItem shell-creation prerequisite) is plain TypeScript,
 * not a declarative interpreter, because it genuinely differs tier to tier
 * and forcing it into flat config would need escape hatches anyway. See the
 * "tier 6" section below for the per-tier design notes and exact field names
 * (all confirmed via live `sf sobject describe`, never guessed).
 *
 * Still out of scope for this function (tracked separately — see
 * JOURNEY_MAP.md / the project plan §9): every *footprint* object
 * (StnryAssetCrbnFtprnt, VehicleAssetCrbnFtprnt, WasteFootprint,
 * StnryAssetWaterFtprnt) — see calculate_footprints. The one exception is
 * Scope3CrbnFtprnt, where a minimal shell record is created here purely as
 * a load-bearing parent for Scope3PcmtSummary/Scope3PcmtItem (see
 * generateScope3Procurement's doc comment) — calculate_footprints should
 * find and complete that shell rather than create a duplicate.
 *
 * Idempotency: every object touched here is a pure insert (no external-id
 * field), so re-running duplicates rows rather than upserting. Rather than
 * refusing whenever the target sobjects have *any* rows (too aggressive for
 * a standard object like Account, which an org may already have unrelated
 * data in), this checks specifically for this seed's own anchor record
 * (the "Meridian Industries, Inc." Account) and refuses only on that exact
 * collision, same spirit as load_reference_data's count-based guard but
 * scoped to what this tool actually owns.
 *
 * Every created record is tracked in an in-memory "fixture" list and, on
 * success (or on a partial failure — see the try/catch in
 * scaffoldSampleData), persisted to data/fixtures/<fixtureId>.json so
 * teardownSampleData can delete everything in exact reverse order later.
 */

import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { parse as parseYaml } from "yaml";
import * as dataTools from "../salesforce/data.js";
import { pluginPath } from "../paths.js";

// ───────── shared types ─────────

interface SymbolicLookup {
  sobject: string;
  field: string;
  value: string;
}

interface SymbolicRecord {
  referenceId: string;
  recordType?: string;
  fields: Record<string, unknown>;
  lookups?: Record<string, SymbolicLookup>;
}

interface SymbolicSeedFile {
  sobject: string;
  records: SymbolicRecord[];
}

interface DescribeField {
  name: string;
  type: string;
  nillable: boolean;
  createable: boolean;
  defaultedOnCreate: boolean;
}

interface DescribeResult {
  fields: DescribeField[];
}

interface TreePlanEntry {
  sobject: string;
  files: string[];
}

/** One created record, tracked for reverse-order teardown. */
interface FixtureRecord {
  sobject: string;
  id: string;
}

export interface ScaffoldSampleDataResult {
  fixtureId: string;
  created: Record<string, number>;
  warnings: string[];
  notYetImplemented: string[];
}

export interface TeardownResult {
  fixtureId: string;
  deleted: Record<string, number>;
  errors: string[];
}

// ───────── small utilities ─────────

/** Escapes a value for safe interpolation into a single-quoted SOQL string literal. */
function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Matches the LOAD-LOG-<yyyyMMddHHmmssSSS> convention already used by reference-data.ts's loadLogName(). */
function timestampId(prefix: string): string {
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return (
    `${prefix}-${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}${pad(now.getUTCMilliseconds(), 3)}`
  );
}

const FIXTURES_DIR = pluginPath("data", "fixtures");

async function writeFixtureManifest(fixtureId: string, records: FixtureRecord[]): Promise<void> {
  await mkdir(FIXTURES_DIR, { recursive: true });
  await writeFile(join(FIXTURES_DIR, `${fixtureId}.json`), JSON.stringify(records, null, 2), "utf8");
}

async function readFixtureManifest(fixtureId: string): Promise<FixtureRecord[]> {
  let raw: string;
  try {
    raw = await readFile(join(FIXTURES_DIR, `${fixtureId}.json`), "utf8");
  } catch {
    throw new Error(`No fixture manifest found for teardownId "${fixtureId}" under data/fixtures/.`);
  }
  return JSON.parse(raw) as FixtureRecord[];
}

// ───────── lookup / record type resolution (with in-run caching) ─────────

/**
 * Resolves a natural-key lookup ({sobject, field, value}) to a real Id via
 * SOQL, erroring hard on zero or multiple matches rather than picking one —
 * see file header re: the genuine duplicate Name in
 * data/reference/10-building-energy-intensity.json. Cached per
 * (sobject, field, value) within one call, since the same target (e.g. the
 * "Standard GHG Protocol Fuel-to-Scope Allocation" factor set) is looked up
 * by several different source records in the same run.
 */
function makeLookupResolver(): (lookup: SymbolicLookup) => Promise<string> {
  const cache = new Map<string, Promise<string>>();

  async function resolveOne(sobject: string, field: string, value: string): Promise<string> {
    const query = `SELECT Id FROM ${sobject} WHERE ${field} = '${soqlEscape(value)}'`;
    const result = (await dataTools.runSoql(query)) as { totalSize: number; records: Array<{ Id: string }> };
    if (result.totalSize === 0) {
      throw new Error(
        `Lookup resolution failed — no ${sobject} record has ${field} = "${value}". Check that the reference/seed ` +
          `tier this depends on was loaded first (load_reference_data), and that the Name matches exactly.`
      );
    }
    if (result.totalSize > 1) {
      throw new Error(
        `Lookup resolution is ambiguous — ${result.totalSize} ${sobject} records have ${field} = "${value}". ` +
          `Refusing to guess which one to link (this exact ambiguity exists for real in ` +
          `data/reference/10-building-energy-intensity.json's CBECS 2018 rows). Disambiguate by a different field, ` +
          `or fix the duplicate in the source data, before retrying.`
      );
    }
    return result.records[0].Id;
  }

  return function resolveLookup(lookup: SymbolicLookup): Promise<string> {
    const key = `${lookup.sobject}::${lookup.field}::${lookup.value}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = resolveOne(lookup.sobject, lookup.field, lookup.value);
      cache.set(key, pending);
    }
    return pending;
  };
}

/** Same never-guess discipline as makeLookupResolver, for RecordType {SObjectType, DeveloperName} lookups. */
function makeRecordTypeResolver(): (sobject: string, developerName: string) => Promise<string> {
  const cache = new Map<string, Promise<string>>();

  async function resolveOne(sobject: string, developerName: string): Promise<string> {
    const query =
      `SELECT Id FROM RecordType WHERE SObjectType = '${soqlEscape(sobject)}' ` +
      `AND DeveloperName = '${soqlEscape(developerName)}'`;
    const result = (await dataTools.runSoql(query)) as { totalSize: number; records: Array<{ Id: string }> };
    if (result.totalSize === 0) {
      throw new Error(
        `Record type resolution failed — ${sobject} has no record type with DeveloperName "${developerName}". ` +
          `Confirm this record type was deployed (see metadata/record-types/) before running scaffold_sample_data.`
      );
    }
    if (result.totalSize > 1) {
      throw new Error(
        `Record type resolution is ambiguous — ${result.totalSize} record types on ${sobject} matched ` +
          `DeveloperName "${developerName}".`
      );
    }
    return result.records[0].Id;
  }

  return function resolveRecordType(sobject: string, developerName: string): Promise<string> {
    const key = `${sobject}::${developerName}`;
    let pending = cache.get(key);
    if (!pending) {
      pending = resolveOne(sobject, developerName);
      cache.set(key, pending);
    }
    return pending;
  };
}

// ───────── tier 1: accounts + suppliers (tree-import, preflight-patched) ─────────

/**
 * Copies a tree-import plan (and the files it references) into a temp
 * directory, auto-filling any field describe reports as truly required on
 * insert but absent from the committed seed data — see file header. Only
 * auto-fills plain string/textarea fields, with an obviously-synthetic
 * `SAMPLE-<referenceId>-<FieldName>` value, and always records a loud
 * warning. Refuses (throws) for any other field type — a lookup Id or
 * picklist value can't be safely fabricated without either creating a
 * dangling reference or violating the org's real constraints; a required
 * field of those kinds needs a human decision, not a guess.
 *
 * Never mutates the committed files under data/seed/ — always writes to a
 * fresh temp directory, which the caller is responsible for removing.
 *
 * Also collects each file's record Names per sobject (namesBySobject) —
 * not needed on the success path (see reconcileCreatedByName's doc comment
 * for why), but kept as the input to that function's partial-failure
 * recovery path.
 */
async function preflightTreeImportPlan(planPath: string): Promise<{
  tempDir: string;
  patchedPlanPath: string;
  warnings: string[];
  namesBySobject: Record<string, string[]>;
}> {
  const planDir = dirname(planPath);
  const plan = JSON.parse(await readFile(planPath, "utf8")) as TreePlanEntry[];
  const tempDir = await mkdtemp(join(tmpdir(), "nzc-seed-"));
  const warnings: string[] = [];
  const namesBySobject: Record<string, string[]> = {};

  for (const entry of plan) {
    const describeResult = (await dataTools.describeSObject(entry.sobject)) as DescribeResult;
    const requiredFields = new Set(
      describeResult.fields.filter((f) => f.createable && !f.nillable && !f.defaultedOnCreate).map((f) => f.name)
    );
    const fieldTypeByName = new Map(describeResult.fields.map((f) => [f.name, f.type]));

    for (const fileName of entry.files) {
      const original = JSON.parse(await readFile(join(planDir, fileName), "utf8")) as {
        records: Array<Record<string, unknown> & { attributes: { type: string; referenceId: string } }>;
      };

      const presentFields = new Set<string>();
      for (const record of original.records) {
        for (const key of Object.keys(record)) if (key !== "attributes") presentFields.add(key);
      }
      const missingRequired = [...requiredFields].filter((f) => !presentFields.has(f));

      // Phase 1: validate every missing-required field is auto-fillable before mutating anything.
      for (const field of missingRequired) {
        const type = fieldTypeByName.get(field);
        if (type !== "string" && type !== "textarea") {
          throw new Error(
            `${entry.sobject}.${field} is required on insert (createable, not nillable, not defaulted) but is ` +
              `absent from the committed seed data, and is a "${type}" field — auto-fill only supports plain ` +
              `string/textarea fields (a lookup Id or a value guaranteed to satisfy a picklist/other constraint ` +
              `can't be safely fabricated). This usually means an installed package added a required field this ` +
              `org-agnostic seed data doesn't know about (e.g. this project's own Supplier.DitchCarbonID__c, from ` +
              `an installed "Ditch Carbon" package). Add a real value for it to data/seed/${fileName}, or make the ` +
              `field optional/defaulted in this org, then retry.`
          );
        }
        warnings.push(
          `Auto-filled required field ${entry.sobject}.${field} with synthetic SAMPLE-* placeholder values — it ` +
            `is not part of the portable seed data (likely an org-specific/installed-package field not present in ` +
            `a stock Net Zero Cloud org). Review and replace before treating this as real data.`
        );
      }

      // Phase 2: mutate (safe now — every field in missingRequired is confirmed string/textarea).
      for (const record of original.records) {
        for (const field of missingRequired) {
          record[field] = `SAMPLE-${record.attributes.referenceId}-${field}`;
        }
      }

      const names = original.records.map((r) => r.Name).filter((n): n is string => typeof n === "string");
      if (names.length > 0) {
        namesBySobject[entry.sobject] = [...(namesBySobject[entry.sobject] ?? []), ...names];
      }

      await writeFile(join(tempDir, fileName), JSON.stringify(original, null, 2), "utf8");
    }
  }

  const patchedPlanPath = join(tempDir, basename(planPath));
  await writeFile(patchedPlanPath, JSON.stringify(plan, null, 2), "utf8");
  return { tempDir, patchedPlanPath, warnings, namesBySobject };
}

/**
 * Re-queries created records by Name and pushes them into the fixture list.
 * NOT the primary way scaffoldSampleData learns what got created — `sf data
 * import tree --json`'s real result shape (verified against the installed
 * @salesforce/plugin-data@5.1.7 source: lib/api/data/tree/importPlan.js:78-84
 * builds `{refId, type, id}` per record; lib/commands/data/import/tree.js:
 * 52-71 returns it as-is; sf-plugins-core's sfCommand.js wraps it as
 * `{status, result, warnings}`, which cli.ts's sfJson<T>() already unwraps
 * to just `result`) gives exact {sobject, id} pairs with no query needed.
 * This function exists only for the rarer case where importTree() itself
 * throws partway through a multi-file plan — some earlier file's records
 * may have already landed in the org with no {refId, type, id} ever
 * returned for them, so this is the best-effort way to find and fixture-
 * track them instead of leaving them orphaned. Assumes seed-scale record
 * counts (tens, not thousands) — one unchunked WHERE Name IN (...) is fine
 * for this project's deliberately small, hand-curated data/seed/ tier; a
 * larger tier would need chunking.
 */
async function reconcileCreatedByName(
  sobject: string,
  names: string[],
  fixture: FixtureRecord[]
): Promise<{ count: number; warning?: string }> {
  if (names.length === 0) return { count: 0 };
  const inList = names.map((n) => `'${soqlEscape(n)}'`).join(", ");
  const result = (await dataTools.runSoql(`SELECT Id FROM ${sobject} WHERE Name IN (${inList})`)) as {
    totalSize: number;
    records: Array<{ Id: string }>;
  };
  for (const record of result.records) fixture.push({ sobject, id: record.Id });
  const warning =
    result.totalSize !== names.length
      ? `Expected ${names.length} ${sobject} records by Name after import, found ${result.totalSize} — either a ` +
        `Name collided with a pre-existing record, or the import partially failed. Review before trusting counts.`
      : undefined;
  return { count: result.totalSize, warning };
}

// ───────── tiers 2-5: symbolic seed files ─────────

/**
 * Loads one "symbolic seed" file (see file header) — resolves every
 * record's recordType and lookups to real Ids, then creates the record for
 * real via dataTools.createRecord. Records are created sequentially (not
 * Promise.all'd) so a mid-file failure leaves a predictable prefix of
 * records created, matching how the fixture manifest is meant to be read for
 * teardown (created in file order, always undone in exact reverse order).
 */
async function loadSymbolicSeedFile(
  filePath: string,
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  resolveRecordType: (sobject: string, developerName: string) => Promise<string>
): Promise<{ sobject: string; count: number }> {
  const raw = await readFile(filePath, "utf8");
  const file = JSON.parse(raw) as SymbolicSeedFile;

  let count = 0;
  for (const record of file.records) {
    const fields: Record<string, unknown> = { ...record.fields };

    if (record.recordType) {
      fields.RecordTypeId = await resolveRecordType(file.sobject, record.recordType);
    }
    for (const [targetField, lookup] of Object.entries(record.lookups ?? {})) {
      fields[targetField] = await resolveLookup(lookup);
    }

    const created = (await dataTools.createRecord(file.sobject, fields)) as { id: string };
    fixture.push({ sobject: file.sobject, id: created.id });
    count++;
  }
  return { sobject: file.sobject, count };
}

// ───────── tier 6: generated transactional records (data/generators/*.spec.yaml) ─────────

interface GeneratorSpec {
  sobject: string;
  targetCount: number;
  dateWindow?: { start: string; end: string };
  notes?: string;
  [key: string]: unknown;
}

/** Loads and minimally validates one data/generators/*.spec.yaml file. */
async function loadGeneratorSpec(fileName: string): Promise<GeneratorSpec> {
  const raw = await readFile(pluginPath("data", "generators", fileName), "utf8");
  const spec = parseYaml(raw) as GeneratorSpec;
  if (!spec.sobject || typeof spec.targetCount !== "number" || spec.targetCount <= 0) {
    throw new Error(
      `data/generators/${fileName} is missing a required "sobject" string or a positive numeric "targetCount".`
    );
  }
  return spec;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min: number, max: number, decimals: number): number {
  const value = Math.random() * (max - min) + min;
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function randomChoice<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Splits `total` into `buckets` near-even integer parts (remainder to the first buckets), summing to `total`. */
function distributeEvenly(total: number, buckets: number): number[] {
  const base = Math.floor(total / buckets);
  const remainder = total - base * buckets;
  return Array.from({ length: buckets }, (_, i) => base + (i < remainder ? 1 : 0));
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

const MONTH_LABELS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Reads the 4-digit year out of a spec's dateWindow.start, defaulting to 2025 if absent/unparseable. */
function yearFromSpec(spec: GeneratorSpec): number {
  const dateWindow = spec.dateWindow as { start?: string } | undefined;
  const year = Number(dateWindow?.start?.slice(0, 4));
  return Number.isInteger(year) && year > 0 ? year : 2025;
}

/** First/last calendar day of `month` (1-12) in `year` — the "period cadence" for usage-tier records. */
function monthPeriod(year: number, month: number): { start: string; end: string; label: string } {
  const lastDay = new Date(year, month, 0).getDate();
  return {
    start: `${year}-${pad2(month)}-01`,
    end: `${year}-${pad2(month)}-${pad2(lastDay)}`,
    label: MONTH_LABELS[month - 1],
  };
}

/** A random single trip-start day in `year` (leaving room for `tripLengthDays` before year-end) plus its end date. */
function randomTripDates(year: number, tripLengthDays: number): { start: string; end: string } {
  const startOfYear = Date.UTC(year, 0, 1);
  const latestStart = Date.UTC(year, 11, 31 - tripLengthDays);
  const startMs = startOfYear + Math.floor(Math.random() * (latestStart - startOfYear));
  const iso = (ms: number) => {
    const d = new Date(ms);
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  };
  return { start: iso(startMs), end: iso(startMs + tripLengthDays * 86400000) };
}

const TRAVELER_NAMES = [
  "Morgan Chen", "Priya Nair", "Jordan Silva", "Amara Obi", "Liam Fitzgerald",
  "Sofia Rossi", "Kenji Watanabe", "Elena Petrova", "Marcus Webb", "Fatima Al-Sayed",
  "Noah Bergström", "Isabella Cruz",
];

/** Batch-fetches a fixed set of fields for a known list of Ids — one query, not N. */
async function queryFieldsByIds(
  sobject: string,
  ids: string[],
  fields: string[]
): Promise<Map<string, Record<string, unknown>>> {
  if (ids.length === 0) return new Map();
  const idList = ids.map((id) => `'${soqlEscape(id)}'`).join(", ");
  const result = (await dataTools.runSoql(`SELECT ${fields.join(", ")} FROM ${sobject} WHERE Id IN (${idList})`)) as {
    records: Array<Record<string, unknown> & { Id: string }>;
  };
  return new Map(result.records.map((r) => [r.Id, r]));
}

/**
 * Bulk-loads `records` into `sobject` via Bulk API 2.0, then reconciles the created Ids by
 * re-querying on `reconcileWhere` rather than parsing the Bulk API's own results. Verified via
 * `sf data import bulk --help` / `sf data bulk results --help` that `--json`'s result carries only
 * `jobInfo` (id/state/counts) — per-row created Ids require a *second* `sf data bulk results
 * --job-id` call, whose own output is file *paths* to result CSVs, not inline JSON. Parsing those
 * CSVs and trusting row-order to zip results back to inputs is fragile; a direct re-query is not.
 * This is safe specifically because every caller scopes `reconcileWhere` to a parent Id (or Ids)
 * minted moments earlier in this same run — such an Id cannot possibly match any row that existed
 * before this call, so the query can't accidentally pick up unrelated pre-existing org data (a
 * stronger guarantee than reconcileCreatedByName's Name-based matching above, which does have a
 * real collision caveat).
 */
async function bulkLoadAndFixture(
  sobject: string,
  records: Record<string, unknown>[],
  reconcileWhere: string,
  fixture: FixtureRecord[]
): Promise<{ count: number; warning?: string }> {
  if (records.length === 0) return { count: 0 };
  const result = await dataTools.bulkUpsertRecords(sobject, records, { wait: 15 });
  if (result.state !== "JobComplete") {
    throw new Error(
      `Bulk load of ${records.length} ${sobject} record(s) did not reach JobComplete within the wait window ` +
        `(state: "${result.state}", jobId: "${result.jobId}"). Run "sf data bulk results --job-id ${result.jobId}" ` +
        `to inspect it manually — it may still finish asynchronously, but this run cannot safely assume any of ` +
        `these records exist yet, so none were added to the fixture manifest.`
    );
  }
  const found = (await dataTools.runSoql(`SELECT Id FROM ${sobject} WHERE ${reconcileWhere}`)) as {
    totalSize: number;
    records: Array<{ Id: string }>;
  };
  for (const r of found.records) fixture.push({ sobject, id: r.Id });
  const warning =
    found.totalSize !== records.length
      ? `Requested ${records.length} ${sobject} record(s), found ${found.totalSize} after bulk load — some rows ` +
        `may have failed validation. Run "sf data bulk results --job-id ${result.jobId}" for per-row errors.`
      : undefined;
  return { count: found.totalSize, warning };
}

/** Resolves one named Scope3EmssnSrc seed record plus its own already-set factor lookup field. */
async function resolveScope3Source(
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  name: string,
  factorField: string
): Promise<{ id: string; factorId: unknown }> {
  const id = await resolveLookup({ sobject: "Scope3EmssnSrc", field: "Name", value: name });
  const rows = await queryFieldsByIds("Scope3EmssnSrc", [id], ["Id", factorField]);
  return { id, factorId: rows.get(id)?.[factorField] };
}

/**
 * StnryAssetEnrgyUse — pooled across every seeded StnryAssetEnvrSrc parent (round-robin via
 * distributeEvenly). Each row reuses its own parent's ElectricityEmssnFctrId/OtherEmssnFctrId/
 * RefrigerantEmssnFctrId depending on which FuelType it rolled, rather than resolving a factor
 * independently. Required fields confirmed via describe: Name, StnryAssetEnvrSrcId, FuelType.
 */
async function generateStnryAssetEnergyUse(
  fixture: FixtureRecord[],
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "StnryAssetEnrgyUse";
  const parentIds = fixture.filter((r) => r.sobject === "StnryAssetEnvrSrc").map((r) => r.id);
  if (parentIds.length === 0) {
    warnings.push(`Skipped ${sobject} generation — no StnryAssetEnvrSrc records found in this run's fixture.`);
    return { sobject, count: 0 };
  }
  const parentFactors = await queryFieldsByIds("StnryAssetEnvrSrc", parentIds, [
    "Id", "Name", "ElectricityEmssnFctrId", "OtherEmssnFctrId", "RefrigerantEmssnFctrId",
  ]);

  const year = yearFromSpec(spec);
  const fuelPool = (spec.fuelTypePool as string[] | undefined) ?? ["Electricity", "NaturalGas", "FuelOil", "Diesel"];
  const refrigerantChance = (spec.refrigerantChance as number | undefined) ?? 0.08;
  const [consMin, consMax] = (spec.fuelConsumptionRange as [number, number] | undefined) ?? [500, 50000];
  const counts = distributeEvenly(spec.targetCount, parentIds.length);

  const rows: Record<string, unknown>[] = [];
  parentIds.forEach((parentId, i) => {
    const parent = parentFactors.get(parentId);
    const parentName = (parent?.Name as string | undefined) ?? parentId;
    for (let n = 0; n < counts[i]; n++) {
      const useRefrigerant = Math.random() < refrigerantChance;
      const fuelType = useRefrigerant ? "Refrigerant" : randomChoice(fuelPool);
      const { start, end, label } = monthPeriod(year, randomInt(1, 12));
      const row: Record<string, unknown> = {
        Name: `${parentName} — ${fuelType} — ${label} ${year}`,
        StnryAssetEnvrSrcId: parentId,
        FuelType: fuelType,
        StartDate: start,
        EndDate: end,
        FuelConsumption: randomFloat(consMin, consMax, 1),
        FuelConsumptionUnit: fuelType === "Electricity" ? "kWh" : fuelType === "Refrigerant" ? "kG" : "MMBtu",
        CrbnEmssnScopeAlloc: fuelType === "Electricity" ? "SCOPE2" : "SCOPE1",
      };
      if (fuelType === "Electricity" && parent?.ElectricityEmssnFctrId) {
        row.ElectricityEmissionFactorsId = parent.ElectricityEmssnFctrId;
      } else if (fuelType === "Refrigerant" && parent?.RefrigerantEmssnFctrId) {
        row.RefrigerantEmssnFctrId = parent.RefrigerantEmssnFctrId;
      } else if (parent?.OtherEmssnFctrId) {
        row.OtherEmssnFctrId = parent.OtherEmssnFctrId;
      }
      rows.push(row);
    }
  });

  const idList = parentIds.map((id) => `'${soqlEscape(id)}'`).join(", ");
  const { count, warning } = await bulkLoadAndFixture(sobject, rows, `StnryAssetEnvrSrcId IN (${idList})`, fixture);
  if (warning) warnings.push(warning);
  return { sobject, count };
}

/**
 * VehicleAssetEnrgyUse — unlike the pooled stationary tier, the 2 seeded VehicleAssetEmssnSrc
 * parents are resolved by exact Name (not pooled) because each drives a materially different
 * field shape: fleet mileage vs. jet flight hours/aircraft type. Required fields confirmed via
 * describe: Name, VehicleAssetEmssnSrcId, FuelType.
 */
async function generateVehicleAssetEnergyUse(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "VehicleAssetEnrgyUse";
  let fleetId: string;
  let jetId: string;
  try {
    [fleetId, jetId] = await Promise.all([
      resolveLookup({ sobject: "VehicleAssetEmssnSrc", field: "Name", value: "Corporate Fleet - Sedans" }),
      resolveLookup({
        sobject: "VehicleAssetEmssnSrc",
        field: "Name",
        value: "Executive Aviation - Private Jet N421MI",
      }),
    ]);
  } catch (err) {
    warnings.push(
      `Skipped ${sobject} generation — could not resolve both vehicle sources: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
    return { sobject, count: 0 };
  }

  const parentFactors = await queryFieldsByIds("VehicleAssetEmssnSrc", [fleetId, jetId], ["Id", "OtherEmssnFctrId"]);
  const fleetFactor = parentFactors.get(fleetId)?.OtherEmssnFctrId;
  const jetFactor = parentFactors.get(jetId)?.OtherEmssnFctrId;

  const year = yearFromSpec(spec);
  const [fleetCount, jetCount] = (spec.split as [number, number] | undefined) ?? [30, 12];
  const rows: Record<string, unknown>[] = [];

  for (let n = 0; n < fleetCount; n++) {
    const { start, end, label } = monthPeriod(year, randomInt(1, 12));
    const fuelType = randomChoice(["Gasoline", "Diesel", "CompressedNaturalGasCNG", "Electricity"]);
    rows.push({
      Name: `Corporate Fleet - Sedans — ${fuelType} — ${label} ${year}`,
      VehicleAssetEmssnSrcId: fleetId,
      FuelType: fuelType,
      StartDate: start,
      EndDate: end,
      Distance: randomFloat(200, 3000, 1),
      DistanceUnit: "Miles",
      FuelConsumption: fuelType === "Electricity" ? randomFloat(50, 600, 1) : randomFloat(20, 400, 1),
      FuelConsumptionUnit: fuelType === "Electricity" ? "kWh" : "UsGallons",
      CrbnEmssnScopeAlloc: "Scope 1",
      ...(fleetFactor ? { OtherEmssnFctrId: fleetFactor } : {}),
    });
  }
  for (let n = 0; n < jetCount; n++) {
    const { start, end, label } = monthPeriod(year, randomInt(1, 12));
    rows.push({
      Name: `Executive Aviation - Private Jet N421MI — Flight — ${label} ${year}`,
      VehicleAssetEmssnSrcId: jetId,
      FuelType: "JetFuel",
      StartDate: start,
      EndDate: end,
      FlightDate: start,
      FlightDurationInHours: randomFloat(1, 9, 1),
      AircraftType: "Gulfstream G650",
      AircraftFuelEconomy: randomFloat(300, 450, 0),
      AircraftFuelEconomyUnit: "GALLONS_PER_HOUR",
      FuelConsumption: randomFloat(800, 4000, 1),
      FuelConsumptionUnit: "UsGallons",
      CrbnEmssnScopeAlloc: "Scope 1",
      ...(jetFactor ? { OtherEmssnFctrId: jetFactor } : {}),
    });
  }

  const idList = [fleetId, jetId].map((id) => `'${soqlEscape(id)}'`).join(", ");
  const { count, warning } = await bulkLoadAndFixture(
    sobject,
    rows,
    `VehicleAssetEmssnSrcId IN (${idList})`,
    fixture
  );
  if (warning) warnings.push(warning);
  return { sobject, count };
}

const WASTE_TYPES = [
  "Mixed MSW (municipal solid waste)", "Office Paper", "Mixed Recyclables",
  "Food Waste", "Corrugated Containers", "Mixed Plastics",
];
const DISPOSAL_TYPES = ["Landfilled", "Recycled", "Composted", "Combusted"];

/**
 * GeneratedWaste — pooled across every seeded StnryAssetEnvrSrc parent, same shape as
 * StnryAssetEnrgyUse above. Reuses each parent's own WstDispoEmssnFctrSetId. Required fields
 * confirmed via describe: Name, WasteType, DisposedWasteQuantity, DisposedWasteQuantityUnit.
 */
async function generateWaste(
  fixture: FixtureRecord[],
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "GeneratedWaste";
  const parentIds = fixture.filter((r) => r.sobject === "StnryAssetEnvrSrc").map((r) => r.id);
  if (parentIds.length === 0) {
    warnings.push(`Skipped ${sobject} generation — no StnryAssetEnvrSrc records found in this run's fixture.`);
    return { sobject, count: 0 };
  }
  const parentFactors = await queryFieldsByIds("StnryAssetEnvrSrc", parentIds, ["Id", "Name", "WstDispoEmssnFctrSetId"]);
  const year = yearFromSpec(spec);
  const counts = distributeEvenly(spec.targetCount, parentIds.length);

  const rows: Record<string, unknown>[] = [];
  parentIds.forEach((parentId, i) => {
    const parent = parentFactors.get(parentId);
    const parentName = (parent?.Name as string | undefined) ?? parentId;
    for (let n = 0; n < counts[i]; n++) {
      const wasteType = randomChoice(WASTE_TYPES);
      const { start, end, label } = monthPeriod(year, randomInt(1, 12));
      const row: Record<string, unknown> = {
        Name: `${parentName} — ${wasteType} — ${label} ${year}`,
        StnryAssetEnvrSrcId: parentId,
        WasteType: wasteType,
        DisposalType: randomChoice(DISPOSAL_TYPES),
        DisposalSiteType: "Offsite",
        DisposedWasteQuantity: randomFloat(50, 5000, 1),
        DisposedWasteQuantityUnit: "KG",
        IsHazardous: Math.random() < 0.05,
        StartDate: start,
        EndDate: end,
        CrbnEmssnScopeAlloc: "SCP3WasteGeneratedInOperations",
      };
      if (parent?.WstDispoEmssnFctrSetId) row.WstDispoEmssnFctrId = parent.WstDispoEmssnFctrSetId;
      rows.push(row);
    }
  });

  const idList = parentIds.map((id) => `'${soqlEscape(id)}'`).join(", ");
  const { count, warning } = await bulkLoadAndFixture(sobject, rows, `StnryAssetEnvrSrcId IN (${idList})`, fixture);
  if (warning) warnings.push(warning);
  return { sobject, count };
}

/**
 * StnryAssetWaterActvty — pooled across every seeded StnryAssetEnvrSrc parent. No factor lookup
 * field exists on the parent to reuse here, so rows draw from a small realistic activity-type
 * pool instead. Required fields confirmed via describe: Name, StnryAssetEnvrSrcId, ActivityType.
 */
async function generateStnryAssetWaterActivity(
  fixture: FixtureRecord[],
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "StnryAssetWaterActvty";
  const parentIds = fixture.filter((r) => r.sobject === "StnryAssetEnvrSrc").map((r) => r.id);
  if (parentIds.length === 0) {
    warnings.push(`Skipped ${sobject} generation — no StnryAssetEnvrSrc records found in this run's fixture.`);
    return { sobject, count: 0 };
  }
  const parentNames = await queryFieldsByIds("StnryAssetEnvrSrc", parentIds, ["Id", "Name"]);
  const year = yearFromSpec(spec);
  const counts = distributeEvenly(spec.targetCount, parentIds.length);

  const rows: Record<string, unknown>[] = [];
  parentIds.forEach((parentId, i) => {
    const parentName = (parentNames.get(parentId)?.Name as string | undefined) ?? parentId;
    for (let n = 0; n < counts[i]; n++) {
      const activityType = randomChoice(["Consumption", "Consumption", "Consumption", "Discharge", "Withdrawal"]);
      const { start, end, label } = monthPeriod(year, randomInt(1, 12));
      const row: Record<string, unknown> = {
        Name: `${parentName} — Water ${activityType} — ${label} ${year}`,
        StnryAssetEnvrSrcId: parentId,
        ActivityType: activityType,
        Quantity: randomFloat(100, 10000, 1),
        QuantityUnit: "M3",
        StartDate: start,
        EndDate: end,
        ActivitySourceType: "FreshWater",
        WaterDataMeasurement: "DirectMeasurement",
      };
      if (activityType === "Discharge") row.TreatmentType = randomChoice(["Primary", "Secondary", "Tertiary"]);
      rows.push(row);
    }
  });

  const idList = parentIds.map((id) => `'${soqlEscape(id)}'`).join(", ");
  const { count, warning } = await bulkLoadAndFixture(sobject, rows, `StnryAssetEnvrSrcId IN (${idList})`, fixture);
  if (warning) warnings.push(warning);
  return { sobject, count };
}

const COUNTRY_PAIRS: Array<[string, string]> = [
  ["US", "US"], ["US", "US"], ["US", "US"], ["US", "GB"], ["US", "DE"], ["US", "JP"], ["US", "MX"], ["US", "CA"],
];

/**
 * AirTravelEnrgyUse — single fixed parent ("Corporate Air Travel" Scope3EmssnSrc; see file header
 * re: the 1:1 Scope3EmssnSrc-to-tier mapping discovered from the seed data). Reuses the parent's
 * own AirTravelEmssnFctrId. Required fields confirmed via describe: Name, Scope3EmssnSrcId,
 * SegmentDistance.
 */
async function generateAirTravel(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "AirTravelEnrgyUse";
  let source: { id: string; factorId: unknown };
  try {
    source = await resolveScope3Source(resolveLookup, "Corporate Air Travel", "AirTravelEmssnFctrId");
  } catch (err) {
    warnings.push(`Skipped ${sobject} generation: ${err instanceof Error ? err.message : String(err)}`);
    return { sobject, count: 0 };
  }

  const year = yearFromSpec(spec);
  const [minDays, maxDays] = (spec.tripLengthDaysRange as [number, number] | undefined) ?? [1, 5];
  const rows: Record<string, unknown>[] = [];
  for (let n = 0; n < spec.targetCount; n++) {
    const [sourceCountry, destCountry] = randomChoice(COUNTRY_PAIRS);
    const { start, end } = randomTripDates(year, randomInt(minDays, maxDays));
    const traveler = randomChoice(TRAVELER_NAMES);
    const row: Record<string, unknown> = {
      Name: `${traveler} — Air Travel — ${start}`,
      Scope3EmssnSrcId: source.id,
      SegmentDistance: randomFloat(200, 6000, 0),
      SegmentDistanceUnit: "Miles",
      SourceCountry: sourceCountry,
      DestinationCountry: destCountry,
      TravelerName: traveler,
      StartDate: start,
      EndDate: end,
    };
    if (source.factorId) row.AirTravelEmssnFctrId = source.factorId;
    rows.push(row);
  }

  const { count, warning } = await bulkLoadAndFixture(
    sobject,
    rows,
    `Scope3EmssnSrcId = '${soqlEscape(source.id)}'`,
    fixture
  );
  if (warning) warnings.push(warning);
  return { sobject, count };
}

const HOTEL_LOCATIONS: Array<[string, string]> = [
  ["Austin", "US"], ["Columbus", "US"], ["Sacramento", "US"], ["Ashburn", "US"], ["New York", "US"],
  ["Chicago", "US"], ["London", "GB"], ["Berlin", "DE"], ["Tokyo", "JP"],
];

/**
 * HotelStayEnrgyUse — single fixed parent ("Business Travel Hotel Stays" Scope3EmssnSrc). Reuses
 * the parent's own HotelStayEmssnFctrId. Required fields confirmed via describe: Name,
 * Scope3EmssnSrcId, RoomCount.
 */
async function generateHotelStay(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "HotelStayEnrgyUse";
  let source: { id: string; factorId: unknown };
  try {
    source = await resolveScope3Source(resolveLookup, "Business Travel Hotel Stays", "HotelStayEmssnFctrId");
  } catch (err) {
    warnings.push(`Skipped ${sobject} generation: ${err instanceof Error ? err.message : String(err)}`);
    return { sobject, count: 0 };
  }

  const year = yearFromSpec(spec);
  const [minNights, maxNights] = (spec.stayNightsRange as [number, number] | undefined) ?? [1, 5];
  const rows: Record<string, unknown>[] = [];
  for (let n = 0; n < spec.targetCount; n++) {
    const [city, country] = randomChoice(HOTEL_LOCATIONS);
    const nights = randomInt(minNights, maxNights);
    const { start, end } = randomTripDates(year, nights);
    const traveler = randomChoice(TRAVELER_NAMES);
    const row: Record<string, unknown> = {
      Name: `${traveler} — Hotel Stay — ${city} — ${start}`,
      Scope3EmssnSrcId: source.id,
      RoomCount: Math.random() < 0.9 ? 1 : 2,
      StayNightsCount: nights,
      HotelCity: city,
      HotelCountry: country,
      TravelerName: traveler,
      StartDate: start,
      EndDate: end,
    };
    if (source.factorId) row.HotelStayEmssnFctrId = source.factorId;
    rows.push(row);
  }

  const { count, warning } = await bulkLoadAndFixture(
    sobject,
    rows,
    `Scope3EmssnSrcId = '${soqlEscape(source.id)}'`,
    fixture
  );
  if (warning) warnings.push(warning);
  return { sobject, count };
}

const RENTAL_CAR_COMPANIES = ["Hertz", "Enterprise", "Avis", "National"];

/**
 * RentalCarEnrgyUse — single fixed parent ("Business Travel Rental Cars" Scope3EmssnSrc). Reuses
 * the parent's own RentalCarEmssnFctrId. Required fields confirmed via describe: Name,
 * Scope3EmssnSrcId, FuelType.
 */
async function generateRentalCar(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "RentalCarEnrgyUse";
  let source: { id: string; factorId: unknown };
  try {
    source = await resolveScope3Source(resolveLookup, "Business Travel Rental Cars", "RentalCarEmssnFctrId");
  } catch (err) {
    warnings.push(`Skipped ${sobject} generation: ${err instanceof Error ? err.message : String(err)}`);
    return { sobject, count: 0 };
  }

  const year = yearFromSpec(spec);
  const [minDays, maxDays] = (spec.rentalLengthDaysRange as [number, number] | undefined) ?? [1, 6];
  const rows: Record<string, unknown>[] = [];
  for (let n = 0; n < spec.targetCount; n++) {
    const { start, end } = randomTripDates(year, randomInt(minDays, maxDays));
    const traveler = randomChoice(TRAVELER_NAMES);
    const row: Record<string, unknown> = {
      Name: `${traveler} — Rental Car — ${start}`,
      Scope3EmssnSrcId: source.id,
      FuelType: randomChoice(["Gasoline", "Gasoline", "Gasoline", "Diesel", "Electricity"]),
      Distance: randomFloat(50, 800, 0),
      DistanceUnit: "Miles",
      RentalCarCompanyName: randomChoice(RENTAL_CAR_COMPANIES),
      Scope3GhgCategory: "BusinessTravel",
      TravelerName: traveler,
      StartDate: start,
      EndDate: end,
    };
    if (source.factorId) row.RentalCarEmssnFctrId = source.factorId;
    rows.push(row);
  }

  const { count, warning } = await bulkLoadAndFixture(
    sobject,
    rows,
    `Scope3EmssnSrcId = '${soqlEscape(source.id)}'`,
    fixture
  );
  if (warning) warnings.push(warning);
  return { sobject, count };
}

/**
 * GroundTravelEnrgyUse — single fixed parent ("Employee Ground Travel" Scope3EmssnSrc). Reuses
 * the parent's own GroundTravelEmssnFctrId. Only Name + Scope3EmssnSrcId are truly required per
 * describe; everything else here is populated for realism/coherence, not because it's mandatory.
 */
async function generateGroundTravel(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "GroundTravelEnrgyUse";
  let source: { id: string; factorId: unknown };
  try {
    source = await resolveScope3Source(resolveLookup, "Employee Ground Travel", "GroundTravelEmssnFctrId");
  } catch (err) {
    warnings.push(`Skipped ${sobject} generation: ${err instanceof Error ? err.message : String(err)}`);
    return { sobject, count: 0 };
  }

  const year = yearFromSpec(spec);
  const rows: Record<string, unknown>[] = [];
  for (let n = 0; n < spec.targetCount; n++) {
    const { start, end } = randomTripDates(year, 1);
    const traveler = randomChoice(TRAVELER_NAMES);
    const row: Record<string, unknown> = {
      Name: `${traveler} — Ground Travel — ${start}`,
      Scope3EmssnSrcId: source.id,
      Distance: randomFloat(5, 100, 1),
      DistanceUnit: "Miles",
      ExpenseType: randomChoice(["Taxi", "SubwayLocalTransit", "PersonalCarDistance", "Limousine", "SubwayCrossState"]),
      Scope3GhgCategory: Math.random() < 0.7 ? "BusinessTravel" : "EmployeeCommuting",
      TripCost: randomFloat(10, 150, 2),
      TravelerName: traveler,
      StartDate: start,
      EndDate: end,
    };
    if (source.factorId) row.GroundTravelEmssnFctrId = source.factorId;
    rows.push(row);
  }

  const { count, warning } = await bulkLoadAndFixture(
    sobject,
    rows,
    `Scope3EmssnSrcId = '${soqlEscape(source.id)}'`,
    fixture
  );
  if (warning) warnings.push(warning);
  return { sobject, count };
}

const PROCUREMENT_FALLBACK_CATEGORIES = [
  "Freight & Logistics", "Raw Materials", "Packaging", "Contract Manufacturing", "Facilities & Maintenance",
];

/**
 * Scope3PcmtItem — the one tier with an inverted dependency: ProcurementSummaryId is required on
 * every line item, and Scope3PcmtSummary itself requires a Scope3CrbnFtprntId, but no footprint
 * tier runs before this one (footprints.ts is separate, later work — see file header). So this
 * generator first creates one minimal Scope3CrbnFtprnt shell (only Name + FootprintStage are
 * truly required) and one Scope3PcmtSummary via plain createRecord calls — same pattern
 * loadSymbolicSeedFile uses above — before bulk-loading the line items.
 *
 * Parent source: "Inbound Freight & Logistics" Scope3EmssnSrc — the one seeded Scope3EmssnSrc
 * record with no dedicated per-record USE tier of its own (the other 4 each map 1:1 to one of the
 * generators above), which is what makes it the natural choice here rather than an arbitrary pick.
 *
 * Unlike the travel tiers above (single constant factor reused from the one parent), this tier
 * still gets real per-record factor variety: PcmtEmssnFctrSetItem.Scope3GhgCategory uses the same
 * picklist value set as Scope3PcmtItem.Scope3GhgCategory, and PcmtEmssnFctrSetItem.EconomicSector
 * is a plain string — so a themed pool of real reference rows is queried once, then sampled
 * per-record for SpendingCategory1 + PcmtEmssnFctrSetItemId + Scope3GhgCategory coherence. Falls
 * back to an unfiltered pool, then a small hardcoded category list with no factor link, rather
 * than failing the whole generator over what is ultimately an optional-field enhancement.
 */
async function generateScope3Procurement(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  spec: GeneratorSpec,
  warnings: string[]
): Promise<{ sobject: string; count: number }> {
  const sobject = "Scope3PcmtItem";
  let freightSourceId: string;
  try {
    freightSourceId = await resolveLookup({
      sobject: "Scope3EmssnSrc",
      field: "Name",
      value: "Inbound Freight & Logistics",
    });
  } catch (err) {
    warnings.push(`Skipped ${sobject} generation: ${err instanceof Error ? err.message : String(err)}`);
    return { sobject, count: 0 };
  }
  const inventory = fixture.find((r) => r.sobject === "AnnualEmssnInventory");
  const year = yearFromSpec(spec);

  const shell = (await dataTools.createRecord("Scope3CrbnFtprnt", {
    Name: `FY${year} Scope 3 Procurement Footprint — Inbound Freight & Logistics`,
    FootprintStage: "Completed",
    Scope3EmssnSrcId: freightSourceId,
    ReportingYear: String(year),
    ...(inventory ? { AnnualEmssnInventoryId: inventory.id } : {}),
  })) as { id: string };
  fixture.push({ sobject: "Scope3CrbnFtprnt", id: shell.id });

  const summary = (await dataTools.createRecord("Scope3PcmtSummary", {
    Name: `FY${year} Procurement Summary — Inbound Freight & Logistics`,
    Scope3CrbnFtprntId: shell.id,
    CalendarYear: String(year),
    Scope3EmssnSrcId: freightSourceId,
    CurrencyCode: "USD",
  })) as { id: string };
  fixture.push({ sobject: "Scope3PcmtSummary", id: summary.id });

  const theme = (spec.spendCategoryTheme as string | undefined) ?? "Upstream Transportation and Distribution";
  let pool: Array<{ Id: string; EconomicSector: string; Scope3GhgCategory: string }> = [];
  try {
    const themed = (await dataTools.runSoql(
      `SELECT Id, EconomicSector, Scope3GhgCategory FROM PcmtEmssnFctrSetItem ` +
        `WHERE Scope3GhgCategory = '${soqlEscape(theme)}' AND EconomicSector != null`
    )) as { records: Array<{ Id: string; EconomicSector: string; Scope3GhgCategory: string }> };
    pool = themed.records;
    if (pool.length === 0) {
      const anyPool = (await dataTools.runSoql(
        `SELECT Id, EconomicSector, Scope3GhgCategory FROM PcmtEmssnFctrSetItem WHERE EconomicSector != null LIMIT 500`
      )) as { records: Array<{ Id: string; EconomicSector: string; Scope3GhgCategory: string }> };
      pool = anyPool.records;
    }
  } catch {
    // Reference data not loaded, or field drift — fall through to the hardcoded category pool below.
  }
  if (pool.length === 0) {
    warnings.push(
      `No PcmtEmssnFctrSetItem rows found (themed "${theme}" or otherwise) — generated ${sobject} rows fall back ` +
        `to a small hardcoded SpendingCategory1 pool with no PcmtEmssnFctrSetItemId link. Run load_reference_data ` +
        `first for realistic, factor-linked procurement line items.`
    );
  }

  const [spentMin, spentMax] = (spec.spentAmountRange as [number, number] | undefined) ?? [500, 250000];
  const rows: Record<string, unknown>[] = [];
  for (let n = 0; n < spec.targetCount; n++) {
    const { start } = randomTripDates(year, 0);
    const picked = pool.length > 0 ? randomChoice(pool) : undefined;
    const row: Record<string, unknown> = {
      Name: `Freight & Logistics Spend #${n + 1} — ${start}`,
      ProcurementSummaryId: summary.id,
      SpendingCategory1: picked?.EconomicSector ?? randomChoice(PROCUREMENT_FALLBACK_CATEGORIES),
      SpentAmount: randomFloat(spentMin, spentMax, 2),
      SpentDate: start,
      Scope3GhgCategory: picked?.Scope3GhgCategory ?? theme,
    };
    if (picked) row.PcmtEmssnFctrSetItemId = picked.Id;
    rows.push(row);
  }

  const { count, warning } = await bulkLoadAndFixture(
    sobject,
    rows,
    `ProcurementSummaryId = '${soqlEscape(summary.id)}'`,
    fixture
  );
  if (warning) warnings.push(warning);
  return { sobject, count };
}

/**
 * Runs every tier-6 generator in sequence (each is independent of the others' output, only of
 * tiers 1-5 already sitting in `fixture` — order here is for narrative clarity, not correctness).
 * One data/generators/*.spec.yaml load failure or generator error aborts the remaining tiers by
 * design — consistent with scaffoldSampleData's own try/catch, which persists whatever fixture
 * exists so far and reports it as a resumable partial failure rather than swallowing the error.
 */
async function generateTransactionalTier(
  fixture: FixtureRecord[],
  resolveLookup: (lookup: SymbolicLookup) => Promise<string>,
  warnings: string[]
): Promise<Record<string, number>> {
  const created: Record<string, number> = {};
  const tiers: Array<[string, (spec: GeneratorSpec) => Promise<{ sobject: string; count: number }>]> = [
    ["stnry-asset-energy-use.spec.yaml", (spec) => generateStnryAssetEnergyUse(fixture, spec, warnings)],
    ["vehicle-asset-energy-use.spec.yaml", (spec) => generateVehicleAssetEnergyUse(fixture, resolveLookup, spec, warnings)],
    ["generated-waste.spec.yaml", (spec) => generateWaste(fixture, spec, warnings)],
    ["stnry-asset-water-activity.spec.yaml", (spec) => generateStnryAssetWaterActivity(fixture, spec, warnings)],
    ["air-travel-energy-use.spec.yaml", (spec) => generateAirTravel(fixture, resolveLookup, spec, warnings)],
    ["hotel-stay-energy-use.spec.yaml", (spec) => generateHotelStay(fixture, resolveLookup, spec, warnings)],
    ["rental-car-energy-use.spec.yaml", (spec) => generateRentalCar(fixture, resolveLookup, spec, warnings)],
    ["ground-travel-energy-use.spec.yaml", (spec) => generateGroundTravel(fixture, resolveLookup, spec, warnings)],
    ["scope3-procurement.spec.yaml", (spec) => generateScope3Procurement(fixture, resolveLookup, spec, warnings)],
  ];

  for (const [fileName, generate] of tiers) {
    const spec = await loadGeneratorSpec(fileName);
    const { sobject, count } = await generate(spec);
    created[sobject] = count;
  }
  return created;
}

// ───────── orchestration ─────────

/**
 * Reference-tier sobjects this seed's `lookups` can point at, across all
 * four symbolic seed files (everything except Account, which is tier 1, not
 * reference data). Used only for a cheap upfront sanity check — "did you
 * forget to run load_reference_data at all" — not as a per-tier gate; the
 * resolvers above already give a precise, specific error naming the exact
 * Name/sobject/field when a lookup can't resolve, which is a better signal
 * than a blanket precheck could be for a partially-loaded reference tier.
 */
const REFERENCE_SOBJECTS_USED_BY_SEED = [
  "CrbnEmssnScopeAlloc",
  "ElectricityEmssnFctrSet",
  "OtherEmssnFctrSet",
  "RefrigerantEmssnFctr",
  "WstDispoEmssnFctrSet",
  "BldgEnrgyIntensity",
  "AirTravelEmssnFctr",
  "GroundTravelEmssnFctr",
  "HotelStayEmssnFctr",
  "RentalCarEmssnFctr",
  "FrgtHaulingEmssnFctr",
];

const ANCHOR_ACCOUNT_NAME = "Meridian Industries, Inc.";

export async function scaffoldSampleData(opts: { force?: boolean; profile?: string } = {}): Promise<ScaffoldSampleDataResult> {
  // Precondition 1: NZC must be licensed/provisioned (same probe as load_reference_data).
  try {
    await dataTools.describeSObject("StnryAssetEnvrSrc");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Net Zero Cloud does not appear to be licensed/provisioned on this org — ` +
        `describe_sobject("StnryAssetEnvrSrc") failed: ${detail}. Run enable_net_zero_settings (or fix licensing ` +
        `in Setup) first. (This does not re-check individual Industries "enableSC*" settings flags — that's ` +
        `enable_net_zero_settings' own concern, and none of those flags gate whether these specific inserts succeed.)`
    );
  }

  // Precondition 2: the reference/factor tier this seed's lookups depend on must already be loaded.
  const refCounts = await Promise.all(
    REFERENCE_SOBJECTS_USED_BY_SEED.map(async (sobject) => {
      const result = (await dataTools.runSoql(`SELECT COUNT() FROM ${sobject}`)) as { totalSize: number };
      return [sobject, result.totalSize] as const;
    })
  );
  if (refCounts.every(([, count]) => count === 0)) {
    throw new Error(
      `None of the reference/emission-factor data this seed depends on is loaded yet (checked: ` +
        `${REFERENCE_SOBJECTS_USED_BY_SEED.join(", ")}). Run load_reference_data first.`
    );
  }

  // Idempotency guard: pure insert, not an upsert. Check for our specific named anchor record rather
  // than "does Account have any rows" — Account is a standard object; the org may have unrelated
  // pre-existing accounts, which shouldn't block this seed from loading.
  const anchor = (await dataTools.runSoql(
    `SELECT Id FROM Account WHERE Name = '${soqlEscape(ANCHOR_ACCOUNT_NAME)}'`
  )) as { totalSize: number };
  if (anchor.totalSize > 0 && !opts.force) {
    throw new Error(
      `Refusing to load sample data — an Account named "${ANCHOR_ACCOUNT_NAME}" already exists, which is this ` +
        `seed's own anchor record. Re-running would duplicate the whole graph (Account/Supplier/sources have no ` +
        `external-id field to upsert against). Pass force: true only after confirming with the user that this is ` +
        `intended (e.g. a prior partial/failed run genuinely needs to be redone).`
    );
  }

  const warnings: string[] = [];
  if (opts.profile && opts.profile !== "full") {
    warnings.push(
      `profile: "${opts.profile}" is not a recognized profile name — proceeding with the default (only "full" is ` +
        `currently defined). The seed tier (accounts/suppliers/sources) is fixed-size, committed content; only the ` +
        `tier-6 generated counts in data/generators/*.spec.yaml are profile-scalable, and no profile besides the ` +
        `implicit default currently adjusts them.`
    );
  }

  const fixtureId = timestampId("FIXTURE");
  const fixture: FixtureRecord[] = [];
  const created: Record<string, number> = {};

  try {
    // ---- Tier 1: Accounts + Suppliers (tree-import, preflight-patched) ----
    const preflight = await preflightTreeImportPlan(pluginPath("data", "seed", "accounts-suppliers-plan.json"));
    warnings.push(...preflight.warnings);
    let treeResults: Array<{ refId: string; type: string; id: string }>;
    try {
      treeResults = (await dataTools.importTree(preflight.patchedPlanPath)) as Array<{
        refId: string;
        type: string;
        id: string;
      }>;
    } catch (err) {
      // Best-effort recovery: if the plan has more than one file and an earlier one already
      // succeeded before a later one failed, those records exist in the org with no {refId,type,id}
      // ever returned for them. Re-query by Name so they still land in the fixture manifest instead
      // of being silently orphaned — see reconcileCreatedByName's doc comment.
      for (const [sobject, names] of Object.entries(preflight.namesBySobject)) {
        await reconcileCreatedByName(sobject, names, fixture)
          .then((r) => {
            if (r.warning) warnings.push(r.warning);
          })
          .catch(() => {
            // Best-effort on top of best-effort — if even this fails, fall through to the rethrow below.
          });
      }
      throw err;
    } finally {
      await rm(preflight.tempDir, { recursive: true, force: true });
    }
    for (const r of treeResults) {
      fixture.push({ sobject: r.type, id: r.id });
      created[r.type] = (created[r.type] ?? 0) + 1;
    }

    // ---- Tiers 2-5: symbolic seed files, in dependency order (all depend on Account above; ----
    // ---- stnry/vehicle/scope3 additionally depend on the reference tier checked above). ----
    const resolveLookup = makeLookupResolver();
    const resolveRecordType = makeRecordTypeResolver();
    const symbolicFiles = ["annual-inventory.json", "stnry-sources.json", "vehicle-sources.json", "scope3-sources.json"];
    for (const fileName of symbolicFiles) {
      const { sobject, count } = await loadSymbolicSeedFile(
        pluginPath("data", "seed", fileName),
        fixture,
        resolveLookup,
        resolveRecordType
      );
      created[sobject] = count;
    }

    // ---- Tier 6: generated transactional records (data/generators/*.spec.yaml) ----
    const generatedCounts = await generateTransactionalTier(fixture, resolveLookup, warnings);
    Object.assign(created, generatedCounts);
  } catch (err) {
    if (fixture.length > 0) {
      await writeFixtureManifest(fixtureId, fixture).catch(() => {
        // Best-effort — surfacing the original failure matters more than this secondary write succeeding.
      });
      const detail = err instanceof Error ? err.message : String(err);
      const warningBlock = warnings.length > 0 ? `\nWarnings collected before/during the failure:\n- ${warnings.join("\n- ")}` : "";
      throw new Error(
        `scaffold_sample_data failed partway through: ${detail}\n` +
          `${fixture.length} record(s) were already created before the failure, and have been recorded under ` +
          `fixtureId "${fixtureId}" for cleanup — call scaffold_sample_data again with teardownId: "${fixtureId}" ` +
          `to remove them, or leave them and fix the underlying issue (nothing else references them yet).` +
          warningBlock
      );
    }
    throw err;
  }

  await writeFixtureManifest(fixtureId, fixture);

  return {
    fixtureId,
    created,
    warnings,
    notYetImplemented: [
      "Carbon footprint tiers for stationary/vehicle/waste/water assets (StnryAssetCrbnFtprnt, " +
        "VehicleAssetCrbnFtprnt, WasteFootprint, StnryAssetWaterFtprnt) — not created by this run; see " +
        "calculate_footprints. (One exception: a minimal Scope3CrbnFtprnt shell + Scope3PcmtSummary IS created " +
        "above, only because Scope3PcmtItem's own required ProcurementSummaryId leaves no other way to generate " +
        "it — calculate_footprints should complete/update that shell by Scope3EmssnSrc + ReportingYear rather " +
        "than create a duplicate.)",
    ],
  };
}

/**
 * Deletes every record scaffoldSampleData created for one fixture, in exact
 * reverse creation order — children (sources, suppliers) before parents
 * (accounts, annual inventory) — so no delete ever fails on a lingering
 * lookup from a not-yet-deleted child. Best-effort: one record's delete
 * failure (e.g. it was already manually deleted) is recorded in `errors`
 * and does not stop the rest of the teardown.
 */
export async function teardownSampleData(fixtureId: string): Promise<TeardownResult> {
  const records = await readFixtureManifest(fixtureId);
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  for (const record of [...records].reverse()) {
    try {
      await dataTools.deleteRecord(record.sobject, record.id);
      deleted[record.sobject] = (deleted[record.sobject] ?? 0) + 1;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      errors.push(`${record.sobject} ${record.id}: ${detail}`);
    }
  }

  await rm(join(FIXTURES_DIR, `${fixtureId}.json`), { force: true });
  return { fixtureId, deleted, errors };
}
