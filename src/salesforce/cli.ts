/**
 * Salesforce CLI wrapper — every org operation shells out to `sf` from here.
 *
 * Fixes two bugs present in the original scaffold skeleton (see JOURNEY_MAP.md /
 * the project plan):
 *   - Org targeting: holds the selected org in module-level state and injects
 *     `--target-org <alias>` on every org-scoped call, instead of mutating
 *     global config via `sf config set target-org=...` (which would leak
 *     across any other `sf` usage on the machine).
 *   - `run_apex`: writes the Apex code to a real temp `.apex` file and points
 *     `--file` at it, instead of the skeleton's `--file /dev/stdin` (which
 *     never received the code and always ran an empty script).
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

/** Module-level target-org state. Set via setTargetOrg(); read by every wrapper below. */
const state: { targetOrg: string | undefined } = { targetOrg: undefined };

export function setTargetOrg(alias: string): void {
  state.targetOrg = alias;
}

export function getTargetOrg(): string | undefined {
  return state.targetOrg;
}

export function clearTargetOrg(): void {
  state.targetOrg = undefined;
}

export class SfCliError extends Error {
  exitCode: number;
  raw?: string;
  constructor(message: string, opts: { exitCode: number; raw?: string }) {
    super(message);
    this.name = "SfCliError";
    this.exitCode = opts.exitCode;
    this.raw = opts.raw;
  }
}

/** Appends --target-org to an args array if one is currently selected. Throws if one is required but none is selected. */
function withTargetOrg(args: string[], opts: { required?: boolean } = {}): string[] {
  const required = opts.required ?? true;
  if (state.targetOrg) return [...args, "--target-org", state.targetOrg];
  if (required) {
    throw new SfCliError("No target org selected. Call set_target_org (or check_nzc_setup) first.", { exitCode: -1 });
  }
  return args;
}

interface SfExecOpts {
  maxBuffer?: number;
  timeout?: number;
}

/** Low-level `sf` invocation. Returns raw stdout. Throws SfCliError on non-zero exit. */
export async function sf(args: string[], opts: SfExecOpts = {}): Promise<string> {
  try {
    const { stdout } = await execFileAsync("sf", args, {
      maxBuffer: opts.maxBuffer ?? 50 * 1024 * 1024,
      timeout: opts.timeout,
    });
    return stdout;
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number; message: string };
    const raw = e.stderr || e.stdout || e.message;
    let message = raw;
    try {
      const parsed = JSON.parse(raw ?? "");
      if (parsed && typeof parsed === "object" && "message" in parsed) {
        message = String((parsed as { message: unknown }).message);
      }
    } catch {
      // stderr wasn't JSON — surface it verbatim.
    }
    throw new SfCliError(message, { exitCode: e.code ?? -1, raw });
  }
}

/** Runs `sf` and parses JSON stdout. Throws SfCliError if the JSON body itself reports status !== 0. */
export async function sfJson<T = unknown>(args: string[], opts: SfExecOpts = {}): Promise<T> {
  const withJson = args.includes("--json") ? args : [...args, "--json"];
  const stdout = await sf(withJson, opts);
  let parsed: { status?: number; result?: T; message?: string };
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new SfCliError(`sf CLI returned non-JSON output: ${stdout.slice(0, 500)}`, { exitCode: -1, raw: stdout });
  }
  if (parsed.status !== undefined && parsed.status !== 0) {
    throw new SfCliError(parsed.message ?? "sf CLI reported a non-zero status.", {
      exitCode: parsed.status,
      raw: stdout,
    });
  }
  return (parsed.result ?? (parsed as unknown)) as T;
}

// ───────── Org / auth ─────────

export async function version(): Promise<string> {
  return sf(["version"]);
}

export async function listOrgs(): Promise<unknown> {
  return sfJson(["org", "list", "--json"]);
}

export async function openOrg(path?: string): Promise<unknown> {
  const args = ["org", "open"];
  if (path) args.push("--path", path);
  return sfJson(withTargetOrg(args));
}

// ───────── Data ─────────

