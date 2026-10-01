import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * pluginPath is mocked to a throwaway temp dir seeded with a minimal synthetic
 * data/seed + data/generators tree (not the real committed data/) — same
 * discipline as rules-executor.test.ts's loadRules test: this file's
 * assertions should track this module's orchestration logic, not drift
 * silently if the real committed seed content changes. Setup happens
 * synchronously inside the vi.mock factory (sync fs APIs), not in beforeAll,
 * because sample-data.ts computes FIXTURES_DIR = pluginPath("data","fixtures")
 * once at module-import time — an async beforeAll would run too late to
 * affect that already-evaluated constant.
 */
const pathsState = vi.hoisted(() => ({ root: "" }));

const {
  runSoqlMock,
  describeSObjectMock,
  createRecordMock,
  importTreeMock,
  bulkUpsertRecordsMock,
  deleteRecordMock,
} = vi.hoisted(() => ({
  runSoqlMock: vi.fn(),
  describeSObjectMock: vi.fn(),
  createRecordMock: vi.fn(),
  importTreeMock: vi.fn(),
  bulkUpsertRecordsMock: vi.fn(),
  deleteRecordMock: vi.fn(),
}));

vi.mock("../salesforce/data.js", () => ({
  runSoql: runSoqlMock,
  describeSObject: describeSObjectMock,
  createRecord: createRecordMock,
  importTree: importTreeMock,
  bulkUpsertRecords: bulkUpsertRecordsMock,
  deleteRecord: deleteRecordMock,
}));

vi.mock("../paths.js", () => {
  const root = mkdtempSync(join(tmpdir(), "nzc-sample-data-test-"));
  pathsState.root = root;

  const seedDir = join(root, "data", "seed");
  const generatorsDir = join(root, "data", "generators");
  mkdirSync(seedDir, { recursive: true });
  mkdirSync(generatorsDir, { recursive: true });

  const specFiles: Record<string, string> = {
    "stnry-asset-energy-use.spec.yaml":
      "sobject: StnryAssetEnrgyUse\ntargetCount: 2\nfuelTypePool: [Electricity]\nrefrigerantChance: 0\n",
    "vehicle-asset-energy-use.spec.yaml": "sobject: VehicleAssetEnrgyUse\ntargetCount: 1\nsplit: [1, 1]\n",
    "generated-waste.spec.yaml": "sobject: GeneratedWaste\ntargetCount: 1\n",
    "stnry-asset-water-activity.spec.yaml": "sobject: StnryAssetWaterActvty\ntargetCount: 1\n",
    "air-travel-energy-use.spec.yaml": "sobject: AirTravelEnrgyUse\ntargetCount: 1\n",
    "hotel-stay-energy-use.spec.yaml": "sobject: HotelStayEnrgyUse\ntargetCount: 1\n",
    "rental-car-energy-use.spec.yaml": "sobject: RentalCarEnrgyUse\ntargetCount: 1\n",
    "ground-travel-energy-use.spec.yaml": "sobject: GroundTravelEnrgyUse\ntargetCount: 1\n",
    "scope3-procurement.spec.yaml": "sobject: Scope3PcmtItem\ntargetCount: 1\n",
  };

  writeFileSync(
    join(seedDir, "accounts-suppliers-plan.json"),
    JSON.stringify([{ sobject: "Account", files: ["accounts.json"] }])
  );
  writeFileSync(
    join(seedDir, "accounts.json"),
    JSON.stringify({ records: [{ attributes: { type: "Account", referenceId: "AccountRef1" }, Name: "Test Account" }] })
  );
  writeFileSync(join(seedDir, "annual-inventory.json"), JSON.stringify({ sobject: "AnnualEmssnInventory", records: [] }));
  writeFileSync(
    join(seedDir, "stnry-sources.json"),
    JSON.stringify({
      sobject: "StnryAssetEnvrSrc",
      records: [
        {
          referenceId: "StnrySrc1",
          recordType: "Commercial_Building",
          fields: { Name: "HQ Building" },
          lookups: {
            ElectricityEmssnFctrId: { sobject: "ElectricityEmssnFctrSet", field: "Name", value: "Standard Grid Mix" },
          },
        },
      ],
    })
  );
  writeFileSync(join(seedDir, "vehicle-sources.json"), JSON.stringify({ sobject: "VehicleAssetEmssnSrc", records: [] }));
  writeFileSync(join(seedDir, "scope3-sources.json"), JSON.stringify({ sobject: "Scope3EmssnSrc", records: [] }));

  for (const [name, content] of Object.entries(specFiles)) {
    writeFileSync(join(generatorsDir, name), content);
  }

  return {
    pluginPath: (...segments: string[]) => join(pathsState.root, ...segments),
  };
});

