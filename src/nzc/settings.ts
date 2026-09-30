/**
 * enable_net_zero_settings: deploys metadata/settings/Industries.settings —
 * the NZC-relevant flag subset, see that file's header comment for why it's
 * scoped down from a full org settings dump — after confirming the license
 * is provisioned.
 *
 * Not every enableSC* flag is guaranteed deployable/sticky in every org (see
 * JOURNEY_MAP.md / the project plan's risk #2: some enablement is UI-only or
 * one-way). So this doesn't just trust a successful deploy response — it
 * retrieves the same Settings:Industries metadata back afterward and diffs
 * the actual flags against the intended ones, surfacing any that didn't
 * land so the caller can report them + the Setup path instead of silently
 * assuming success.
 */

import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as dataTools from "../salesforce/data.js";
import * as metadataTools from "../salesforce/metadata.js";
import { pluginPath } from "../paths.js";

const SETTINGS_DIR = pluginPath("metadata", "settings");
const SETTINGS_FILE = join(SETTINGS_DIR, "Industries.settings");
const SETTINGS_MANIFEST = join(SETTINGS_DIR, "package.xml");

/**
 * Extracts `<tagName>true</tagName>` / `<tagName>false</tagName>` flags from
 * a flat Settings XML file. Not a general XML parser — Industries.settings
 * has no nested elements or attributes for these boolean flags, so a regex
 * scan is sufficient and avoids adding an XML dependency for this one narrow,
 * internal verification use.
 */
function extractFlags(xml: string): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  const re = /<(\w+)>(true|false)<\/\1>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    flags[m[1]] = m[2] === "true";
  }
  return flags;
}

export interface EnableSettingsResult {
  deployResult: unknown;
  intendedFlags: Record<string, boolean>;
  actualFlags: Record<string, boolean>;
  /** Flags this deploy intended to set that don't match the post-deploy retrieve — likely UI-only or one-way in this org. */
  notLanded: string[];
}

export async function enableNetZeroSettings(): Promise<EnableSettingsResult> {
  // Pre-check: NZC must be licensed/provisioned before settings can even matter.
  try {
    await dataTools.describeSObject("StnryAssetEnvrSrc");
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Net Zero Cloud does not appear to be licensed/provisioned on this org — ` +
        `describe_sobject("StnryAssetEnvrSrc") failed: ${detail}. ` +
        `Enable Net Zero Cloud licensing in Setup before running this tool.`
    );
  }

  const intendedXml = await readFile(SETTINGS_FILE, "utf8");
  const intendedFlags = extractFlags(intendedXml);

  const deployResult = await metadataTools.deployMetadata(SETTINGS_DIR);

  const verifyDir = await mkdtemp(join(tmpdir(), "nzc-settings-verify-"));
  let actualFlags: Record<string, boolean> = {};
  try {
    const extracted = await metadataTools.retrieveMetadataExtracted(SETTINGS_MANIFEST, verifyDir);
    const actualXml = await readFile(join(extracted, "settings", "Industries.settings"), "utf8");
    actualFlags = extractFlags(actualXml);
  } finally {
    await rm(verifyDir, { recursive: true, force: true });
  }

  const notLanded = Object.keys(intendedFlags).filter((flag) => actualFlags[flag] !== intendedFlags[flag]);

  return { deployResult, intendedFlags, actualFlags, notLanded };
}
