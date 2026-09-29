/**
 * Resolves paths relative to the plugin's root directory (the directory
 * containing package.json, src/, dist/, knowledge/, data/, metadata/),
 * regardless of the process's current working directory at runtime — this
 * server is launched via `node ${CLAUDE_PLUGIN_ROOT}/dist/index.js`, and
 * nothing guarantees cwd equals that directory.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// This file compiles to dist/paths.js, one level under the plugin root.
const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

export function pluginPath(...segments: string[]): string {
  return join(PLUGIN_ROOT, ...segments);
}
