/**
 * OmniStudio remote site settings. Their URLs embed the org's instance and the
 * OmniStudio namespace, so they can't be committed — they're derived from the
 * org's instance URL at runtime. The URL derivation mirrors CumulusCI's
 * OmniStudioDeployRemoteSiteSettings (prepare_remote_site_urls / create_vf_url).
 */

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cli from "../salesforce/cli.js";
import { query } from "./common.js";

export const OMNI_NAMESPACE = "omnistudio";
const DNS = ".my.salesforce.com";

export interface RemoteSiteUrls {
  visualforceUrl: string;
  legacyVisualforceUrl: string;
  lightningUrl: string;
}

function createVfUrl(namespace: string, instanceUrl: string, legacy: boolean, instance: string, org?: string): string {
  const match = org ? `.${org}${DNS}` : DNS;
  const replacement = legacy
    ? org
      ? `--${namespace}.${org}.vf.force.com`
      : `--${namespace}.vf.force.com`
    : `--${namespace}.${instance}.visual.force.com`;
  return instanceUrl.replace(match, replacement);
}

export function prepareRemoteSiteUrls(instanceUrl: string, instance: string, namespace = OMNI_NAMESPACE): RemoteSiteUrls {
  // "https://acme.sandbox.my.salesforce.com" → category "sandbox" (scratch orgs likewise); production has none.
  const category = /^[^.]+\.([^.]+)\.my\.salesforce\.com/.exec(instanceUrl)?.[1];
  const org = category && instanceUrl.includes(`${category}${DNS}`) ? category : undefined;
  return {
    visualforceUrl: createVfUrl(namespace, instanceUrl, false, instance, org),
    legacyVisualforceUrl: createVfUrl(namespace, instanceUrl, true, instance, org),
    lightningUrl: instanceUrl.replace(DNS, ".lightning.force.com"),
  };
}

export function remoteSiteXml(url: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<RemoteSiteSetting xmlns="http://soap.sforce.com/2006/04/metadata">
    <description></description>
    <disableProtocolSecurity>false</disableProtocolSecurity>
    <isActive>true</isActive>
    <url>${url}</url>
</RemoteSiteSetting>
`;
}

const PACKAGE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Package xmlns="http://soap.sforce.com/2006/04/metadata">
    <types>
        <members>OmniStudioLegacyVisualforce</members>
        <members>OmniStudioLightning</members>
        <members>OmniStudioVisualforce</members>
        <name>RemoteSiteSetting</name>
    </types>
    <version>58.0</version>
</Package>
`;

export async function deployOmniStudioRemoteSites(namespace = OMNI_NAMESPACE): Promise<RemoteSiteUrls> {
  const { instanceUrl } = await cli.orgDisplay();
  const [org] = await query<{ InstanceName: string }>("SELECT InstanceName FROM Organization");
  if (!org?.InstanceName) throw new Error("Could not determine the org's InstanceName from the Organization object.");
  const urls = prepareRemoteSiteUrls(instanceUrl, org.InstanceName, namespace);

  const dir = await mkdtemp(join(tmpdir(), "nzc-dch-rss-"));
  try {
    await mkdir(join(dir, "remoteSiteSettings"));
    await writeFile(join(dir, "package.xml"), PACKAGE_XML, "utf8");
    await writeFile(join(dir, "remoteSiteSettings", "OmniStudioVisualforce.remoteSite"), remoteSiteXml(urls.visualforceUrl), "utf8");
    await writeFile(join(dir, "remoteSiteSettings", "OmniStudioLegacyVisualforce.remoteSite"), remoteSiteXml(urls.legacyVisualforceUrl), "utf8");
    await writeFile(join(dir, "remoteSiteSettings", "OmniStudioLightning.remoteSite"), remoteSiteXml(urls.lightningUrl), "utf8");
    await cli.deployMetadata(dir);
    return urls;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
