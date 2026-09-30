/**
 * calculate_footprints: creates/completes the five carbon/water FOOTPRINT
 * HEADER objects (StnryAssetCrbnFtprnt, VehicleAssetCrbnFtprnt, WasteFootprint,
 * StnryAssetWaterFtprnt, Scope3CrbnFtprnt) for a given reporting year,
 * backfills each header's FK onto the already-loaded transactional child rows
 * scaffold_sample_data generated, and rolls up an illustrative CO2e total
 * into each header's *writable* "Suppl*" fields.
 *
 * ── Why this never touches the *Item / detail footprint objects ──
 * StnryAssetCrbnFtprntItm, WasteFootprintItem, StnryAssetWtrFtprntItm are all
 * object-level createable=false (confirmed via live `sf sobject describe`) —
 * only Salesforce's Data Processing Engine (DPE) calculation batch job can
 * populate them. This tool never attempts to invoke DPE via anonymous Apex:
 * the DPE batch-job Apex invocation surface (namespace/method signature) has
 * not been verified against a live org, and the project plan's own risk notes
 * (§15) call for a detect-and-report design here rather than a guessed Apex
 * call. detectDpe() below queries BatchCalcJobDefinition and reports what it
 * finds — it never runs one.
 *
 * ── The "Suppl*" escape valve ──
 * Every footprint header carries one or more manually-writable "Suppl*"
 * fields alongside DPE-only calculated fields such as TotScope1EmissionsInTco2e
 * (createable=false). This is the platform's own supported path for supplying
 * emissions totals without DPE — NZC's own help docs describe these as
 * "supplemental" emissions a customer can enter directly. That is exactly
 * what this tool automates: sum a per-row *illustrative* CO2e estimate (see
 * ILLUSTRATIVE_FACTORS below) across every child row grouped by its parent
 * source, and write the sum into the header's Suppl* field(s).
 *
 * ── ILLUSTRATIVE, NOT REAL, EMISSION FACTORS ──
 * The org's real reference-data tier (data/reference/*, loaded by
 * load_reference_data) carries real, named emission-factor-set records
 * (ElectricityEmssnFctrSet, OtherEmssnFctrSet, etc.) that DPE would use for a
 * certified calculation. This tool does NOT read those factor sets or
 * attempt real GHG-accounting math — the constants below are simple, round,
 * clearly-labeled placeholders whose only job is to produce a non-zero,
 * internally-consistent number so the sample org "looks used" end to end.
 * Never present ILLUSTRATIVE_FACTORS output as a real/certified footprint.
 *
 * ── Uniform design: group-by-source, one header per (source, year) ──
 * Every tier below follows the same shape: query this year's child rows for
 * the tier's object, group them by whichever parent-source lookup field they
 * actually carry (StnryAssetEnvrSrcId / VehicleAssetEmssnSrcId /
 * Scope3EmssnSrcId), find-or-create exactly one header per (source, year)
 * pair via findOrCreateHeader(), bulk-update the child rows' own Suppl fields
 * (where the child object has one), then re-query *all* children currently
 * linked to that header and overwrite (never add to) its Suppl total from
 * that fresh full sum. Re-running calculate_footprints for the same year is
 * therefore always safe — it never double-counts, whether this is the first
 * run or the tenth. Each tier also independently catches its own errors and
 * warns rather than aborting the whole run — the same defensive convention
 * sample-data.ts's own generators use — so one object's describe-drift or
 * license gap doesn't block the other tiers.
 *
 * This design was derived from two live-verified `sf sobject describe`
 * batches (16 objects total) plus direct reads of every relevant sample-data.ts
 * generator function — never guessed. See the project plan §8/§15 and
 * JOURNEY_MAP.md step 14.
 *
 * ── What is NOT tracked for teardown ──
 * Unlike scaffold_sample_data, this tool does not write to a fixture
 * manifest (sample-data.ts's fixture-tracking helpers are module-private —
 * see that file's header comment on the nzc/*.ts peer-module convention —
 * and re-implementing a parallel manifest here risked drifting out of sync
 * with the real one). Every header this tool creates is returned in each
 * tier's `createdIds`, so a caller who needs a fully clean teardown can
 * delete them directly; running teardown_sample_data alone will NOT remove
 * footprint headers created here.
 */

import * as dataTools from "../salesforce/data.js";

// ───────── shared types ─────────

interface HeaderTierResult {
  /** Total headers touched this run (created + already-existing found). */
  headers: number;
  /** Of `headers`, how many were newly created this run. */
  created: number;
  /** Every header Id touched this run, for inspection/manual cleanup (see file header). */
  createdIds: string[];
  /** How many child rows had their FK + Suppl fields successfully bulk-updated. */
  childrenUpdated: number;
}

const EMPTY_TIER_RESULT: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };

export interface CalculateFootprintsResult {
  year: string;
  dpe: { detected: boolean; jobDefinitions: string[] };
  stationary: HeaderTierResult;
  vehicle: HeaderTierResult;
  waste: HeaderTierResult;
  water: HeaderTierResult;
  scope3Travel: HeaderTierResult;
  scope3Procurement: HeaderTierResult;
  annualInventoryId: string | undefined;
  annualInventoryUpdated: boolean;
  warnings: string[];
  notYetImplemented: string[];
}

// ───────── illustrative constants — see file header ─────────

/**
 * Simple, round, demo-only tCO2e-per-unit constants. None of these are real
 * published emission factors — they exist only to make calculate_footprints
 * produce non-zero, internally-consistent Suppl totals for a sample org.
 * Do not surface these as certified/audit-grade figures anywhere.
 */
