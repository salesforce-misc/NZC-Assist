import { beforeEach, describe, expect, it, vi } from "vitest";

const { createScratchOrgMock, deleteScratchOrgMock, setTargetOrgMock, listOrgsMock, describeSObjectMock } = vi.hoisted(() => ({
  createScratchOrgMock: vi.fn(),
  deleteScratchOrgMock: vi.fn(),
  setTargetOrgMock: vi.fn(),
  listOrgsMock: vi.fn(),
  describeSObjectMock: vi.fn(),
}));

vi.mock("../salesforce/cli.js", () => ({
  createScratchOrg: createScratchOrgMock,
  deleteScratchOrg: deleteScratchOrgMock,
  setTargetOrg: setTargetOrgMock,
  listOrgs: listOrgsMock,
}));

vi.mock("../salesforce/data.js", () => ({
  describeSObject: describeSObjectMock,
}));

import { createNzcScratchOrg, deleteNzcScratchOrg } from "./scratch-org.js";

beforeEach(() => {
  createScratchOrgMock.mockReset().mockResolvedValue({ orgId: "00Dxx0000000001EAA" });
  deleteScratchOrgMock.mockReset().mockResolvedValue({ success: true });
  setTargetOrgMock.mockReset();
  listOrgsMock.mockReset().mockResolvedValue({ devHubs: [{ alias: "nzc-gus", username: "gus@nzc.preview" }] });
  describeSObjectMock.mockReset().mockResolvedValue({ fields: [] });
});

describe("createNzcScratchOrg", () => {
  it("refuses without confirm: true, and never calls the CLI", async () => {
    await expect(createNzcScratchOrg({ alias: "test-org" })).rejects.toThrow(/confirm: true/);
    expect(createScratchOrgMock).not.toHaveBeenCalled();
  });

  it("refuses when no DevHub is authenticated and none was passed explicitly", async () => {
    listOrgsMock.mockResolvedValue({ devHubs: [] });
    await expect(createNzcScratchOrg({ alias: "test-org", confirm: true })).rejects.toThrow(/No DevHub is authenticated/);
    expect(createScratchOrgMock).not.toHaveBeenCalled();
  });

  it("proceeds without checking devHubs when one is passed explicitly", async () => {
    listOrgsMock.mockResolvedValue({ devHubs: [] });
    await createNzcScratchOrg({ alias: "test-org", confirm: true, devHub: "some-other-hub" });
    expect(createScratchOrgMock).toHaveBeenCalledWith(
      expect.stringContaining("project-scratch-def.json"),
      "test-org",
      expect.objectContaining({ devHub: "some-other-hub" })
    );
  });

  it("creates the org, sets it as target, and reports a successful license probe", async () => {
    const result = await createNzcScratchOrg({ alias: "test-org", confirm: true });

    expect(createScratchOrgMock).toHaveBeenCalledWith(expect.stringContaining("project-scratch-def.json"), "test-org", {
      devHub: undefined,
      durationDays: undefined,
      setDefault: false,
    });
    expect(setTargetOrgMock).toHaveBeenCalledWith("test-org");
    expect(describeSObjectMock).toHaveBeenCalledWith("StnryAssetEnvrSrc");
    expect(result.licenseProbe).toEqual({ provisioned: true });
    expect(result.alias).toBe("test-org");
  });

  it("does not set the org as target when setAsTarget is false", async () => {
    await createNzcScratchOrg({ alias: "test-org", confirm: true, setAsTarget: false });
    expect(setTargetOrgMock).not.toHaveBeenCalled();
  });

  it("reports a failed license probe instead of throwing, when the scratch-def didn't provision it", async () => {
    describeSObjectMock.mockRejectedValue(new Error("INVALID_TYPE: sObject type not supported"));

    const result = await createNzcScratchOrg({ alias: "test-org", confirm: true });

    expect(result.licenseProbe.provisioned).toBe(false);
    expect(result.licenseProbe.detail).toMatch(/INVALID_TYPE/);
  });
});

describe("deleteNzcScratchOrg", () => {
  it("refuses without confirm: true", async () => {
    await expect(deleteNzcScratchOrg("test-org")).rejects.toThrow(/confirm: true/);
    expect(deleteScratchOrgMock).not.toHaveBeenCalled();
  });

  it("deletes the org when confirmed", async () => {
    await deleteNzcScratchOrg("test-org", true);
    expect(deleteScratchOrgMock).toHaveBeenCalledWith("test-org");
  });
});
