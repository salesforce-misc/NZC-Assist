import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  orgDisplay: vi.fn(),
  runApex: vi.fn(),
  deploySourceDir: vi.fn(),
  deployMetadata: vi.fn(),
  vlocityPackDeploy: vi.fn(),
  uploadFile: vi.fn(),
  assignPermset: vi.fn(),
  assignPermsetLicense: vi.fn(),
  runSoql: vi.fn(),
  describeSObject: vi.fn(),
  createRecord: vi.fn(),
}));

vi.mock("../salesforce/cli.js", () => ({
  orgDisplay: m.orgDisplay,
  runApex: m.runApex,
  deploySourceDir: m.deploySourceDir,
  deployMetadata: m.deployMetadata,
  vlocityPackDeploy: m.vlocityPackDeploy,
  uploadFile: m.uploadFile,
}));
vi.mock("../salesforce/data.js", () => ({ runSoql: m.runSoql, describeSObject: m.describeSObject, createRecord: m.createRecord }));
vi.mock("../salesforce/perms.js", () => ({ assignPermset: m.assignPermset, assignPermsetLicense: m.assignPermsetLicense }));

import { setupDchFoundation } from "./foundation.js";
import { setupDchFramework } from "./frameworks.js";
import { setupDch } from "./setup.js";
import { loadDchTemplates } from "./templates.js";

/** State the fake org SOQL answers from. */
let org: {
  psls: string[];
  permsets: string[];
  assignedPsls: string[];
  assignedPermsets: string[];
  installed: { ns: string; major: number; minor: number }[];
  omniProcesses: Record<string, string>; // name → id
  documents: Record<string, string>; // title → id
  links: Set<string>; // `${processId}:${documentId}`
};

function answer(soql: string): { records: unknown[] } {
  if (soql.includes("FROM InstalledSubscriberPackage"))
    return {
      records: org.installed.map((i) => ({
        SubscriberPackage: { NamespacePrefix: i.ns },
        SubscriberPackageVersion: { MajorVersion: i.major, MinorVersion: i.minor },
      })),
    };
  if (soql.includes("FROM Organization")) return { records: [{ InstanceName: "NA1" }] };
  if (soql.includes("FROM User")) return { records: [{ Id: "005USER" }] };
  if (soql.includes("FROM PermissionSetLicenseAssign"))
    return { records: org.assignedPsls.map((n) => ({ PermissionSetLicense: { DeveloperName: n } })) };
  if (soql.includes("FROM PermissionSetAssignment"))
    return { records: org.assignedPermsets.map((n) => ({ PermissionSet: { Name: n } })) };
  if (soql.includes("FROM PermissionSetLicense")) return { records: org.psls.map((n) => ({ DeveloperName: n })) };
  if (soql.includes("FROM PermissionSet")) return { records: org.permsets.map((n) => ({ Name: n })) };
  if (soql.includes("FROM OmniProcess")) {
    const name = /Name = '([^']+)'/.exec(soql)?.[1] ?? "";
    return { records: org.omniProcesses[name] ? [{ Id: org.omniProcesses[name] }] : [] };
  }
  if (soql.includes("FROM ContentDocumentLink")) {
    const [proc, doc] = [/LinkedEntityId = '([^']+)'/.exec(soql)?.[1], /ContentDocumentId = '([^']+)'/.exec(soql)?.[1]];
    return { records: org.links.has(`${proc}:${doc}`) ? [{ Id: "06A" }] : [] };
  }
  if (soql.includes("FROM ContentDocument")) {
    const title = /Title = '([^']+)'/.exec(soql)?.[1] ?? "";
    return { records: org.documents[title] ? [{ Id: org.documents[title] }] : [] };
  }
  throw new Error(`unexpected SOQL: ${soql}`);
}

beforeEach(() => {
  org = {
    psls: ["NetZeroCloudUserPsl", "DataProcessingEnginePsl", "ManufacturingAdvancedAccountForecastPsl"],
    permsets: ["NetZeroManager", "DataProcessingEngineUser"],
    assignedPsls: ["DataProcessingEnginePsl"],
    assignedPermsets: [],
    installed: [],
    omniProcesses: { GRI2023: "0jN1", ESRS2023: "0jN2", CDP2023: "0jN3" },
    documents: {},
    links: new Set(),
  };
  Object.values(m).forEach((f) => f.mockReset());
  m.orgDisplay.mockResolvedValue({ instanceUrl: "https://acme.my.salesforce.com", username: "admin@acme.com" });
  m.runSoql.mockImplementation(async (q: string) => answer(q));
  m.describeSObject.mockResolvedValue({});
  m.runApex.mockResolvedValue({ success: true });
  m.deploySourceDir.mockResolvedValue({});
  m.deployMetadata.mockResolvedValue({});
  m.vlocityPackDeploy.mockResolvedValue({ installed: true, stdout: "done" });
  m.assignPermset.mockImplementation(async (name: string) => {
    org.assignedPermsets.push(name);
    return {};
  });
  m.assignPermsetLicense.mockImplementation(async (name: string) => {
    org.assignedPsls.push(name);
    return { path: "cli" };
  });
  m.createRecord.mockResolvedValue({});
  m.uploadFile.mockImplementation(async (_file: string, title: string) => {
    org.documents[title] = `069-${Object.keys(org.documents).length}`;
    return {};
  });
});