export async function runSoql(query: string, useTooling = false): Promise<unknown> {
  const args = ["data", "query", "--query", query, "--json"];
  if (useTooling) args.push("--use-tooling-api");
  return sfJson(withTargetOrg(args));
}

export async function describeSObject(name: string): Promise<unknown> {
  return sfJson(withTargetOrg(["sobject", "describe", "--sobject", name, "--json"]));
}

/**
 * `sf data get record` has no field-selection flag (confirmed against its real
 * flag manifest: api-version, record-id, sobject, target-org, use-tooling-api,
 * where — no --fields). An earlier version of this function passed a guessed
 * `--fields` flag, which fails with "Nonexistent flag: --fields". Fetch the
 * full record and filter to the requested keys client-side instead.
 */
export async function getRecord(object: string, id: string, fields?: string[]): Promise<unknown> {
  const args = ["data", "get", "record", "--sobject", object, "--record-id", id, "--json"];
  const record = await sfJson<Record<string, unknown>>(withTargetOrg(args));
  if (!fields?.length) return record;
  const picked: Record<string, unknown> = {};
  for (const f of fields) if (f in record) picked[f] = record[f];
  return picked;
}

/**
 * Formats a field map into sf CLI's `--values "F1=V1 F2=V2"` syntax. Values
 * containing whitespace are single-quoted per sf's own parser (execFile
 * passes argv elements directly to the binary with no shell involved, so
 * this quoting is for sf's internal parser, not the OS shell).
 *
 * Throws rather than silently mangling a value that itself contains a single
 * quote — that combination isn't reliably escapable through --values. Use
 * run_apex for that record instead.
 */
function formatValues(fields: Record<string, unknown>): string {
  return Object.entries(fields)
    .map(([key, rawValue]) => {
      const value = rawValue === null || rawValue === undefined ? "" : String(rawValue);
      if (value.includes("'")) {
        throw new Error(
          `Field "${key}" contains a single quote, which is not reliably escapable through sf's --values syntax. ` +
            `Use run_apex for this record instead.`
        );
      }
      const quoted = /\s/.test(value) ? `'${value}'` : value;
      return `${key}=${quoted}`;
    })
    .join(" ");
}

export async function createRecord(object: string, fields: Record<string, unknown>): Promise<unknown> {
  const args = ["data", "create", "record", "--sobject", object, "--values", formatValues(fields), "--json"];
  return sfJson(withTargetOrg(args));
}

export async function updateRecord(object: string, id: string, fields: Record<string, unknown>): Promise<unknown> {
  const args = [
    "data",
    "update",
    "record",
    "--sobject",
    object,
    "--record-id",
    id,
    "--values",
    formatValues(fields),
    "--json",
  ];
  return sfJson(withTargetOrg(args));
}

export async function deleteRecord(object: string, id: string): Promise<unknown> {
  return sfJson(withTargetOrg(["data", "delete", "record", "--sobject", object, "--record-id", id, "--json"]));
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) throw new Error("Cannot write a CSV with zero rows.");
  const headerSet = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row)) headerSet.add(key);
  const headers = Array.from(headerSet);
  const escape = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    const s = String(value);
    return /["\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const row of rows) lines.push(headers.map((h) => escape(row[h])).join(","));
  return lines.join("\n");
}

export interface BulkLoadResult {
  jobId: string;
  state: string;
  raw: unknown;
}

/**
 * Bulk-loads records via Bulk API 2.0. Writes rows to a temp CSV, then runs
 * `sf data import bulk` (pure insert — what the committed seed/generator data
 * needs, since it intentionally carries no custom external-id field) or, when
 * `externalId` is given, `sf data upsert bulk --external-id <field>` for
 * idempotent re-runs against data that does have one.
 */
