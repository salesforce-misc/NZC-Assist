/**
 * Validation rule execution engine.
 *
 * AutomotiveAssist's own rules-executor.ts (the template for this project)
 * is an unimplemented skeleton — every check type returns "skip, not
 * implemented yet", and its dispatcher has no case at all for the three
 * validation tools. There was nothing to port for the executor logic itself;
 * this is a from-scratch design against knowledge/validation-rules/_schema.yaml's
 * six check types, reusing this project's own existing salesforce/* tool
 * wrappers wherever one already does the right query.
 *
 * Status semantics: a check's own pass/fail is distinct from the rule's
 * reported status. "fail" vs "warn" is the check failing, mapped through the
 * rule's `severity` (error → fail, warning/info → warn). "skip" means the
 * check itself could not be evaluated (e.g. a SOQL error, an unsupported
 * `target` value) — that is not the same claim as "the org is misconfigured",
 * so it is never silently folded into fail/warn.
 */

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as dataTools from "../salesforce/data.js";
import * as metadataTools from "../salesforce/metadata.js";
import * as permsTools from "../salesforce/perms.js";
import { pluginPath } from "../paths.js";
import { loadRules, type ValidationCheck, type ValidationRule } from "./rules-loader.js";

export interface RuleResult {
  rule: ValidationRule;
  status: "pass" | "fail" | "warn" | "skip";
  message?: string;
}

const RULES_ROOT = pluginPath("knowledge", "validation-rules");

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function soqlEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

type CheckOutcome = { outcome: "pass" | "fail" | "skip"; detail: string };

export async function executeRules(rules: ValidationRule[], group?: string): Promise<RuleResult[]> {
  const filtered = group && group !== "all" ? rules.filter((r) => r.group === group) : rules;

  // Scoped to this one executeRules() call, not module-level — a long-lived
  // MCP server process must re-retrieve Industries.settings on every fresh
  // audit, not reuse a settings snapshot from a prior tool invocation. The
  // promise (not just the resolved value) is cached so concurrent
  // industries-setting checks within this call share one retrieve instead
  // of each triggering their own.
  let industriesSettingsPromise: Promise<string | null> | undefined;
  function getIndustriesSettingsXml(): Promise<string | null> {
    if (!industriesSettingsPromise) {
      industriesSettingsPromise = retrieveIndustriesSettingsXml().catch(() => null);
    }
    return industriesSettingsPromise;
  }

  return Promise.all(filtered.map((rule) => runRule(rule, getIndustriesSettingsXml)));
}

async function runRule(rule: ValidationRule, getIndustriesSettingsXml: () => Promise<string | null>): Promise<RuleResult> {
  let outcome: CheckOutcome;
  try {
    outcome = await evaluateCheck(rule.check, getIndustriesSettingsXml);
  } catch (err) {
    outcome = { outcome: "skip", detail: `Could not evaluate check: ${errMessage(err)}` };
  }
  if (outcome.outcome === "pass") return { rule, status: "pass", message: outcome.detail };
  if (outcome.outcome === "skip") return { rule, status: "skip", message: outcome.detail };
  return { rule, status: rule.severity === "error" ? "fail" : "warn", message: outcome.detail };
}

async function evaluateCheck(
  check: ValidationCheck,
  getIndustriesSettingsXml: () => Promise<string | null>
): Promise<CheckOutcome> {
  switch (check.type) {
    case "sobject-exists":
      return checkSobjectExists(check.sobject);
    case "psl-license-assignment":
      return checkPslLicenseAssignment(check.psl, check.target);
    case "psl-assignment":
      return checkPslAssignment(check.permissionSet, check.target);
    case "metadata":
      return checkRecordTypes(check.object, check.hasRecordTypes);
    case "industries-setting":
      return checkIndustriesSetting(check.flag, await getIndustriesSettingsXml());
    case "soql":
      return checkSoql(check.query, check.expect);
  }
}

async function checkSobjectExists(sobject: string): Promise<CheckOutcome> {
  try {
    await dataTools.describeSObject(sobject);
    return { outcome: "pass", detail: `${sobject} is describable.` };
  } catch (err) {
    return { outcome: "fail", detail: `${sobject} is not describable: ${errMessage(err)}` };
  }
}

/**
 * "all-active-users" is read as "at least one active user has this
 * license/permission set assigned", not literal 100% org-wide coverage —
 * requiring every active user to hold a PSL like DPE is rarely the real
 * intent. `target` values other than "all-active-users" are a documented
 * future extension in _schema.yaml with no defined shape yet, so they skip
 * rather than guess.
 */
async function checkPslLicenseAssignment(psl: string, target: string): Promise<CheckOutcome> {
  if (target !== "all-active-users") {
    return { outcome: "skip", detail: `Unsupported target "${target}" for psl-license-assignment.` };
  }
  const { permissionSetLicenses } = await permsTools.listPermissionSets();
  const row = permissionSetLicenses.find((p) => p.DeveloperName === psl);
  if (!row) return { outcome: "fail", detail: `PermissionSetLicense "${psl}" not found in this org.` };
  const used = row.UsedLicenses ?? 0;
  return {
    outcome: used > 0 ? "pass" : "fail",
    detail: `${psl}: ${used} of ${row.TotalLicenses ?? "?"} licenses assigned.`,
  };
}