const ILLUSTRATIVE_FACTORS = {
  electricityTco2ePerKwh: 0.0004,
  otherFuelTco2ePerMmbtu: 0.053,
  refrigerantTco2ePerKg: 1.5,
  vehicleFuelTco2ePerGallon: 0.0089,
  vehicleElectricityTco2ePerKwh: 0.0004,
  distanceTco2ePerMile: 0.0004,
  airTravelTco2ePerMile: 0.00018,
  hotelTco2ePerRoomNight: 0.025,
  wasteTco2ePerKg: 0.0005,
  procurementTco2ePerUsd: 0.0004,
} as const;

/** Exact SI conversion (not an emission factor): 1 megaliter = 1000 m³. */
const M3_PER_MEGALITER = 1000;

/** Exact unit conversion (not an emission factor). Generators always write "Miles"; used only defensively. */
const MILES_PER_KM = 0.621371;

/**
 * Scope3PcmtItem.Scope3GhgCategory's 16 picklist values, mapped 1:1 onto
 * Scope3CrbnFtprnt's 16 category-specific writable Suppl* fields. Both sides
 * confirmed via live `sf sobject describe` while designing this tool — every
 * field name below is a direct transcription, never guessed.
 */
const SCOPE3_CATEGORY_TO_SUPPL_FIELD: Record<string, string> = {
  "Purchased Goods and Services": "SupplPurchGoodSrvcs",
  "Capital Goods": "SupplScp3EmssnCptlGoods",
  "Fuel and Energy-Related Activities": "SupplFuelEnrgyRelaActv",
  "Upstream Transportation and Distribution": "SupplUpstrmTrnspDstr",
  "Waste Generated In Operations": "SupplScp3EmssnWstGenOper",
  "Business Travel": "SupplScp3EmssnBizTravl",
  "Employee Commuting": "SupplScp3EmssnEmpComut",
  "Upstream Leased Assets": "SupplUpstrmLsdAst",
  "Downstream Transportation and Distribution": "SupplScp3EmssnDnstrmTrnspDstr",
  "Processing of Sold Products": "SupplProcessingSoldPrdct",
  "Use of Sold Products": "SupplUseSoldPrdct",
  "End-of-Life Treatment of Sold Products": "SupplEndLifeTreatSoldPrdct",
  "Downstream Leased Assets": "SupplDnstrmLsdAst",
  Franchises: "SupplScp3EmssnFranch",
  Investments: "SupplScp3EmssnInvestments",
  Uncategorized: "SupplScp3UncatgEmssn",
};

/**
 * RentalCarEnrgyUse/GroundTravelEnrgyUse carry their own Scope3GhgCategory
 * picklist (confirmed via describe: values "EmployeeCommuting"/"BusinessTravel"
 * — no spaces, a distinct picklist from Scope3PcmtItem's spaced version
 * above) rather than the 16-category one. AirTravelEnrgyUse/HotelStayEnrgyUse
 * have no such field at all; both are unambiguously business travel by
 * nature, so they default to it rather than being left uncategorized.
 */
const TRAVEL_CATEGORY_TO_SUPPL_FIELD: Record<string, string> = {
  BusinessTravel: "SupplScp3EmssnBizTravl",
  EmployeeCommuting: "SupplScp3EmssnEmpComut",
};

// ───────── small utilities ─────────

function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function distanceInMiles(distance: number, unit: string | null | undefined): number {
  return unit === "Kilometers" ? distance * MILES_PER_KM : distance;
}

function groupBy<T>(items: T[], keyFn: (item: T) => string | undefined): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (!key) continue;
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return map;
}

const YEAR_START = (year: string): string => `${year}-01-01`;
const YEAR_END = (year: string): string => `${year}-12-31`;

async function queryNameById(sobject: string, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (ids.length === 0) return names;
  const idList = ids.map((id) => `'${soqlEscape(id)}'`).join(", ");
  const result = (await dataTools.runSoql(`SELECT Id, Name FROM ${sobject} WHERE Id IN (${idList})`)) as {
    records: Array<{ Id: string; Name: string }>;
  };
  for (const row of result.records) names.set(row.Id, row.Name);
  return names;
}

/**
 * Finds an existing header row matching every (field, value) pair in
 * `matchFields`, or creates one from `createFields` if none exists. Never
 * updates an already-found header's fields — completing/backfilling Suppl
 * totals is each tier's own job below, since what needs updating differs
 * from what was used to find it.
 */
async function findOrCreateHeader(
  headerSobject: string,
  matchFields: Record<string, string>,
  createFields: Record<string, unknown>
): Promise<{ id: string; created: boolean }> {
  const where = Object.entries(matchFields)
    .map(([field, value]) => `${field} = '${soqlEscape(value)}'`)
    .join(" AND ");
  const found = (await dataTools.runSoql(`SELECT Id FROM ${headerSobject} WHERE ${where} LIMIT 1`)) as {
    records: Array<{ Id: string }>;
  };
  if (found.records.length > 0) {
    return { id: found.records[0].Id, created: false };
  }
  const createdRecord = (await dataTools.createRecord(headerSobject, createFields)) as { id: string };
  return { id: createdRecord.id, created: true };
}

/**
 * Bulk-updates child rows (FK + Suppl fields) via Bulk API 2.0. Every row
 * must already include an Id. On anything short of JobComplete, warns with
 * the exact resume command Bulk API 2.0 itself reports (confirmed via
 * `sf data update bulk --help`) rather than silently losing the rows.
 */
async function bulkUpdateChildren(
  sobject: string,
  rows: Record<string, unknown>[],
  warnings: string[]
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await dataTools.bulkUpdateRecords(sobject, rows, { wait: 15 });
  if (result.state !== "JobComplete") {
    warnings.push(
      `Bulk update of ${rows.length} ${sobject} record(s) did not reach JobComplete (state: "${result.state}", ` +
        `jobId: "${result.jobId}"). Run "sf data update resume --job-id ${result.jobId}" to check status — header ` +
        `Suppl totals below were computed from whatever had already committed at query time and may be incomplete.`
    );
    return 0;
  }
  return rows.length;
}

