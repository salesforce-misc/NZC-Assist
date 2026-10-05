import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const { deployMetadataMock, runSoqlMock } = vi.hoisted(() => ({ deployMetadataMock: vi.fn(), runSoqlMock: vi.fn() }));

vi.mock("../salesforce/cli.js", () => ({ deployMetadata: deployMetadataMock }));
vi.mock("../salesforce/data.js", () => ({ runSoql: runSoqlMock, describeSObject: vi.fn() }));

import { installDchPackage, installedPackageXml, versionSatisfied } from "./packages.js";

const installedRows = (ns: string, major: number, minor: number) => ({
  records: [{ SubscriberPackage: { NamespacePrefix: ns }, SubscriberPackageVersion: { MajorVersion: major, MinorVersion: minor } }],
});

beforeEach(() => {
  deployMetadataMock.mockReset().mockResolvedValue({});
  runSoqlMock.mockReset().mockResolvedValue({ records: [] });
});

describe("versionSatisfied", () => {
  it("compares major then minor numerically", () => {
    expect(versionSatisfied("250.7", "250.7")).toBe(true);
    expect(versionSatisfied("250.10", "250.7")).toBe(true);
    expect(versionSatisfied("251.0", "250.7")).toBe(true);
    expect(versionSatisfied("250.6", "250.7")).toBe(false);
    expect(versionSatisfied("244.1", "250.0")).toBe(false);
  });
});

describe("installDchPackage", () => {
  it("deploys an InstalledPackage bundle with the default pinned version", async () => {
    let seen: { manifest: string; pkg: string; files: string[] } | undefined;
    deployMetadataMock.mockImplementation(async (dir: string) => {
      seen = {
        manifest: readFileSync(join(dir, "package.xml"), "utf8"),
        pkg: readFileSync(join(dir, "installedPackages", "NZCDCHGRI.installedPackage"), "utf8"),
        files: readdirSync(join(dir, "installedPackages")),
      };
      return {};
    });

    const result = await installDchPackage("gri");

    expect(result).toEqual({ namespace: "NZCDCHGRI", version: "244.1", installed: true });
    expect(seen?.manifest).toContain("<members>NZCDCHGRI</members>");
    expect(seen?.manifest).toContain("<name>InstalledPackage</name>");
    expect(seen?.pkg).toContain("<versionNumber>244.1</versionNumber>");
    expect(seen?.pkg).toContain("<activateRSS>true</activateRSS>");
    expect(seen?.pkg).toContain("<securityType>FULL</securityType>");
  });

  it("uses a version override", async () => {
    const result = await installDchPackage("omnistudio", { version: "252.1" });
    expect(result.version).toBe("252.1");
  });

  it("skips when the same or a newer version is already installed", async () => {
    runSoqlMock.mockResolvedValue(installedRows("omnistudio", 251, 2));
    const result = await installDchPackage("omnistudio");
    expect(result.installed).toBe(false);
    expect(result.skipped).toMatch(/251\.2/);
    expect(deployMetadataMock).not.toHaveBeenCalled();
  });

  it("installs when an older version is present", async () => {
    runSoqlMock.mockResolvedValue(installedRows("omnistudio", 240, 0));
    expect((await installDchPackage("omnistudio")).installed).toBe(true);
  });

  it("retries while the package version is not yet available, then succeeds", async () => {
    deployMetadataMock.mockRejectedValueOnce(new Error("This package is not yet available")).mockResolvedValue({});
    const result = await installDchPackage("cdp", { retryDelayMs: 0 });
    expect(result.installed).toBe(true);
    expect(deployMetadataMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry other errors", async () => {
    deployMetadataMock.mockRejectedValue(new Error("INVALID_ID_FIELD"));
    await expect(installDchPackage("cdp", { retryDelayMs: 0 })).rejects.toThrow(/INVALID_ID_FIELD/);
    expect(deployMetadataMock).toHaveBeenCalledTimes(1);
  });

  it("gives up after the retry budget", async () => {
    deployMetadataMock.mockRejectedValue(new Error("This package is not yet available"));
    await expect(installDchPackage("cdp", { retries: 2, retryDelayMs: 0 })).rejects.toThrow(/not yet available/);
    expect(deployMetadataMock).toHaveBeenCalledTimes(3);
  });
});

describe("installedPackageXml", () => {
  it("renders the requested flags", () => {
    expect(installedPackageXml("1.2", false, "NONE")).toContain("<activateRSS>false</activateRSS>");
  });
});