export async function bulkUpsertRecords(
  object: string,
  records: Record<string, unknown>[],
  opts: { externalId?: string; wait?: number } = {}
): Promise<BulkLoadResult> {
  const dir = await mkdtemp(join(tmpdir(), "nzc-bulk-"));
  const file = join(dir, `${object}.csv`);
  try {
    await writeFile(file, toCsv(records), "utf8");
    const wait = String(opts.wait ?? 10);
    const args = opts.externalId
      ? ["data", "upsert", "bulk", "--sobject", object, "--file", file, "--external-id", opts.externalId, "--wait", wait, "--json"]
      : ["data", "import", "bulk", "--sobject", object, "--file", file, "--wait", wait, "--json"];
    const result = await sfJson<{ jobInfo?: { id: string; state: string } }>(withTargetOrg(args));
    const jobInfo = result.jobInfo;
    return { jobId: jobInfo?.id ?? "unknown", state: jobInfo?.state ?? "Unknown", raw: result };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function importTree(planPath: string): Promise<unknown> {
  return sfJson(withTargetOrg(["data", "import", "tree", "--plan", planPath, "--json"]));
}

export async function exportTree(query: string, outputDir: string, prefix?: string): Promise<unknown> {
  const args = ["data", "export", "tree", "--query", query, "--output-dir", outputDir, "--json"];
  if (prefix) args.push("--prefix", prefix);
  return sfJson(withTargetOrg(args));
}

// ───────── Metadata ─────────

export async function deployMetadata(
  metadataDir: string,
  opts: { dryRun?: boolean; testLevel?: string } = {}
): Promise<unknown> {
  const args = ["project", "deploy", "start", "--metadata-dir", metadataDir, "--json"];
  if (opts.dryRun) args.push("--dry-run");
  if (opts.testLevel) args.push("--test-level", opts.testLevel);
  return sfJson(withTargetOrg(args));
}

export async function retrieveMetadata(manifestPath: string, targetDir: string): Promise<unknown> {
  const args = ["project", "retrieve", "start", "--manifest", manifestPath, "--target-metadata-dir", targetDir, "--json"];
  return sfJson(withTargetOrg(args));
}

/**
 * Retrieves metadata via the given manifest and unzips the result, returning
 * the extracted `unpackaged/` directory. `--target-metadata-dir` (used by
 * retrieveMetadata above) leaves a zip file rather than extracting it —
 * confirmed by inspecting a real retrieve's `result.zipFilePath`, which
 * pointed at an `unpackaged.zip` with no sibling extracted files. Callers
 * that need to actually read the retrieved files back (e.g. to verify a
 * deploy landed) use this instead. Shells out to the system `unzip` binary,
 * matching this file's existing pattern of shelling out to `sf` rather than
 * adding a zip-handling dependency for one narrow use.
 */
export async function retrieveMetadataExtracted(manifestPath: string, targetDir: string): Promise<string> {
  const result = (await retrieveMetadata(manifestPath, targetDir)) as { zipFilePath?: string };
  if (!result.zipFilePath) {
    throw new SfCliError("Retrieve succeeded but reported no zipFilePath to extract.", { exitCode: -1 });
  }
  await execFileAsync("unzip", ["-o", "-q", result.zipFilePath, "-d", targetDir]);
  return join(targetDir, "unpackaged");
}

// ───────── Apex ─────────

/**
 * Executes anonymous Apex. Writes `code` to a real temp .apex file — the
 * scaffold skeleton pointed --file at /dev/stdin without ever piping
 * anything into it, so it silently ran an empty script — and removes the
 * temp file afterward regardless of success or failure.
 */
export async function runApex(code: string): Promise<unknown> {
  const dir = await mkdtemp(join(tmpdir(), "nzc-apex-"));
  const file = join(dir, "exec.apex");
  try {
    await writeFile(file, code, "utf8");
    return await sfJson(withTargetOrg(["apex", "run", "--file", file, "--json"]));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ───────── Permissions ─────────

export async function assignPermset(name: string): Promise<unknown> {
  return sfJson(withTargetOrg(["org", "assign", "permset", "--name", name, "--json"]));
}

/** Direct CLI path for PSL assignment. perms.ts owns the anonymous-Apex fallback on top of this. */
export async function assignPermsetLicenseCli(name: string): Promise<unknown> {
  return sfJson(withTargetOrg(["org", "assign", "permsetlicense", "--name", name, "--json"]));
}