/** Sums `fields` across every row of `childSobject` currently linked to `headerId` via `fkField`. */
async function sumHeaderChildren(
  childSobject: string,
  fkField: string,
  headerId: string,
  fields: string[]
): Promise<Record<string, number>> {
  const result = (await dataTools.runSoql(
    `SELECT ${fields.join(", ")} FROM ${childSobject} WHERE ${fkField} = '${soqlEscape(headerId)}'`
  )) as { records: Array<Record<string, unknown>> };
  const sums: Record<string, number> = {};
  for (const field of fields) sums[field] = 0;
  for (const row of result.records) {
    for (const field of fields) sums[field] += num(row[field]);
  }
  return sums;
}

/** Sums `fields` across every row of `sobject` linked to a given AnnualEmssnInventory. */
async function sumAcrossInventory(sobject: string, fields: string[], inventoryId: string): Promise<number> {
  const result = (await dataTools.runSoql(
    `SELECT ${fields.join(", ")} FROM ${sobject} WHERE AnnualEmssnInventoryId = '${soqlEscape(inventoryId)}'`
  )) as { records: Array<Record<string, unknown>> };
  let total = 0;
  for (const row of result.records) {
    for (const field of fields) total += num(row[field]);
  }
  return total;
}

/**
 * Runs one tier and, on any error (describe drift, a license/object not
 * enabled, a transient API failure), warns and returns an empty result
 * instead of aborting the other tiers — the same per-generator try/catch
 * convention sample-data.ts's own tier-6 generators use.
 */
async function runTier(label: string, warnings: string[], fn: () => Promise<HeaderTierResult>): Promise<HeaderTierResult> {
  try {
    return await fn();
  } catch (err) {
    warnings.push(`${label} footprint calculation failed: ${err instanceof Error ? err.message : String(err)}`);
    return { ...EMPTY_TIER_RESULT, createdIds: [] };
  }
}

// ───────── DPE detection (report-only — see file header) ─────────

async function detectDpe(warnings: string[]): Promise<{ detected: boolean; jobDefinitions: string[] }> {
  try {
    const result = (await dataTools.runSoql(
      `SELECT DeveloperName FROM BatchCalcJobDefinition WHERE ProcessType = 'NetZero'`
    )) as { records: Array<{ DeveloperName: string }> };
    const jobDefinitions = result.records.map((r) => r.DeveloperName);
    if (jobDefinitions.length > 0) {
      warnings.push(
        `Detected ${jobDefinitions.length} NetZero Data Processing Engine job definition(s) ` +
          `(${jobDefinitions.join(", ")}) — this org can run a certified DPE calculation from Setup > Data ` +
          `Processing Engine, or the Net Zero Cloud app's own "Calculate Footprint" action. This tool does not ` +
          `invoke DPE itself (see file header); it only writes illustrative Suppl* totals below.`
      );
    } else {
      warnings.push(
        `No NetZero-process BatchCalcJobDefinition found — this tool's illustrative Suppl* totals are the only ` +
          `footprint values this org will have until a DPE job definition is configured (Setup > Data Processing ` +
          `Engine) or footprints are entered manually.`
      );
    }
    return { detected: jobDefinitions.length > 0, jobDefinitions };
  } catch (err) {
    warnings.push(
      `Could not query BatchCalcJobDefinition (${err instanceof Error ? err.message : String(err)}) — DPE ` +
        `detection skipped.`
    );
    return { detected: false, jobDefinitions: [] };
  }
}

// ───────── tier: stationary (StnryAssetEnrgyUse → StnryAssetCrbnFtprnt) ─────────

/**
 * generateStnryAssetEnergyUse (sample-data.ts) sets CrbnEmssnScopeAlloc to
 * "SCOPE2" for Electricity rows and "SCOPE1" for everything else (confirmed
 * by reading that function directly), with FuelConsumptionUnit "kWh" for
 * Electricity, "kG" for Refrigerant, "MMBtu" for everything else. Mirrored
 * exactly here — this is the only tier with a real Scope1/Scope2 split.
 */
function estimateStationaryTco2e(consumption: number, unit: string): number {
  if (unit === "kWh") return consumption * ILLUSTRATIVE_FACTORS.electricityTco2ePerKwh;
  if (unit === "kG") return consumption * ILLUSTRATIVE_FACTORS.refrigerantTco2ePerKg;
  return consumption * ILLUSTRATIVE_FACTORS.otherFuelTco2ePerMmbtu;
}

