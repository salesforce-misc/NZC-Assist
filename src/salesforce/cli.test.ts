import { beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";

const { execFileMock } = vi.hoisted(() => ({ execFileMock: vi.fn() }));

vi.mock("node:child_process", () => ({
  execFile: (
    file: string,
    args: string[],
    _options: unknown,
    callback: (err: unknown, result?: { stdout: string; stderr: string }) => void
  ) => {
    const { stdout = "", stderr = "", error } = execFileMock(file, args) ?? {};
    if (error) {
      Object.assign(error, { stdout, stderr });
      callback(error);
    } else {
      callback(null, { stdout, stderr });
    }
  },
}));

import * as cli from "./cli.js";

function jsonOk<T>(result: T) {
  return { stdout: JSON.stringify({ status: 0, result }) };
}

beforeEach(() => {
  execFileMock.mockReset();
  cli.clearTargetOrg();
});

describe("withTargetOrg / org targeting", () => {
  it("injects --target-org into argv once an org is selected", async () => {
    execFileMock.mockReturnValue(jsonOk({ records: [], totalSize: 0 }));
    cli.setTargetOrg("myorg");

    await cli.runSoql("SELECT Id FROM Account");

    const [, args] = execFileMock.mock.calls[0];
    expect(args).toContain("--target-org");
    expect(args[args.indexOf("--target-org") + 1]).toBe("myorg");
  });

  it("rejects without calling sf at all when no org is selected", async () => {
    await expect(cli.runSoql("SELECT Id FROM Account")).rejects.toThrow(/No target org selected/);
    expect(execFileMock).not.toHaveBeenCalled();
  });
});

describe("sfJson parsing", () => {
  it("parses JSON stdout and unwraps .result", async () => {
    cli.setTargetOrg("myorg");
    execFileMock.mockReturnValue(jsonOk({ records: [{ Id: "001xx" }], totalSize: 1 }));

    const result = await cli.runSoql("SELECT Id FROM Account");

    expect(result).toEqual({ records: [{ Id: "001xx" }], totalSize: 1 });
  });

  it("throws SfCliError using the body's message when the JSON result reports a non-zero status", async () => {
    cli.setTargetOrg("myorg");
    execFileMock.mockReturnValue({ stdout: JSON.stringify({ status: 1, message: "INVALID_FIELD: no such column" }) });

    await expect(cli.describeSObject("Bogus__c")).rejects.toThrow(/INVALID_FIELD/);
  });
});

describe("error propagation", () => {
  it("surfaces stderr's parsed message when the process exits non-zero with JSON stderr", async () => {
    cli.setTargetOrg("myorg");
    const error = Object.assign(new Error("exit 1"), { code: 1 });
    execFileMock.mockReturnValue({
      error,
      stderr: JSON.stringify({ status: 1, message: "NetZeroCloud is not enabled in this org" }),
    });

    await expect(cli.describeSObject("StnryAssetEnvrSrc")).rejects.toThrow(/NetZeroCloud is not enabled/);
  });

  it("surfaces raw stderr verbatim when it is not JSON", async () => {
    cli.setTargetOrg("myorg");
    const error = Object.assign(new Error("exit 127"), { code: 127 });
    execFileMock.mockReturnValue({ error, stderr: "command not found: sf" });

    await expect(cli.describeSObject("X")).rejects.toThrow(/command not found: sf/);
  });
});

describe("runApex temp-file lifecycle", () => {
  it("writes the Apex code to a real temp file, points --file at it, and removes it afterward", async () => {
    cli.setTargetOrg("myorg");
    let capturedPath: string | undefined;
    let capturedContents: string | undefined;
    execFileMock.mockImplementation((_file: string, args: string[]) => {
      capturedPath = args[args.indexOf("--file") + 1];
      capturedContents = readFileSync(capturedPath, "utf8");
      return jsonOk({ success: true });
    });

    await cli.runApex("System.debug('hi from a real temp file');");

    expect(capturedContents).toBe("System.debug('hi from a real temp file');");
    expect(capturedPath).toBeTruthy();
    expect(existsSync(capturedPath!)).toBe(false);
  });

  it("removes the temp file even when the sf call fails", async () => {
    cli.setTargetOrg("myorg");
    let capturedPath: string | undefined;
    execFileMock.mockImplementation((_file: string, args: string[]) => {
      capturedPath = args[args.indexOf("--file") + 1];
      return { error: Object.assign(new Error("boom"), { code: 1 }), stderr: "boom" };
    });

    await expect(cli.runApex("this will fail")).rejects.toThrow();

    expect(existsSync(capturedPath!)).toBe(false);
  });
});

describe("bulk CSV loading", () => {
  it("uses `data import bulk` (plain insert) when no externalId is given", async () => {
    cli.setTargetOrg("myorg");
    let capturedPath: string | undefined;
    let capturedContents: string | undefined;
    execFileMock.mockImplementation((_file: string, args: string[]) => {
      expect(args).toContain("import");
      expect(args).not.toContain("--external-id");
      capturedPath = args[args.indexOf("--file") + 1];
      // Must read here, synchronously within the mocked sf call — the real
      // bulkUpsertRecords deletes the temp dir in its `finally` before the
      // awaited call below ever resolves.
      capturedContents = readFileSync(capturedPath, "utf8");
      return jsonOk({ jobInfo: { id: "750xx", state: "JobComplete" } });
    });

    const result = await cli.bulkUpsertRecords("StnryAssetEnvrSrc", [{ Name: "HQ" }, { Name: "Warehouse" }]);

    expect(result).toEqual({ jobId: "750xx", state: "JobComplete", raw: { jobInfo: { id: "750xx", state: "JobComplete" } } });
    expect(capturedContents).toBe("Name\nHQ\nWarehouse");
    expect(existsSync(capturedPath!)).toBe(false);
  });

  it("uses `data upsert bulk --external-id` when an externalId is given", async () => {
    cli.setTargetOrg("myorg");
    execFileMock.mockImplementation((_file: string, args: string[]) => {
      expect(args).toContain("upsert");
      expect(args).toContain("--external-id");
      expect(args[args.indexOf("--external-id") + 1]).toBe("External_Id__c");
      return jsonOk({ jobInfo: { id: "750yy", state: "JobComplete" } });
    });

    await cli.bulkUpsertRecords("Account", [{ Name: "Acme" }], { externalId: "External_Id__c" });
  });
});