import { scaffoldSampleData, teardownSampleData } from "./sample-data.js";

const ELECTRICITY_FACTOR_ID = "0XF000000ELECFAC000";

let callOrder: string[] = [];
let capturedEnergyUseRows: Record<string, unknown>[] = [];
let capturedStnrySrcFields: Record<string, unknown> = {};
let stnrySrcId: string | undefined;
let lastBulkRows: Record<string, unknown>[] = [];
let idSeq = 0;
let anchorExists = false;

function nextId(prefix: string): string {
  return `${prefix}${String(++idSeq).padStart(10, "0")}`;
}

async function genericDescribeSObject(sobject: string): Promise<unknown> {
  if (sobject === "StnryAssetEnvrSrc") callOrder.push("precondition:describeSObject");
  return { fields: [] };
}

async function genericRunSoql(query: string): Promise<unknown> {
  if (/^SELECT COUNT\(\) FROM/.test(query)) return { totalSize: 1 };
  if (query.includes("FROM Account WHERE Name = '")) return { totalSize: anchorExists ? 1 : 0 };

  const nameInMatch = query.match(/WHERE Name IN \(([^)]*)\)/);
  if (nameInMatch) {
    const count = nameInMatch[1].split(",").length;
    return { totalSize: count, records: Array.from({ length: count }, () => ({ Id: nextId("RECOVERED") })) };
  }
  if (query.includes("FROM RecordType WHERE")) return { totalSize: 1, records: [{ Id: nextId("RT") }] };
  if (query.includes("FROM PcmtEmssnFctrSetItem")) return { records: [] };
  if (query.includes("FROM ElectricityEmssnFctrSet WHERE")) return { totalSize: 1, records: [{ Id: ELECTRICITY_FACTOR_ID }] };

  const idInMatch = query.match(/WHERE Id IN \(([^)]*)\)/);
  if (idInMatch) {
    const ids = idInMatch[1].split(",").map((s) => s.trim().replace(/^'|'$/g, ""));
    const records = ids.map((id) =>
      id === stnrySrcId
        ? { Id: id, Name: "HQ Building", ElectricityEmssnFctrId: capturedStnrySrcFields.ElectricityEmssnFctrId }
        : { Id: id, Name: "Generic Parent" }
    );
    return { records };
  }

  const fieldMatch = query.match(/WHERE (\w+)\s*=|WHERE (\w+) IN/);
  const field = fieldMatch?.[1] ?? fieldMatch?.[2];
  if (field?.endsWith("Id")) {
    const records = lastBulkRows.map(() => ({ Id: nextId("CHILD") }));
    return { totalSize: records.length, records };
  }

  return { totalSize: 1, records: [{ Id: nextId("LOOKUP") }] };
}

async function genericCreateRecord(object: string, fields: Record<string, unknown>): Promise<unknown> {
  const id = nextId("REC");
  if (object === "StnryAssetEnvrSrc") {
    stnrySrcId = id;
    capturedStnrySrcFields = fields;
    callOrder.push("tier2-5:createRecord:StnryAssetEnvrSrc");
  }
  return { id };
}

async function genericImportTree(): Promise<unknown> {
  callOrder.push("tier1:importTree");
  return [{ refId: "AccountRef1", type: "Account", id: nextId("ACCT") }];
}

async function genericBulkUpsert(object: string, records: Record<string, unknown>[]): Promise<unknown> {
  lastBulkRows = records;
  if (object === "StnryAssetEnrgyUse") {
    capturedEnergyUseRows = records;
    callOrder.push("tier6:bulkUpsertRecords:StnryAssetEnrgyUse");
  }
  return { jobId: nextId("JOB"), state: "JobComplete", raw: {} };
}

beforeEach(() => {
  callOrder = [];
  capturedEnergyUseRows = [];
  capturedStnrySrcFields = {};
  stnrySrcId = undefined;
  lastBulkRows = [];
  anchorExists = false;

  describeSObjectMock.mockReset().mockImplementation(genericDescribeSObject);
  runSoqlMock.mockReset().mockImplementation(genericRunSoql);
  createRecordMock.mockReset().mockImplementation(genericCreateRecord);
  importTreeMock.mockReset().mockImplementation(genericImportTree);
  bulkUpsertRecordsMock.mockReset().mockImplementation(genericBulkUpsert);
  deleteRecordMock.mockReset();
});

afterAll(() => {
  rmSync(pathsState.root, { recursive: true, force: true });
});