describe("confirm gating", () => {
  it("every setup entry point refuses without confirm: true and touches nothing", async () => {
    await expect(setupDchFoundation()).rejects.toThrow(/confirm: true/);
    await expect(setupDchFramework("gri")).rejects.toThrow(/confirm: true/);
    await expect(setupDch()).rejects.toThrow(/confirm: true/);
    expect(m.describeSObject).not.toHaveBeenCalled();
    expect(m.deployMetadata).not.toHaveBeenCalled();
    expect(m.deploySourceDir).not.toHaveBeenCalled();
  });
});

describe("setupDchFoundation", () => {
  it("stops at the license gate on an unlicensed org", async () => {
    m.describeSObject.mockRejectedValue(new Error("INVALID_TYPE"));
    const steps = await setupDchFoundation({ confirm: true });
    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ step: "license-gate", status: "failed" });
    expect(m.deployMetadata).not.toHaveBeenCalled();
  });

  it("runs the steps in order and reports skipped PSLs/permission sets rather than failing", async () => {
    const steps = await setupDchFoundation({ confirm: true });

    expect(steps.map((s) => s.step)).toEqual([
      "license-gate",
      "assign-permissions",
      "install-omnistudio",
      "omnistudio-remote-sites",
      "deploy-settings",
      "ensure-crm-content-user",
      "docgen-permission-set",
      "deploy-document-generation-settings",
      "docgen-font-resources",
      "deploy-omni-interaction-config",
      "assign-permissions-post-install",
      "deploy-docgen-packs",
    ]);
    expect(steps.every((s) => s.status !== "failed")).toBe(true);

    // Only PSLs/permission sets that exist and aren't yet assigned are assigned.
    expect(m.assignPermsetLicense.mock.calls.map((c) => c[0])).toEqual(["NetZeroCloudUserPsl", "ManufacturingAdvancedAccountForecastPsl"]);
    expect(m.assignPermset.mock.calls.map((c) => c[0])).toEqual(["NetZeroManager", "DataProcessingEngineUser"]);
    const detail = steps[1].detail as { notPresent: string[]; alreadyAssigned: string[] };
    expect(detail.alreadyAssigned).toEqual(["PSL DataProcessingEnginePsl"]);
    expect(detail.notPresent).toContain("PSL TCRMforSustainabilityPsl");
    expect(detail.notPresent).toContain("permset OmniStudioAdmin");

    // Source-format dirs deploy in the DCH project's order; the Apex steps run the DocGen post-install classes.
    expect(m.deploySourceDir.mock.calls.map((c) => c[0])).toEqual([
      "settings",
      "document-generation-settings",
      "omni-interaction-config",
    ]);
    const apex = m.runApex.mock.calls.map((c) => c[0] as string);
    expect(apex[0]).toContain("UserPermissionsSFContentUser = true");
    expect(apex[1]).toContain("DocgenPostInstallClass.createPermissionSet()");
    expect(apex[2]).toContain("DocgenPostInstallClass.processDefaultFontFiles()");

    // OmniStudio package + the three remote sites were each deployed through MDAPI.
    expect(m.deployMetadata).toHaveBeenCalledTimes(2);
  });

  it("picks up permission sets the OmniStudio install delivers on the post-install pass", async () => {
    // OmniStudioAdmin only appears after the package install.
    m.deployMetadata.mockImplementationOnce(async () => {
      org.permsets.push("OmniStudioAdmin");
      return {};
    });
    const steps = await setupDchFoundation({ confirm: true });
    expect(m.assignPermset.mock.calls.map((c) => c[0])).toContain("OmniStudioAdmin");
    expect(steps.find((s) => s.step === "assign-permissions-post-install")?.status).toBe("ok");
  });

  it("skips (not fails) the DocGen packs when the vlocity CLI is missing", async () => {
    m.vlocityPackDeploy.mockResolvedValue({ installed: false });
    const steps = await setupDchFoundation({ confirm: true });
    const last = steps[steps.length - 1];
    expect(last.step).toBe("deploy-docgen-packs");
    expect(last.status).toBe("skipped");
    expect(String(last.detail)).toMatch(/npm install -g vlocity/);
  });

  it("skips the OmniStudio install when it is already present", async () => {
    org.installed = [{ ns: "omnistudio", major: 250, minor: 7 }];
    const steps = await setupDchFoundation({ confirm: true });
    expect(steps.find((s) => s.step === "install-omnistudio")?.status).toBe("skipped");
    expect(m.deployMetadata).toHaveBeenCalledTimes(1); // just the remote sites
  });

  it("stops at the first failing step", async () => {
    m.deploySourceDir.mockRejectedValue(new Error("deploy exploded"));
    const steps = await setupDchFoundation({ confirm: true });
    expect(steps[steps.length - 1]).toMatchObject({ step: "deploy-settings", status: "failed", detail: "deploy exploded" });
    expect(m.runApex).not.toHaveBeenCalled();
  });

  it("fails the Apex step when the script reports failure in its result body", async () => {
    m.runApex.mockResolvedValue({ success: false, exceptionMessage: "System.NoClassDefFoundError" });
    const steps = await setupDchFoundation({ confirm: true });
    expect(steps[steps.length - 1]).toMatchObject({ step: "ensure-crm-content-user", status: "failed" });
  });
});