async function processStationaryFootprints(
  year: string,
  inventoryId: string | undefined,
  warnings: string[]
): Promise<HeaderTierResult> {
  const sobject = "StnryAssetEnrgyUse";
  const rows = (await dataTools.runSoql(
    `SELECT Id, StnryAssetEnvrSrcId, FuelConsumption, FuelConsumptionUnit, CrbnEmssnScopeAlloc FROM ${sobject} ` +
      `WHERE StartDate >= ${YEAR_START(year)} AND StartDate <= ${YEAR_END(year)}`
  )) as {
    records: Array<{
      Id: string;
      StnryAssetEnvrSrcId: string;
      FuelConsumption: number | null;
      FuelConsumptionUnit: string | null;
      CrbnEmssnScopeAlloc: string | null;
    }>;
  };
  if (rows.records.length === 0) {
    warnings.push(
      `No ${sobject} rows found for ${year} — skipped stationary carbon footprint calculation. Run ` +
        `scaffold_sample_data (with a matching year) first.`
    );
    return { ...EMPTY_TIER_RESULT, createdIds: [] };
  }

  const result: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };
  const bySource = groupBy(rows.records, (r) => r.StnryAssetEnvrSrcId);
  const sourceNames = await queryNameById("StnryAssetEnvrSrc", [...bySource.keys()]);

  for (const [srcId, group] of bySource) {
    const srcName = sourceNames.get(srcId) ?? srcId;
    const header = await findOrCreateHeader(
      "StnryAssetCrbnFtprnt",
      { StnryAssetEnvrSrcId: srcId, ReportingYear: year },
      {
        Name: `FY${year} Stationary Carbon Footprint — ${srcName}`,
        StnryAssetEnvrSrcId: srcId,
        ReportingYear: year,
        StartDate: YEAR_START(year),
        EndDate: YEAR_END(year),
        FootprintStage: "Completed",
        ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
      }
    );
    result.headers++;
    result.createdIds.push(header.id);
    if (header.created) result.created++;

    const childUpdates = group.map((r) => {
      const co2e = round2(estimateStationaryTco2e(num(r.FuelConsumption), r.FuelConsumptionUnit ?? ""));
      const isScope2 = r.CrbnEmssnScopeAlloc === "SCOPE2";
      return {
        Id: r.Id,
        StnryAssetCrbnFtprntId: header.id,
        SuplScope1Emissions: isScope2 ? 0 : co2e,
        SuplScope2LocationBasedEmssn: isScope2 ? co2e : 0,
        SuplScope2MarketBasedEmssn: isScope2 ? co2e : 0,
      };
    });
    result.childrenUpdated += await bulkUpdateChildren(sobject, childUpdates, warnings);

    const sums = await sumHeaderChildren(sobject, "StnryAssetCrbnFtprntId", header.id, [
      "SuplScope1Emissions",
      "SuplScope2LocationBasedEmssn",
      "SuplScope2MarketBasedEmssn",
    ]);
    await dataTools.updateRecord("StnryAssetCrbnFtprnt", header.id, {
      ...sums,
      ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
    });
  }
  return result;
}

// ───────── tier: vehicle (VehicleAssetEnrgyUse → VehicleAssetCrbnFtprnt) ─────────

/**
 * generateVehicleAssetEnergyUse (sample-data.ts) hardcodes CrbnEmssnScopeAlloc
 * to "Scope 1" for every row it creates — fleet AND private-jet, even
 * Electricity fuel type (confirmed by reading that function directly). There
 * is no Scope 2 split on this tier, unlike stationary above: every row's
 * estimate goes to SuplScope1Emissions only.
 */
function estimateVehicleTco2e(consumption: number, unit: string): number {
  if (unit === "kWh") return consumption * ILLUSTRATIVE_FACTORS.vehicleElectricityTco2ePerKwh;
  return consumption * ILLUSTRATIVE_FACTORS.vehicleFuelTco2ePerGallon; // UsGallons — the only other unit this generator writes
}

async function processVehicleFootprints(
  year: string,
  inventoryId: string | undefined,
  warnings: string[]
): Promise<HeaderTierResult> {
  const sobject = "VehicleAssetEnrgyUse";
  const rows = (await dataTools.runSoql(
    `SELECT Id, VehicleAssetEmssnSrcId, FuelConsumption, FuelConsumptionUnit FROM ${sobject} ` +
      `WHERE StartDate >= ${YEAR_START(year)} AND StartDate <= ${YEAR_END(year)}`
  )) as {
    records: Array<{
      Id: string;
      VehicleAssetEmssnSrcId: string;
      FuelConsumption: number | null;
      FuelConsumptionUnit: string | null;
    }>;
  };
  if (rows.records.length === 0) {
    warnings.push(
      `No ${sobject} rows found for ${year} — skipped vehicle carbon footprint calculation. Run ` +
        `scaffold_sample_data (with a matching year) first.`
    );
    return { ...EMPTY_TIER_RESULT, createdIds: [] };
  }

  const result: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };
  const bySource = groupBy(rows.records, (r) => r.VehicleAssetEmssnSrcId);
  const sourceNames = await queryNameById("VehicleAssetEmssnSrc", [...bySource.keys()]);

  for (const [srcId, group] of bySource) {
    const srcName = sourceNames.get(srcId) ?? srcId;
    const header = await findOrCreateHeader(
      "VehicleAssetCrbnFtprnt",
      { VehicleAssetEmssnSrcId: srcId, ReportingYear: year },
      {
        Name: `FY${year} Vehicle Carbon Footprint — ${srcName}`,
        VehicleAssetEmssnSrcId: srcId,
        ReportingYear: year,
        StartDate: YEAR_START(year),
        EndDate: YEAR_END(year),
        FootprintStage: "Completed",
        VehicleType: /jet/i.test(srcName) ? "Private Jet" : "Fleet Vehicle",
        ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
      }
    );
    result.headers++;
    result.createdIds.push(header.id);
    if (header.created) result.created++;

    const childUpdates = group.map((r) => ({
      Id: r.Id,
      VehicleAssetCrbnFtprntId: header.id,
      SuplScope1Emissions: round2(estimateVehicleTco2e(num(r.FuelConsumption), r.FuelConsumptionUnit ?? "")),
      SuplScope2LocationBasedEmssn: 0,
      SuplScope2MarketBasedEmssn: 0,
    }));
    result.childrenUpdated += await bulkUpdateChildren(sobject, childUpdates, warnings);

    const sums = await sumHeaderChildren(sobject, "VehicleAssetCrbnFtprntId", header.id, [
      "SuplScope1Emissions",
      "SuplScope2LocationBasedEmssn",
      "SuplScope2MarketBasedEmssn",
    ]);
    await dataTools.updateRecord("VehicleAssetCrbnFtprnt", header.id, {
      ...sums,
      ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
    });
  }
  return result;
}

