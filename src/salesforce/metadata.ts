/**
 * Metadata tools: deploy_metadata, retrieve_metadata.
 *
 * Both operate on raw MDAPI-format bundles (this project's metadata/settings,
 * metadata/record-types, metadata/nzc-configs directories each ship their own
 * package.xml), so they use --metadata-dir / --target-metadata-dir rather than
 * the SFDX source-format flags.
 */

import * as cli from "./cli.js";

export async function deployMetadata(
  metadataDir: string,
  opts: { dryRun?: boolean; testLevel?: string } = {}
): Promise<unknown> {
  return cli.deployMetadata(metadataDir, opts);
}

export async function retrieveMetadata(manifestPath: string, targetDir: string): Promise<unknown> {
  return cli.retrieveMetadata(manifestPath, targetDir);
}