describe("scaffoldSampleData — preconditions", () => {
  it("refuses when Net Zero Cloud is not licensed/provisioned", async () => {
    describeSObjectMock.mockReset().mockRejectedValue(new Error("INVALID_TYPE: sObject type not supported"));
    await expect(scaffoldSampleData()).rejects.toThrow(/enable_net_zero_settings/);
  });

  it("refuses when no reference/emission-factor data is loaded at all", async () => {
    runSoqlMock.mockReset().mockImplementation(async (query: string) => {
      if (/^SELECT COUNT\(\) FROM/.test(query)) return { totalSize: 0 };
      return genericRunSoql(query);
    });
    await expect(scaffoldSampleData()).rejects.toThrow(/load_reference_data/);
  });

  it("refuses to reload when the anchor Account already exists, without force", async () => {
    anchorExists = true;
    await expect(scaffoldSampleData()).rejects.toThrow(/Refusing to load sample data/);
  });
});

describe("scaffoldSampleData — dependency order + parent-ID threading", () => {
  it("creates tier 1 before tiers 2-5 before tier 6, threading the parent's resolved factor Id onto generated child rows", async () => {
    const result = await scaffoldSampleData();

    expect(callOrder).toEqual([
      "precondition:describeSObject",
      "tier1:importTree",
      "tier2-5:createRecord:StnryAssetEnvrSrc",
      "tier6:bulkUpsertRecords:StnryAssetEnrgyUse",
    ]);

    // The parent itself was created with its own resolved record type + factor lookup.
    expect(capturedStnrySrcFields.ElectricityEmssnFctrId).toBe(ELECTRICITY_FACTOR_ID);
    expect(typeof capturedStnrySrcFields.RecordTypeId).toBe("string");

    // Every generated child row reuses that same already-resolved parent factor Id,
    // and this only happens after the parent's Id was threaded in as the FK.
    expect(capturedEnergyUseRows).toHaveLength(2);
    for (const row of capturedEnergyUseRows) {
      expect(row.StnryAssetEnvrSrcId).toBe(stnrySrcId);
      expect(row.ElectricityEmissionFactorsId).toBe(ELECTRICITY_FACTOR_ID);
    }

    expect(result.created.StnryAssetEnrgyUse).toBe(2);
  });
});

describe("scaffoldSampleData — partial failure", () => {
  it("persists a fixture manifest naming the fixtureId when tier 1 fails partway through", async () => {
    importTreeMock.mockReset().mockRejectedValue(new Error("DUPLICATE_VALUE: duplicate value found"));

    await expect(scaffoldSampleData()).rejects.toThrow(/fixtureId/);

    expect(callOrder).not.toContain("tier2-5:createRecord:StnryAssetEnvrSrc");
    expect(callOrder).not.toContain("tier6:bulkUpsertRecords:StnryAssetEnrgyUse");
  });
});

describe("teardownSampleData", () => {
  it("deletes records in exact reverse creation order and removes the manifest", async () => {
    const fixtureId = "FIXTURE-TEST-REVERSE";
    const manifestPath = join(pathsState.root, "data", "fixtures", `${fixtureId}.json`);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify([
        { sobject: "Account", id: "001AAA" },
        { sobject: "StnryAssetEnvrSrc", id: "a0XBBB" },
        { sobject: "StnryAssetEnrgyUse", id: "a1XCCC" },
      ])
    );
    const deleteOrder: string[] = [];
    deleteRecordMock.mockReset().mockImplementation(async (sobject: string, id: string) => {
      deleteOrder.push(`${sobject}:${id}`);
    });

    const result = await teardownSampleData(fixtureId);

    expect(deleteOrder).toEqual(["StnryAssetEnrgyUse:a1XCCC", "StnryAssetEnvrSrc:a0XBBB", "Account:001AAA"]);
    expect(result.errors).toHaveLength(0);
    expect(existsSync(manifestPath)).toBe(false);
  });

  it("records a best-effort error for one failed delete without stopping the rest", async () => {
    const fixtureId = "FIXTURE-TEST-PARTIAL-FAIL";
    const manifestPath = join(pathsState.root, "data", "fixtures", `${fixtureId}.json`);
    mkdirSync(dirname(manifestPath), { recursive: true });
    writeFileSync(
      manifestPath,
      JSON.stringify([
        { sobject: "Account", id: "001AAA" },
        { sobject: "StnryAssetEnvrSrc", id: "a0XBBB" },
      ])
    );
    deleteRecordMock.mockReset().mockImplementation(async (sobject: string) => {
      if (sobject === "StnryAssetEnvrSrc") throw new Error("ENTITY_IS_DELETED");
    });

    const result = await teardownSampleData(fixtureId);

    expect(result.deleted).toEqual({ Account: 1 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/ENTITY_IS_DELETED/);
  });
});