// ───────── tier: waste (GeneratedWaste → WasteFootprint) ─────────

/**
 * generateWaste (sample-data.ts) hardcodes CrbnEmssnScopeAlloc to
 * "SCP3WasteGeneratedInOperations" for every row (confirmed by reading that
 * function directly) — never "Scope1" or "SCP3EndLifeTreatSoldProducts" — so
 * every row's estimate goes to SuplScp3UpstrmWstGenInOper only, on both the
 * child row itself and the WasteFootprint header (the same 3-field Suppl
 * shape exists on both objects, confirmed character-for-character via
 * describe).
 */
function estimateWasteTco2e(quantityKg: number): number {
  return quantityKg * ILLUSTRATIVE_FACTORS.wasteTco2ePerKg;
}

async function processWasteFootprints(
  year: string,
  inventoryId: string | undefined,
  warnings: string[]
): Promise<HeaderTierResult> {
  const sobject = "GeneratedWaste";
  const rows = (await dataTools.runSoql(
    `SELECT Id, StnryAssetEnvrSrcId, DisposedWasteQuantity, DisposedWasteQuantityUnit FROM ${sobject} ` +
      `WHERE StnryAssetEnvrSrcId != null AND StartDate >= ${YEAR_START(year)} AND StartDate <= ${YEAR_END(year)}`
  )) as {
    records: Array<{
      Id: string;
      StnryAssetEnvrSrcId: string;
      DisposedWasteQuantity: number | null;
      DisposedWasteQuantityUnit: string | null;
    }>;
  };
  if (rows.records.length === 0) {
    warnings.push(
      `No ${sobject} rows found for ${year} — skipped waste footprint calculation. Run scaffold_sample_data ` +
        `(with a matching year) first.`
    );
    return { ...EMPTY_TIER_RESULT, createdIds: [] };
  }

  const result: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };
  const bySource = groupBy(rows.records, (r) => r.StnryAssetEnvrSrcId);
  const sourceNames = await queryNameById("StnryAssetEnvrSrc", [...bySource.keys()]);

  // The generator always writes "KG"; LB is handled defensively in case a future/foreign row differs.
  const toKg = (quantity: number, unit: string | null): number => (unit === "LB" ? quantity * 0.453592 : quantity);

  for (const [srcId, group] of bySource) {
    const srcName = sourceNames.get(srcId) ?? srcId;
    const header = await findOrCreateHeader(
      "WasteFootprint",
      { StnryAssetEnvrSrcId: srcId, ReportingYear: year },
      {
        Name: `FY${year} Waste Footprint — ${srcName}`,
        StnryAssetEnvrSrcId: srcId,
        ReportingYear: year,
        StartDate: YEAR_START(year),
        EndDate: YEAR_END(year),
        FootprintStage: "Completed",
        ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
      }
    );
    result.headers++;
    result.createdIds.push(header.id);
    if (header.created) result.created++;

    const childUpdates = group.map((r) => ({
      Id: r.Id,
      WasteFootprintId: header.id,
      SuplScope1EmissionsInTco2e: 0,
      SuplScp3DnstrmEndLifeSoldPrdct: 0,
      SuplScp3UpstrmWstGenInOper: round2(estimateWasteTco2e(toKg(num(r.DisposedWasteQuantity), r.DisposedWasteQuantityUnit))),
    }));
    result.childrenUpdated += await bulkUpdateChildren(sobject, childUpdates, warnings);

    const sums = await sumHeaderChildren(sobject, "WasteFootprintId", header.id, [
      "SuplScope1EmissionsInTco2e",
      "SuplScp3DnstrmEndLifeSoldPrdct",
      "SuplScp3UpstrmWstGenInOper",
    ]);
    await dataTools.updateRecord("WasteFootprint", header.id, {
      ...sums,
      ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
    });
  }
  return result;
}

// ───────── tier: water (StnryAssetWaterActvty → StnryAssetWaterFtprnt) ─────────

/**
 * StnryAssetWaterFtprnt has no Suppl/emissions field at all (confirmed via
 * describe — water isn't CO2e-tracked), and no AnnualEmssnInventoryId lookup
 * either, so this tier only backfills the FK link and rolls up
 * TotalStorageInMl via an exact m³→Ml conversion — no illustrative CO2e math
 * applies here.
 */
async function processWaterFootprints(year: string, warnings: string[]): Promise<HeaderTierResult> {
  const sobject = "StnryAssetWaterActvty";
  const rows = (await dataTools.runSoql(
    `SELECT Id, StnryAssetEnvrSrcId, Quantity, QuantityUnit FROM ${sobject} ` +
      `WHERE StartDate >= ${YEAR_START(year)} AND StartDate <= ${YEAR_END(year)}`
  )) as {
    records: Array<{ Id: string; StnryAssetEnvrSrcId: string; Quantity: number | null; QuantityUnit: string | null }>;
  };
  if (rows.records.length === 0) {
    warnings.push(
      `No ${sobject} rows found for ${year} — skipped water footprint calculation. Run scaffold_sample_data ` +
        `(with a matching year) first.`
    );
    return { ...EMPTY_TIER_RESULT, createdIds: [] };
  }

  const result: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };
  const bySource = groupBy(rows.records, (r) => r.StnryAssetEnvrSrcId);
  const sourceNames = await queryNameById("StnryAssetEnvrSrc", [...bySource.keys()]);

  for (const [srcId, group] of bySource) {
    const srcName = sourceNames.get(srcId) ?? srcId;
    const header = await findOrCreateHeader(
      "StnryAssetWaterFtprnt",
      { StnryAssetEnvrSrcId: srcId, ReportingYear: year },
      {
        Name: `FY${year} Water Footprint — ${srcName}`,
        StnryAssetEnvrSrcId: srcId,
        ReportingYear: year,
        StartDate: YEAR_START(year),
        EndDate: YEAR_END(year),
        FootprintStage: "Completed",
      }
    );
    result.headers++;
    result.createdIds.push(header.id);
    if (header.created) result.created++;

    const childUpdates = group.map((r) => ({ Id: r.Id, StnryAssetWaterFtprntId: header.id }));
    result.childrenUpdated += await bulkUpdateChildren(sobject, childUpdates, warnings);

    // The generator always writes QuantityUnit "M3"; this sum does not attempt to convert any other unit.
    const m3Sums = await sumHeaderChildren(sobject, "StnryAssetWaterFtprntId", header.id, ["Quantity"]);
    await dataTools.updateRecord("StnryAssetWaterFtprnt", header.id, {
      TotalStorageInMl: round2(m3Sums.Quantity / M3_PER_MEGALITER),
    });
  }
  return result;
}

