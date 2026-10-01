import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ValidationRule } from "./rules-loader.js";

const { runSoqlMock, describeSObjectMock, listPermissionSetsMock, retrieveMetadataExtractedMock } = vi.hoisted(() => ({
  runSoqlMock: vi.fn(),
  describeSObjectMock: vi.fn(),
  listPermissionSetsMock: vi.fn(),
  retrieveMetadataExtractedMock: vi.fn(),
}));

vi.mock("../salesforce/data.js", () => ({
  runSoql: runSoqlMock,
  describeSObject: describeSObjectMock,
}));
vi.mock("../salesforce/perms.js", () => ({
  listPermissionSets: listPermissionSetsMock,
}));
vi.mock("../salesforce/metadata.js", () => ({
  retrieveMetadataExtracted: retrieveMetadataExtractedMock,
}));

import { executeRules } from "./rules-executor.js";
import { loadRules } from "./rules-loader.js";

function rule(check: ValidationRule["check"], overrides: Partial<ValidationRule> = {}): ValidationRule {
  return {
    id: "test-rule",
    group: "foundation",
    description: "A test rule",
    severity: "error",
    check,
    ...overrides,
  };
}

beforeEach(() => {
  runSoqlMock.mockReset();
  describeSObjectMock.mockReset();
  listPermissionSetsMock.mockReset();
  retrieveMetadataExtractedMock.mockReset();
});

describe("sobject-exists", () => {
  it("passes when describe_sobject succeeds", async () => {
    describeSObjectMock.mockResolvedValue({ name: "StnryAssetEnvrSrc" });
    const [result] = await executeRules([rule({ type: "sobject-exists", sobject: "StnryAssetEnvrSrc" })]);
    expect(result.status).toBe("pass");
  });

  it("fails (error severity) when describe_sobject throws", async () => {
    describeSObjectMock.mockRejectedValue(new Error("INVALID_TYPE: sObject type not supported"));
    const [result] = await executeRules([rule({ type: "sobject-exists", sobject: "StnryAssetEnvrSrc" }, { severity: "error" })]);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/INVALID_TYPE/);
  });
});