async function checkPslAssignment(permissionSet: string, target: string): Promise<CheckOutcome> {
  if (target !== "all-active-users") {
    return { outcome: "skip", detail: `Unsupported target "${target}" for psl-assignment.` };
  }
  const query =
    `SELECT COUNT() FROM PermissionSetAssignment ` +
    `WHERE PermissionSet.Name = '${soqlEscape(permissionSet)}' AND Assignee.IsActive = true`;
  const result = (await dataTools.runSoql(query)) as { totalSize: number };
  return {
    outcome: result.totalSize > 0 ? "pass" : "fail",
    detail: `${permissionSet}: assigned to ${result.totalSize} active user(s).`,
  };
}

async function checkRecordTypes(object: string, hasRecordTypes: string[]): Promise<CheckOutcome> {
  const query = `SELECT DeveloperName FROM RecordType WHERE SObjectType = '${soqlEscape(object)}'`;
  const result = (await dataTools.runSoql(query)) as { records: Array<{ DeveloperName: string }> };
  const present = new Set(result.records.map((r) => r.DeveloperName));
  const missing = hasRecordTypes.filter((rt) => !present.has(rt));
  if (missing.length === 0) {
    return { outcome: "pass", detail: `${object} has all required record types: ${hasRecordTypes.join(", ")}.` };
  }
  return { outcome: "fail", detail: `${object} is missing record type(s): ${missing.join(", ")}.` };
}

/**
 * Industries.settings is deploy-only metadata, not a queryable SObject —
 * there is no SOQL equivalent of reading a Custom Setting here. The only way
 * to read its current value is a real metadata retrieve, so this shells out
 * through the same retrieveMetadataExtracted() already used by deploy
 * verification, into a throwaway temp dir, then regexes the one flag out of
 * the retrieved XML. A regex (not a real XML parser) is deliberate: this
 * project has no XML-parsing dependency, Industries.settings is a flat,
 * single-level `<flagName>true</flagName>` structure with no nesting
 * (confirmed against a live retrieve), and adding a parser dependency for
 * one narrow read isn't worth it.
 */
async function retrieveIndustriesSettingsXml(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "nzc-audit-"));
  try {
    const manifestPath = join(dir, "package.xml");
    await writeFile(
      manifestPath,
      [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<Package xmlns="http://soap.sforce.com/2006/04/metadata">',
        "    <types>",
        "        <members>Industries</members>",
        "        <name>Settings</name>",
        "    </types>",
        "    <version>62.0</version>",
        "</Package>",
        "",
      ].join("\n"),
      "utf8"
    );
    const extractedDir = await metadataTools.retrieveMetadataExtracted(manifestPath, dir);
    return await readFile(join(extractedDir, "settings", "Industries.settings"), "utf8");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function checkIndustriesSetting(flag: string, xml: string | null): Promise<CheckOutcome> {
  if (xml === null) {
    return { outcome: "skip", detail: `Could not retrieve Industries.settings from the org to check "${flag}".` };
  }
  const match = xml.match(new RegExp(`<${flag}>(true|false)</${flag}>`));
  if (!match) {
    return {
      outcome: "skip",
      detail: `"${flag}" was not found in the retrieved Industries.settings — it may not exist in this org/API version, or the rule's flag name may be stale.`,
    };
  }
  return { outcome: match[1] === "true" ? "pass" : "fail", detail: `${flag} = ${match[1]}.` };
}

async function checkSoql(
  query: string,
  expect: { operator: "=" | ">" | ">=" | "<"; value: number }
): Promise<CheckOutcome> {
  const result = (await dataTools.runSoql(query)) as { totalSize: number };
  const actual = result.totalSize;
  const passed = compareNumbers(actual, expect.operator, expect.value);
  return { outcome: passed ? "pass" : "fail", detail: `Query returned ${actual}; expected ${expect.operator} ${expect.value}.` };
}

function compareNumbers(actual: number, operator: "=" | ">" | ">=" | "<", expected: number): boolean {
  switch (operator) {
    case "=":
      return actual === expected;
    case ">":
      return actual > expected;
    case ">=":
      return actual >= expected;
    case "<":
      return actual < expected;
  }
}

export interface AuditResult {
  group: string;
  summary: { pass: number; fail: number; warn: number; skip: number };
  results: RuleResult[];
}

export async function auditNzcConfig(group?: string): Promise<AuditResult> {
  const rules = await loadRules(RULES_ROOT);
  const results = await executeRules(rules, group);
  const summary = { pass: 0, fail: 0, warn: 0, skip: 0 };
  for (const r of results) summary[r.status]++;
  return { group: group && group !== "all" ? group : "all", summary, results };
}

export async function listValidationGroups(): Promise<{ group: string; ruleCount: number }[]> {
  const rules = await loadRules(RULES_ROOT);
  const counts = new Map<string, number>();
  for (const r of rules) counts.set(r.group, (counts.get(r.group) ?? 0) + 1);
  return [...counts.entries()].map(([group, ruleCount]) => ({ group, ruleCount }));
}

export interface DiagnoseResult {
  query: string;
  matchedRules: number;
  results: RuleResult[];
}

/** Matches `query` against rule id/description/remediation/docs, then runs just the matched rules live. */
export async function diagnoseNzcIssue(query: string): Promise<DiagnoseResult> {
  const rules = await loadRules(RULES_ROOT);
  const needle = query.toLowerCase();
  const matched = rules.filter((r) =>
    [r.id, r.description, r.remediation, r.docs].some((field) => field?.toLowerCase().includes(needle))
  );
  const results = await executeRules(matched);
  return { query, matchedRules: matched.length, results };
}
