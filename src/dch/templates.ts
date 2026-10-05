/**
 * Report templates: uploads each framework's Word template as a ContentDocument
 * and links it to the framework's active OmniProcess. Replaces the DCH
 * project's Snowfakery recipes (ContentVersion + ContentDocumentLink).
 * Idempotent: an already-uploaded title and an existing link are reused.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import * as cli from "../salesforce/cli.js";
import * as dataTools from "../salesforce/data.js";
import { pluginPath } from "../paths.js";
import { query, soqlString, type StepResult } from "./common.js";

export type DchFramework = "gri" | "esrs" | "cdp" | "sasb";

export interface TemplateEntry {
  framework: DchFramework;
  title: string;
  file: string;
  omniProcessName: string;
}

const TEMPLATE_DIR = pluginPath("data", "dch", "templates");

export async function loadManifest(): Promise<TemplateEntry[]> {
  return JSON.parse(await readFile(join(TEMPLATE_DIR, "templates.json"), "utf8")) as TemplateEntry[];
}

async function findDocumentId(title: string): Promise<string | undefined> {
  const [doc] = await query<{ Id: string }>(`SELECT Id FROM ContentDocument WHERE Title = '${soqlString(title)}' LIMIT 1`);
  return doc?.Id;
}

async function loadTemplate(entry: TemplateEntry): Promise<StepResult> {
  const step = `template:${entry.title}`;
  try {
    const [process] = await query<{ Id: string }>(
      `SELECT Id FROM OmniProcess WHERE Name = '${soqlString(entry.omniProcessName)}' AND IsActive = true LIMIT 1`
    );
    if (!process) {
      return {
        step,
        status: "failed",
        detail: `No active OmniProcess named "${entry.omniProcessName}" — deploy and activate the ${entry.framework} resources first.`,
      };
    }

    let documentId = await findDocumentId(entry.title);
    let uploaded = false;
    if (!documentId) {
      await cli.uploadFile(join(TEMPLATE_DIR, entry.file), entry.title);
      documentId = await findDocumentId(entry.title);
      uploaded = true;
      if (!documentId) throw new Error(`Uploaded "${entry.file}" but could not find a ContentDocument titled "${entry.title}".`);
    }

    const [link] = await query<{ Id: string }>(
      `SELECT Id FROM ContentDocumentLink WHERE LinkedEntityId = '${process.Id}' AND ContentDocumentId = '${documentId}' LIMIT 1`
    );
    if (link) return { step, status: "skipped", detail: "already uploaded and linked" };

    await dataTools.createRecord("ContentDocumentLink", {
      LinkedEntityId: process.Id,
      ContentDocumentId: documentId,
      ShareType: "V",
    });
    return { step, status: "ok", detail: { documentId, omniProcessId: process.Id, uploaded } };
  } catch (err) {
    return { step, status: "failed", detail: err instanceof Error ? err.message : String(err) };
  }
}

/** Loads the templates for one framework, or all of them when none is given. Every template is attempted; failures don't stop the rest. */
export async function loadDchTemplates(framework?: DchFramework): Promise<StepResult[]> {
  const entries = (await loadManifest()).filter((e) => !framework || e.framework === framework);
  if (entries.length === 0) throw new Error(`No templates in the manifest for framework "${framework}".`);
  const results: StepResult[] = [];
  for (const entry of entries) results.push(await loadTemplate(entry));
  return results;
}