// ───────── tier: scope3 travel (Air/Hotel/RentalCar/GroundTravel → Scope3CrbnFtprnt) ─────────

interface TravelTierConfig {
  sobject: string;
  /** Fields (beyond Id, Scope3EmssnSrcId, StartDate) this object's estimate/category need. */
  selectFields: string[];
  /** Present only on RentalCarEnrgyUse/GroundTravelEnrgyUse — see TRAVEL_CATEGORY_TO_SUPPL_FIELD above. */
  categoryField?: string;
  estimateTco2e: (row: Record<string, unknown>) => number;
}

const TRAVEL_TIERS: TravelTierConfig[] = [
  {
    sobject: "AirTravelEnrgyUse",
    selectFields: ["SegmentDistance", "SegmentDistanceUnit"],
    estimateTco2e: (r) =>
      distanceInMiles(num(r.SegmentDistance), r.SegmentDistanceUnit as string | null) *
      ILLUSTRATIVE_FACTORS.airTravelTco2ePerMile,
  },
  {
    sobject: "HotelStayEnrgyUse",
    selectFields: ["RoomCount", "StayNightsCount"],
    estimateTco2e: (r) => num(r.RoomCount) * num(r.StayNightsCount) * ILLUSTRATIVE_FACTORS.hotelTco2ePerRoomNight,
  },
  {
    sobject: "RentalCarEnrgyUse",
    selectFields: ["Distance", "DistanceUnit", "Scope3GhgCategory"],
    categoryField: "Scope3GhgCategory",
    estimateTco2e: (r) =>
      distanceInMiles(num(r.Distance), r.DistanceUnit as string | null) * ILLUSTRATIVE_FACTORS.distanceTco2ePerMile,
  },
  {
    sobject: "GroundTravelEnrgyUse",
    selectFields: ["Distance", "DistanceUnit", "Scope3GhgCategory"],
    categoryField: "Scope3GhgCategory",
    estimateTco2e: (r) =>
      distanceInMiles(num(r.Distance), r.DistanceUnit as string | null) * ILLUSTRATIVE_FACTORS.distanceTco2ePerMile,
  },
];

async function processScope3TravelFootprints(
  year: string,
  inventoryId: string | undefined,
  warnings: string[]
): Promise<HeaderTierResult> {
  const combined: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };
  // Headers are keyed by (source, year) across all 4 objects — not expected to collide in this
  // project's own generators (each uses a distinct fixed Scope3EmssnSrc), but findOrCreateHeader is
  // source-driven, not object-driven, so sharing falls out naturally either way.
  const headerCache = new Map<string, { id: string; created: boolean }>();

  for (const tier of TRAVEL_TIERS) {
    const fields = ["Id", "Scope3EmssnSrcId", "StartDate", ...tier.selectFields].join(", ");
    const rows = (await dataTools.runSoql(
      `SELECT ${fields} FROM ${tier.sobject} WHERE Scope3EmssnSrcId != null ` +
        `AND StartDate >= ${YEAR_START(year)} AND StartDate <= ${YEAR_END(year)}`
    )) as { records: Array<Record<string, unknown> & { Id: string; Scope3EmssnSrcId: string }> };

    if (rows.records.length === 0) {
      warnings.push(`No ${tier.sobject} rows found for ${year} — skipped for scope3 travel footprint calculation.`);
      continue;
    }

    const bySource = groupBy(rows.records, (r) => r.Scope3EmssnSrcId);
    const sourceNames = await queryNameById("Scope3EmssnSrc", [...bySource.keys()]);

    for (const [srcId, group] of bySource) {
      const cacheKey = `${srcId}:${year}`;
      const cached = headerCache.get(cacheKey);
      let headerId: string;
      if (cached) {
        headerId = cached.id;
      } else {
        const srcName = sourceNames.get(srcId) ?? srcId;
        const created = await findOrCreateHeader(
          "Scope3CrbnFtprnt",
          { Scope3EmssnSrcId: srcId, ReportingYear: year },
          {
            Name: `FY${year} Scope 3 Travel Footprint — ${srcName}`,
            Scope3EmssnSrcId: srcId,
            ReportingYear: year,
            StartDate: YEAR_START(year),
            EndDate: YEAR_END(year),
            FootprintStage: "Completed",
            ...(inventoryId ? { AnnualEmssnInventoryId: inventoryId } : {}),
          }
        );
        headerCache.set(cacheKey, created);
        headerId = created.id;
        combined.headers++;
        combined.createdIds.push(created.id);
        if (created.created) combined.created++;
      }

      const childUpdates = group.map((r) => ({
        Id: r.Id,
        Scope3CrbnFtprntId: headerId,
        SuplScope3Emissions: round2(tier.estimateTco2e(r)),
      }));
      combined.childrenUpdated += await bulkUpdateChildren(tier.sobject, childUpdates, warnings);
    }
  }

  // Second pass: now that every travel object's rows are linked, re-sum each touched header from
  // scratch across all 4 child object types by category (defaulting to BusinessTravel for the two
  // objects with no Scope3GhgCategory field of their own). Re-querying by current linkage (not by
  // this run's year-window selection) is what keeps repeated runs idempotent.
  for (const [, header] of headerCache) {
    const categoryTotals: Record<string, number> = { BusinessTravel: 0, EmployeeCommuting: 0 };
    let overall = 0;
    for (const tier of TRAVEL_TIERS) {
      const selectCategory = tier.categoryField ? `, ${tier.categoryField}` : "";
      const linked = (await dataTools.runSoql(
        `SELECT SuplScope3Emissions${selectCategory} FROM ${tier.sobject} ` +
          `WHERE Scope3CrbnFtprntId = '${soqlEscape(header.id)}'`
      )) as { records: Array<Record<string, unknown>> };
      for (const row of linked.records) {
        const amount = num(row.SuplScope3Emissions);
        overall += amount;
        const category = tier.categoryField ? (row[tier.categoryField] as string | undefined) : undefined;
        const bucket = category && category in categoryTotals ? category : "BusinessTravel";
        categoryTotals[bucket] += amount;
      }
    }
    const updateFields: Record<string, unknown> = { SuplScope3Emission: round2(overall) };
    if (inventoryId) updateFields.AnnualEmssnInventoryId = inventoryId;
    for (const [category, field] of Object.entries(TRAVEL_CATEGORY_TO_SUPPL_FIELD)) {
      updateFields[field] = round2(categoryTotals[category] ?? 0);
    }
    await dataTools.updateRecord("Scope3CrbnFtprnt", header.id, updateFields);
  }

  return combined;
}

