/**
 * Loads validation rules from knowledge/validation-rules/*.yaml.
 *
 * Multi-document YAML, one rule per `---`-separated document — see
 * knowledge/validation-rules/_schema.yaml for the authoritative shape and the
 * six check types. Files whose basename starts with `_` (the schema doc
 * itself) are skipped. A leading comment-only preamble before the first
 * `---` parses to a null document; `toJSON()` on that comes back `null`
 * (not an object), so the loader drops it instead of pushing a bogus rule.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import yaml from "yaml";

export type ValidationCheck =
  | { type: "sobject-exists"; sobject: string }
  | { type: "psl-license-assignment"; psl: string; target: string }
  | { type: "psl-assignment"; permissionSet: string; target: string }
  | { type: "metadata"; object: string; hasRecordTypes: string[] }
  | { type: "industries-setting"; flag: string }
  | { type: "soql"; query: string; expect: { operator: "=" | ">" | ">=" | "<"; value: number } };

export interface ValidationRule {
  id: string;
  group: string;
  description: string;
  severity: "error" | "warning" | "info";
  check: ValidationCheck;
  remediation?: string;
  docs?: string;
}

export async function loadRules(rulesRoot: string): Promise<ValidationRule[]> {
  const files = await readdir(rulesRoot);
  const rules: ValidationRule[] = [];
  for (const f of files) {
    if (!f.endsWith(".yaml") || f.startsWith("_")) continue;
    const text = await readFile(join(rulesRoot, f), "utf8");
    const docs = yaml.parseAllDocuments(text);
    for (const d of docs) {
      const obj = d.toJSON();
      if (obj && typeof obj === "object") rules.push(obj as ValidationRule);
    }
  }
  return rules;
}