describe("psl-license-assignment", () => {
  it("passes when the PSL has at least one used license", async () => {
    listPermissionSetsMock.mockResolvedValue({
      permissionSetLicenses: [{ Id: "0PL1", DeveloperName: "NetZeroCloudUserPsl", MasterLabel: "x", TotalLicenses: 10, UsedLicenses: 3 }],
      permissionSets: [],
    });
    const [result] = await executeRules([
      rule({ type: "psl-license-assignment", psl: "NetZeroCloudUserPsl", target: "all-active-users" }),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails (warn severity) when the PSL exists but has zero used licenses", async () => {
    listPermissionSetsMock.mockResolvedValue({
      permissionSetLicenses: [{ Id: "0PL1", DeveloperName: "DataProcessingEnginePsl", MasterLabel: "x", TotalLicenses: 5, UsedLicenses: 0 }],
      permissionSets: [],
    });
    const [result] = await executeRules([
      rule({ type: "psl-license-assignment", psl: "DataProcessingEnginePsl", target: "all-active-users" }, { severity: "warning" }),
    ]);
    expect(result.status).toBe("warn");
  });

  it("fails when the PSL is not found in the org at all", async () => {
    listPermissionSetsMock.mockResolvedValue({ permissionSetLicenses: [], permissionSets: [] });
    const [result] = await executeRules([
      rule({ type: "psl-license-assignment", psl: "Nonexistent", target: "all-active-users" }, { severity: "error" }),
    ]);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/not found/);
  });

  it("skips (does not fail) an unsupported target value instead of guessing", async () => {
    const [result] = await executeRules([
      rule({ type: "psl-license-assignment", psl: "NetZeroCloudUserPsl", target: "some-future-criteria" }, { severity: "error" }),
    ]);
    expect(result.status).toBe("skip");
    expect(listPermissionSetsMock).not.toHaveBeenCalled();
  });
});

describe("psl-assignment", () => {
  it("passes when at least one active user is assigned the permission set", async () => {
    runSoqlMock.mockResolvedValue({ totalSize: 2 });
    const [result] = await executeRules([
      rule({ type: "psl-assignment", permissionSet: "NetZeroManager", target: "all-active-users" }),
    ]);
    expect(result.status).toBe("pass");
    const [query] = runSoqlMock.mock.calls[0];
    expect(query).toContain("PermissionSet.Name = 'NetZeroManager'");
    expect(query).toContain("Assignee.IsActive = true");
  });

  it("fails when zero active users are assigned", async () => {
    runSoqlMock.mockResolvedValue({ totalSize: 0 });
    const [result] = await executeRules([
      rule({ type: "psl-assignment", permissionSet: "NetZeroManager", target: "all-active-users" }, { severity: "warning" }),
    ]);
    expect(result.status).toBe("warn");
  });
});

describe("metadata / hasRecordTypes", () => {
  it("passes when every required record type is present", async () => {
    runSoqlMock.mockResolvedValue({ records: [{ DeveloperName: "Commercial_Building" }, { DeveloperName: "Data_Center" }] });
    const [result] = await executeRules([
      rule({ type: "metadata", object: "StnryAssetEnvrSrc", hasRecordTypes: ["Commercial_Building", "Data_Center"] }),
    ]);
    expect(result.status).toBe("pass");
  });

  it("fails and names the missing record type(s)", async () => {
    runSoqlMock.mockResolvedValue({ records: [{ DeveloperName: "Commercial_Building" }] });
    const [result] = await executeRules([
      rule(
        { type: "metadata", object: "StnryAssetEnvrSrc", hasRecordTypes: ["Commercial_Building", "Data_Center"] },
        { severity: "error" }
      ),
    ]);
    expect(result.status).toBe("fail");
    expect(result.message).toMatch(/Data_Center/);
    expect(result.message).not.toMatch(/Commercial_Building is missing/);
  });
});

describe("soql / expect", () => {
  it.each([
    ["=", 0, 0, "pass"],
    ["=", 1, 0, "fail"],
    [">", 5, 0, "pass"],
    [">", 0, 0, "fail"],
    [">=", 300, 300, "pass"],
    ["<", 2, 5, "pass"],
  ] as const)("operator %s: actual %d vs expected %d -> %s", async (operator, actual, value, expected) => {
    runSoqlMock.mockResolvedValue({ totalSize: actual });
    const [result] = await executeRules([
      rule({ type: "soql", query: "SELECT COUNT() FROM X", expect: { operator, value } }, { severity: "error" }),
    ]);
    expect(result.status).toBe(expected);
  });

  it("skips when the query itself throws", async () => {
    runSoqlMock.mockRejectedValue(new Error("INVALID_FIELD"));
    const [result] = await executeRules([
      rule({ type: "soql", query: "SELECT COUNT() FROM Bogus", expect: { operator: ">", value: 0 } }),
    ]);
    expect(result.status).toBe("skip");
    expect(result.message).toMatch(/INVALID_FIELD/);
  });
});

describe("industries-setting", () => {
  const SETTINGS_XML = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<IndustriesSettings xmlns="http://soap.sforce.com/2006/04/metadata">',
    "    <enableSustainabilityCloud>true</enableSustainabilityCloud>",
    "    <enableSCWasteManagement>false</enableSCWasteManagement>",
    "</IndustriesSettings>",
  ].join("\n");

  /** Mimics the real retrieveMetadataExtracted contract: given the temp dir the executor already created, materializes settings/Industries.settings under it and returns the "unpackaged" dir. */
  function mockSettingsRetrieve(xml: string) {
    retrieveMetadataExtractedMock.mockImplementation(async (_manifest: string, dir: string) => {
      const settingsDir = join(dir, "unpackaged", "settings");
      await mkdir(settingsDir, { recursive: true });
      await writeFile(join(settingsDir, "Industries.settings"), xml, "utf8");
      return join(dir, "unpackaged");
    });
  }

  it("passes when the flag is true in the retrieved settings", async () => {
    mockSettingsRetrieve(SETTINGS_XML);
    const [result] = await executeRules([rule({ type: "industries-setting", flag: "enableSustainabilityCloud" })]);
    expect(result.status).toBe("pass");
  });

  it("fails when the flag is false in the retrieved settings", async () => {
    mockSettingsRetrieve(SETTINGS_XML);
    const [result] = await executeRules([
      rule({ type: "industries-setting", flag: "enableSCWasteManagement" }, { severity: "warning" }),
    ]);
    expect(result.status).toBe("warn");
  });

  it("skips when the flag name does not appear in the retrieved settings at all", async () => {
    mockSettingsRetrieve(SETTINGS_XML);
    const [result] = await executeRules([rule({ type: "industries-setting", flag: "enableSomeFlagThatDoesNotExist" })]);
    expect(result.status).toBe("skip");
  });

  it("skips every industries-setting rule (without skipping others) when the retrieve itself fails", async () => {
    retrieveMetadataExtractedMock.mockRejectedValue(new Error("org has no NZC license"));
    describeSObjectMock.mockResolvedValue({ name: "StnryAssetEnvrSrc" });

    const results = await executeRules([
      rule({ type: "industries-setting", flag: "enableSustainabilityCloud" }, { id: "a" }),
      rule({ type: "industries-setting", flag: "enableSCWasteManagement" }, { id: "b" }),
      rule({ type: "sobject-exists", sobject: "StnryAssetEnvrSrc" }, { id: "c" }),
    ]);

    expect(results.map((r) => r.status)).toEqual(["skip", "skip", "pass"]);
    // One retrieve shared across both industries-setting checks in this call, not one per rule.
    expect(retrieveMetadataExtractedMock).toHaveBeenCalledTimes(1);
  });
});

