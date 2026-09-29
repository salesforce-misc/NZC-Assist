/**
 * Data tools: run_soql, describe_sobject, get/create/update/delete_record,
 * bulk_upsert_records, import_tree, export_tree.
 *
 * Thin pass-throughs over cli.ts — formatting/interpretation of results for
 * the user happens in the invoking skill/command, not here.
 */

import * as cli from "./cli.js";

export async function runSoql(query: string, useTooling = false): Promise<unknown> {
  return cli.runSoql(query, useTooling);
}

export async function describeSObject(object: string): Promise<unknown> {
  return cli.describeSObject(object);
}

export async function getRecord(object: string, id: string, fields?: string[]): Promise<unknown> {
  return cli.getRecord(object, id, fields);
}

export async function createRecord(object: string, fields: Record<string, unknown>): Promise<unknown> {
  return cli.createRecord(object, fields);
}

export async function updateRecord(object: string, id: string, fields: Record<string, unknown>): Promise<unknown> {
  return cli.updateRecord(object, id, fields);
}

export async function deleteRecord(object: string, id: string): Promise<unknown> {
  return cli.deleteRecord(object, id);
}

export async function bulkUpsertRecords(
  object: string,
  records: Record<string, unknown>[],
  opts: { externalId?: string; wait?: number } = {}
): Promise<cli.BulkLoadResult> {
  return cli.bulkUpsertRecords(object, records, opts);
}

export async function importTree(planPath: string): Promise<unknown> {
  return cli.importTree(planPath);
}

export async function exportTree(query: string, outputDir: string, prefix?: string): Promise<unknown> {
  return cli.exportTree(query, outputDir, prefix);
}
