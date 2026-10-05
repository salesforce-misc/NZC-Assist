import { describe, expect, it } from "vitest";
import { prepareRemoteSiteUrls, remoteSiteXml } from "./remote-site.js";

describe("prepareRemoteSiteUrls", () => {
  it("derives production URLs", () => {
    expect(prepareRemoteSiteUrls("https://acme.my.salesforce.com", "NA123")).toEqual({
      visualforceUrl: "https://acme--omnistudio.NA123.visual.force.com",
      legacyVisualforceUrl: "https://acme--omnistudio.vf.force.com",
      lightningUrl: "https://acme.lightning.force.com",
    });
  });

  it("includes the org category for sandbox and scratch hosts", () => {
    expect(prepareRemoteSiteUrls("https://acme.sandbox.my.salesforce.com", "CS45")).toEqual({
      visualforceUrl: "https://acme--omnistudio.CS45.visual.force.com",
      legacyVisualforceUrl: "https://acme--omnistudio.sandbox.vf.force.com",
      lightningUrl: "https://acme.sandbox.lightning.force.com",
    });
    expect(prepareRemoteSiteUrls("https://acme-dev.scratch.my.salesforce.com", "USA99").legacyVisualforceUrl).toBe(
      "https://acme-dev--omnistudio.scratch.vf.force.com"
    );
  });

  it("honors a custom namespace", () => {
    expect(prepareRemoteSiteUrls("https://acme.my.salesforce.com", "NA1", "vlocity_ins").legacyVisualforceUrl).toBe(
      "https://acme--vlocity_ins.vf.force.com"
    );
  });
});

describe("remoteSiteXml", () => {
  it("renders an active remote site with the URL", () => {
    const xml = remoteSiteXml("https://x.lightning.force.com");
    expect(xml).toContain("<isActive>true</isActive>");
    expect(xml).toContain("<url>https://x.lightning.force.com</url>");
  });
});