describe("setupDchFramework", () => {
  it("installs, deploys resources + layouts, uploads then links the template, then deploys the disclosure layout", async () => {
    const steps = await setupDchFramework("gri", { confirm: true });

    expect(steps.map((s) => `${s.step}:${s.status}`)).toEqual([
      "license-gate:ok",
      "install-gri:ok",
      "deploy-gri:ok",
      "deploy-layouts:ok",
      "template:GRI Standards Assessment Responses Template V2:ok",
      "deploy-gri-disclosure:ok",
    ]);
    expect(m.deploySourceDir.mock.calls.map((c) => c[0])).toEqual(["gri", "layouts", "gri-disclosure"]);
    expect(m.uploadFile).toHaveBeenCalledWith(expect.stringMatching(/GRI Standards Assessment Responses Template V2\.docx$/), "GRI Standards Assessment Responses Template V2");
    expect(m.createRecord).toHaveBeenCalledWith("ContentDocumentLink", {
      LinkedEntityId: "0jN1",
      ContentDocumentId: "069-0",
      ShareType: "V",
    });
  });

  it("deploys SASB's action flows before the layouts and links all four sector templates", async () => {
    org.omniProcesses = {
      "Consumer Goods Sector": "0jS1",
      "Financials Sector": "0jS2",
      "Services Sector": "0jS3",
      "Technology and Communications Sector": "0jS4",
    };
    const steps = await setupDchFramework("sasb", { confirm: true });
    expect(m.deploySourceDir.mock.calls.map((c) => c[0])).toEqual(["sasb", "sasb-action-flows", "layouts"]);
    expect(steps.filter((s) => s.step.startsWith("template:") && s.status === "ok")).toHaveLength(4);
  });

  it("does not upload or deploy the trailing layout when a template can't link, and reports which", async () => {
    org.omniProcesses = {}; // framework resources not activated
    const steps = await setupDchFramework("esrs", { confirm: true });
    const tpl = steps.find((s) => s.step.startsWith("template:"));
    expect(tpl?.status).toBe("failed");
    expect(String(tpl?.detail)).toMatch(/No active OmniProcess named "ESRS2023"/);
    expect(m.uploadFile).not.toHaveBeenCalled();
    expect(m.deploySourceDir.mock.calls.map((c) => c[0])).not.toContain("esrs-disclosure");
  });

  it("passes a package version override through to the install", async () => {
    await setupDchFramework("cdp", { confirm: true, packageVersion: "245.0" });
    expect(m.deployMetadata).toHaveBeenCalledTimes(1); // the InstalledPackage deploy
  });
});

describe("loadDchTemplates", () => {
  it("is idempotent: a second run uploads and links nothing", async () => {
    await loadDchTemplates("cdp");
    m.uploadFile.mockClear();
    m.createRecord.mockClear();
    org.links.add("0jN3:069-0");

    const again = await loadDchTemplates("cdp");

    expect(again[0]).toMatchObject({ status: "skipped", detail: "already uploaded and linked" });
    expect(m.uploadFile).not.toHaveBeenCalled();
    expect(m.createRecord).not.toHaveBeenCalled();
  });

  it("reuses an already-uploaded document and only creates the link", async () => {
    org.documents["ESRS Standards Assessment Responses Template V1"] = "069-existing";
    const [result] = await loadDchTemplates("esrs");
    expect(result.status).toBe("ok");
    expect(m.uploadFile).not.toHaveBeenCalled();
    expect(m.createRecord).toHaveBeenCalledWith("ContentDocumentLink", expect.objectContaining({ ContentDocumentId: "069-existing" }));
  });

  it("covers every framework when none is given", async () => {
    const results = await loadDchTemplates();
    expect(results).toHaveLength(7);
  });
});

describe("setupDch", () => {
  it("stops after a failing stage without starting the next framework", async () => {
    org.omniProcesses = {}; // GRI's template link fails
    const stages = await setupDch({ confirm: true });
    expect(stages.map((s) => s.stage)).toEqual(["foundation", "gri"]);
  });
});