// ───────── tier: scope3 procurement (Scope3PcmtItem → Scope3PcmtSummary → Scope3CrbnFtprnt) ─────────

/**
 * Unlike every other tier, the Scope3CrbnFtprnt shell + Scope3PcmtSummary here
 * already exist: scaffold_sample_data's generateScope3Procurement creates
 * both eagerly, because Scope3PcmtItem.ProcurementSummaryId is required with
 * no other way to satisfy it (see that function's doc comment). This tier
 * finds and completes that shell via Scope3PcmtSummary rather than calling
 * findOrCreateHeader, and never writes to Scope3PcmtItem itself: its only
 * writable "supplemental" field, VendorPrvdScope3EmssnInTco2e, is
 * semantically for real vendor-supplied data, not this tool's own
 * illustrative estimate — writing an illustrative guess into a field
 * literally named "vendor provided" would misrepresent it. This tier only
 * rolls the estimate up into the Scope3CrbnFtprnt header's category Suppl*
 * fields.
 */
async function processScope3ProcurementFootprint(
  year: string,
  inventoryId: string | undefined,
  warnings: string[]
): Promise<HeaderTierResult> {
  const summaries = (await dataTools.runSoql(
    `SELECT Id, Scope3CrbnFtprntId FROM Scope3PcmtSummary WHERE CalendarYear = '${soqlEscape(year)}'`
  )) as { records: Array<{ Id: string; Scope3CrbnFtprntId: string }> };

  if (summaries.records.length === 0) {
    warnings.push(
      `No Scope3PcmtSummary rows found for ${year} — skipped scope3 procurement footprint calculation. Run ` +
        `scaffold_sample_data (with a matching year) first; it creates the Scope3PcmtSummary + Scope3CrbnFtprnt ` +
        `shell that this tier completes.`
    );
    return { ...EMPTY_TIER_RESULT, createdIds: [] };
  }

  const result: HeaderTierResult = { headers: 0, created: 0, createdIds: [], childrenUpdated: 0 };

  for (const summary of summaries.records) {
    result.headers++;
    result.createdIds.push(summary.Scope3CrbnFtprntId);

    const items = (await dataTools.runSoql(
      `SELECT SpentAmount, Scope3GhgCategory FROM Scope3PcmtItem WHERE ProcurementSummaryId = '${soqlEscape(summary.Id)}'`
    )) as { records: Array<{ SpentAmount: number | null; Scope3GhgCategory: string | null }> };

    const categoryTotals: Record<string, number> = {};
    let overall = 0;
    for (const item of items.records) {
      const co2e = num(item.SpentAmount) * ILLUSTRATIVE_FACTORS.procurementTco2ePerUsd;
      overall += co2e;
      const field = item.Scope3GhgCategory ? SCOPE3_CATEGORY_TO_SUPPL_FIELD[item.Scope3GhgCategory] : undefined;
      const bucket = field ?? SCOPE3_CATEGORY_TO_SUPPL_FIELD.Uncategorized;
      categoryTotals[bucket] = (categoryTotals[bucket] ?? 0) + co2e;
    }

    const updateFields: Record<string, unknown> = { SuplScope3Emission: round2(overall) };
    if (inventoryId) updateFields.AnnualEmssnInventoryId = inventoryId;
    for (const field of Object.values(SCOPE3_CATEGORY_TO_SUPPL_FIELD)) {
      updateFields[field] = round2(categoryTotals[field] ?? 0);
    }
    await dataTools.updateRecord("Scope3CrbnFtprnt", summary.Scope3CrbnFtprntId, updateFields);
  }
  return result;
}

// ───────── orchestrator ─────────

/**
 * calculate_footprints entry point. Idempotent and safe to re-run: every
 * header is found-or-created by (source, year), and every Suppl total is
 * recomputed from scratch from whichever children are currently linked to
 * that header — never accumulated on top of a prior run's total.
 */