describe("group filtering", () => {
  it("only runs rules in the requested group", async () => {
    describeSObjectMock.mockResolvedValue({ name: "x" });
    runSoqlMock.mockResolvedValue({ totalSize: 1 });
    const rules = [
      rule({ type: "sobject-exists", sobject: "StnryAssetEnvrSrc" }, { id: "a", group: "foundation" }),
      rule({ type: "soql", query: "SELECT COUNT() FROM X", expect: { operator: ">", value: 0 } }, { id: "b", group: "reference-data" }),
    ];
    const results = await executeRules(rules, "foundation");
    expect(results).toHaveLength(1);
    expect(results[0].rule.id).toBe("a");
  });

  it("treats \"all\" the same as omitting the group", async () => {
    describeSObjectMock.mockResolvedValue({ name: "x" });
    const results = await executeRules([rule({ type: "sobject-exists", sobject: "x" })], "all");
    expect(results).toHaveLength(1);
  });
});

describe("loadRules", () => {
  it("skips _-prefixed files and parses multi-document YAML, dropping the comment-only preamble", async () => {
    const dir = await mkdtemp(join(tmpdir(), "nzc-rules-test-"));
    try {
      await writeFile(
        join(dir, "_schema.yaml"),
        "id: should-never-load\ngroup: foundation\ndescription: x\nseverity: error\ncheck:\n  type: sobject-exists\n  sobject: X\n"
      );
      await writeFile(
        join(dir, "sample.yaml"),
        [
          "# a leading comment preamble, like every real rule file has",
          "---",
          "id: rule-one",
          "group: foundation",
          "description: first",
          "severity: error",
          "check:",
          "  type: sobject-exists",
          "  sobject: StnryAssetEnvrSrc",
          "---",
          "id: rule-two",
          "group: data-integrity",
          "description: second",
          "severity: warning",
          "check:",
          "  type: soql",
          "  query: SELECT COUNT() FROM X",
          "  expect:",
          "    operator: '>'",
          "    value: 0",
          "",
        ].join("\n")
      );

      const rules = await loadRules(dir);

      expect(rules.map((r) => r.id).sort()).toEqual(["rule-one", "rule-two"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
