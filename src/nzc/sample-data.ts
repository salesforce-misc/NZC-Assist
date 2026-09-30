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
 * Deliberately out of scope for this function (tracked separately — see
 * JOURNEY_MAP.md / the project plan §9 and data/generators/): the *generated*
 * transactional tiers (StnryAssetEnrgyUse, VehicleAssetEnrgyUse,
 * GeneratedWaste, Scope3PcmtItem, air/hotel/rental/ground travel energy-use)
 * and every footprint object. Those need data/generators/*.spec.yaml, which
 * doesn't exist yet. This function loads every seed tier that *does* have
 * committed data and says so plainly in its result (notYetImplemented)
 * rather than silently pretending the full pipeline is done.
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
  if (opts.profile === "full") {
    warnings.push(
      `profile: "full" has no effect yet — the seed tier (accounts/suppliers/sources) is fixed-size, committed ` +
        `content. Profile-based scaling will apply once the generated transactional tiers exist (see ` +
        `notYetImplemented below).`
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
      "Generated transactional tiers (StnryAssetEnrgyUse, VehicleAssetEnrgyUse, GeneratedWaste, Scope3PcmtItem, " +
        "air/hotel/rental/ground travel energy-use) — needs data/generators/*.spec.yaml, not yet authored.",
      "Carbon footprint tiers (StnryAssetCrbnFtprnt, VehicleAssetCrbnFtprnt, WasteFootprint, " +
        "StnryAssetWaterFtprnt, Scope3CrbnFtprnt) — depends on the generated tiers above; see calculate_footprints.",
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