export async function calculateFootprints(opts: { year: string }): Promise<CalculateFootprintsResult> {
  const { year } = opts;
  if (!/^\d{4}$/.test(year)) {
    throw new Error(`calculate_footprints requires a 4-digit year string (e.g. "2025"), got "${year}".`);
  }
  const warnings: string[] = [];

  const dpe = await detectDpe(warnings);

  let inventoryId: string | undefined;
  let annualInventoryUpdated = false;
  try {
    const inventory = (await dataTools.runSoql(
      `SELECT Id FROM AnnualEmssnInventory WHERE Year = '${soqlEscape(year)}' LIMIT 1`
    )) as { records: Array<{ Id: string }> };
    inventoryId = inventory.records[0]?.Id;
    if (!inventoryId) {
      warnings.push(
        `No AnnualEmssnInventory found for Year ${year} — footprint headers below will be created without an ` +
          `AnnualEmssnInventoryId link. Run scaffold_sample_data first, or create one manually, then re-run ` +
          `calculate_footprints to backfill the link.`
      );
    }
  } catch (err) {
    warnings.push(
      `Could not query AnnualEmssnInventory (${err instanceof Error ? err.message : String(err)}) — proceeding ` +
        `without an inventory link.`
    );
  }

  const stationary = await runTier("Stationary", warnings, () =>
    processStationaryFootprints(year, inventoryId, warnings)
  );
  const vehicle = await runTier("Vehicle", warnings, () => processVehicleFootprints(year, inventoryId, warnings));
  const waste = await runTier("Waste", warnings, () => processWasteFootprints(year, inventoryId, warnings));
  const water = await runTier("Water", warnings, () => processWaterFootprints(year, warnings));
  const scope3Travel = await runTier("Scope3 travel", warnings, () =>
    processScope3TravelFootprints(year, inventoryId, warnings)
  );
  const scope3Procurement = await runTier("Scope3 procurement", warnings, () =>
    processScope3ProcurementFootprint(year, inventoryId, warnings)
  );

  if (inventoryId) {
    try {
      const scope1 =
        (await sumAcrossInventory("StnryAssetCrbnFtprnt", ["SuplScope1Emissions"], inventoryId)) +
        (await sumAcrossInventory("VehicleAssetCrbnFtprnt", ["SuplScope1Emissions"], inventoryId)) +
        (await sumAcrossInventory("WasteFootprint", ["SuplScope1EmissionsInTco2e"], inventoryId));
      // Location-based, not market-based — a defensible default, not this org's confirmed reporting
      // method. AnnualEmssnInventory.Scope2EmissionsType records which one the org actually uses;
      // reading/branching on that is left for a future refinement rather than guessed here.
      const scope2 =
        (await sumAcrossInventory("StnryAssetCrbnFtprnt", ["SuplScope2LocationBasedEmssn"], inventoryId)) +
        (await sumAcrossInventory("VehicleAssetCrbnFtprnt", ["SuplScope2LocationBasedEmssn"], inventoryId));
      const scope3 =
        (await sumAcrossInventory(
          "StnryAssetCrbnFtprnt",
          ["SuplScope3UpstrmEmissions", "SuplScope3DnstrmEmissions"],
          inventoryId
        )) +
        (await sumAcrossInventory(
          "VehicleAssetCrbnFtprnt",
          ["SuplScope3UpstrmEmissions", "SuplScope3DnstrmEmissions"],
          inventoryId
        )) +
        (await sumAcrossInventory(
          "WasteFootprint",
          ["SuplScp3UpstrmWstGenInOper", "SuplScp3DnstrmEndLifeSoldPrdct"],
          inventoryId
        )) +
        (await sumAcrossInventory("Scope3CrbnFtprnt", ["SuplScope3Emission"], inventoryId));

      // Light-touch rollup: only the 3 top-line *Override fields (createable — the same
      // Suppl-vs-DPE-calculated escape-valve pattern one level up), plus TotalSuplScope3EmssnOverride
      // (the scope3-specific "supplemental" counterpart), never the ~20 granular per-category
      // Override fields, to avoid asserting a false precision this tool's illustrative numbers don't
      // earn.
      await dataTools.updateRecord("AnnualEmssnInventory", inventoryId, {
        TotalScope1EmissionsOverride: round2(scope1),
        TotalScope2EmissionsOverride: round2(scope2),
        TotalScope3EmissionsOverride: round2(scope3),
        TotalSuplScope3EmssnOverride: round2(scope3),
      });
      annualInventoryUpdated = true;
    } catch (err) {
      warnings.push(
        `Could not roll up totals onto AnnualEmssnInventory ${inventoryId} ` +
          `(${err instanceof Error ? err.message : String(err)}).`
      );
    }
  }

  return {
    year,
    dpe,
    stationary,
    vehicle,
    waste,
    water,
    scope3Travel,
    scope3Procurement,
    annualInventoryId: inventoryId,
    annualInventoryUpdated,
    warnings,
    notYetImplemented: [
      "DPE batch-job invocation (Apex) — this tool detects BatchCalcJobDefinition and reports it, but never " +
        "runs one; see the file header for why.",
      "*Item / detail footprint objects (StnryAssetCrbnFtprntItm, WasteFootprintItem, StnryAssetWtrFtprntItm) — " +
        "object-level createable=false; only DPE can populate them.",
      "AnnualEmssnInventory's ~20 granular per-category Override fields — only the 3 top-line totals ( + " +
        "TotalSuplScope3EmssnOverride) are written, to avoid asserting false precision.",
      "Fixture-manifest / teardown integration — headers created here are returned in each tier's createdIds " +
        "but are NOT added to scaffold_sample_data's fixture manifest, so teardown_sample_data alone will not " +
        "remove them (see file header).",
    ],
  };
}
