#!/usr/bin/env node
/**
 * MCP server for Salesforce Net Zero Cloud (`nzc`).
 *
 * Tool catalog (see JOURNEY_MAP.md / CLAUDE.md / the project plan §8):
 *   - Org tools:        check_nzc_setup, list_sf_orgs, set_target_org, open_org
 *   - Data tools:       run_soql, describe_sobject, get_record, create_record,
 *                       update_record, delete_record, bulk_upsert_records,
 *                       import_tree, export_tree
 *   - Metadata tools:   deploy_metadata, retrieve_metadata
 *   - Apex tools:       run_apex
 *   - Permission tools: assign_permset, assign_permset_license, list_permission_sets
 *   - NZC helpers:      enable_net_zero_settings, load_reference_data,
 *                       scaffold_sample_data, calculate_footprints
 *   - Validation tools: audit_nzc_config, list_validation_groups, diagnose_nzc_issue
 *   - Knowledge/status: list_nzc_modules, get_nzc_module_docs, search_nzc_knowledge,
 *                       explain_nzc_concept, get_nzc_troubleshooting, get_org_status,
 *                       health_check
 *
 * Org/data/metadata/permission/knowledge/status tools are wired to real
 * handlers. The four NZC helper tools and the three validation tools are
 * registered (stable names + schemas, so skills/commands can already refer
 * to them) but dispatch to a clear "not yet implemented" stub — their real
 * implementations depend on data/metadata content authored in later
 * milestones (see JOURNEY_MAP.md and the project plan §13, M5/M6).
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";

import * as cli from "./salesforce/cli.js";
import * as authTools from "./salesforce/auth.js";
import * as dataTools from "./salesforce/data.js";
import * as metadataTools from "./salesforce/metadata.js";
import * as permsTools from "./salesforce/perms.js";
import * as statusTools from "./salesforce/status.js";
import * as knowledge from "./knowledge-loader.js";

const SERVER_NAME = "nzc";
const SERVER_VERSION = "0.1.0";

type Args = Record<string, unknown>;

const tools: Tool[] = [
  // ───────── Org tools ─────────
  {
    name: "check_nzc_setup",
    description: "Check Net Zero Cloud plugin setup — SF CLI installed, authenticated orgs, current target org.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_sf_orgs",
    description: "List all authenticated Salesforce orgs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "set_target_org",
    description: "Set which org to use for subsequent operations.",
    inputSchema: { type: "object", properties: { alias: { type: "string" } }, required: ["alias"] },
  },
  {
    name: "open_org",
    description: "Open the connected org in the browser, optionally to a specific path.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Optional path, e.g. '/lightning/setup/SetupOneHome/home'" } },
    },
  },
  // ───────── Data tools ─────────
  {
    name: "run_soql",
    description:
      "Execute a SOQL query against the connected Net Zero Cloud org. NEVER use for record types, *Config custom metadata, or Industries/Sustainability settings — those are metadata, not queryable data.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, useTooling: { type: "boolean", default: false } },
      required: ["query"],
    },
  },
  {
    name: "describe_sobject",
    description: "Get metadata (fields, types, record types, child relationships) for any Salesforce object. Also the standard license probe (describe StnryAssetEnvrSrc).",
    inputSchema: { type: "object", properties: { object: { type: "string" } }, required: ["object"] },
  },
  {
    name: "get_record",
    description: "Retrieve a specific record by Id.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string" },
        id: { type: "string" },
        fields: { type: "array", items: { type: "string" } },
      },
      required: ["object", "id"],
    },
  },
  {
    name: "create_record",
    description: "Create a new record.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string" },
        fields: { type: "object" },
        confirmProductionWrite: {
          type: "boolean",
          description: "Required (true) to write against a production-type org. Confirm with the user by org alias first.",
        },
      },
      required: ["object", "fields"],
    },
  },
  {
    name: "update_record",
    description: "Update an existing record.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string" },
        id: { type: "string" },
        fields: { type: "object" },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
      required: ["object", "id", "fields"],
    },
  },
  {
    name: "delete_record",
    description: "Delete a record.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string" },
        id: { type: "string" },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
      required: ["object", "id"],
    },
  },
  {
    name: "bulk_upsert_records",
    description:
      "Bulk-load records via Bulk API 2.0 (sf data import/upsert bulk). Omit externalId for a pure insert (seed/generated data with no custom external-id field); pass externalId for idempotent upserts.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string" },
        records: { type: "array", items: { type: "object" } },
        externalId: { type: "string" },
        wait: { type: "number", description: "Minutes to wait for the bulk job to finish. Default 10." },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
      required: ["object", "records"],
    },
  },
  {
    name: "import_tree",
    description: "Import related records from an sf data tree JSON plan (used for committed reference/seed data).",
    inputSchema: {
      type: "object",
      properties: {
        planPath: { type: "string" },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
      required: ["planPath"],
    },
  },
  {
    name: "export_tree",
    description: "Export records matching a SOQL query as an sf data tree JSON plan (used to build/refresh seed data from a reference org).",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, outputDir: { type: "string" }, prefix: { type: "string" } },
      required: ["query", "outputDir"],
    },
  },
  // ───────── Metadata tools ─────────
  {
    name: "deploy_metadata",
    description: "Deploy MDAPI-format metadata (a directory with its own package.xml) to the target org.",
    inputSchema: {
      type: "object",
      properties: {
        metadataDir: { type: "string" },
        dryRun: { type: "boolean", default: false },
        testLevel: { type: "string" },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to deploy against a production-type org." },
      },
      required: ["metadataDir"],
    },
  },
  {
    name: "retrieve_metadata",
    description: "Retrieve MDAPI-format metadata from the target org into a local directory, given a package.xml manifest.",
    inputSchema: {
      type: "object",
      properties: { manifestPath: { type: "string" }, targetDir: { type: "string" } },
      required: ["manifestPath", "targetDir"],
    },
  },
  // ───────── Apex tools ─────────
  {
    name: "run_apex",
    description: "Execute anonymous Apex code against the target org.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string" },
        confirmProductionWrite: {
          type: "boolean",
          description: "Required (true) to run against a production-type org — Apex can perform DML even when it looks read-only.",
        },
      },
      required: ["code"],
    },
  },
  // ───────── Permission tools ─────────
  {
    name: "assign_permset",
    description: "Assign a permission set to the current user by DeveloperName.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
      required: ["name"],
    },
  },
  {
    name: "assign_permset_license",
    description:
      "Assign a permission set license by DeveloperName. Prefers `sf org assign permsetlicense`; falls back to an anonymous-Apex insert of PermissionSetLicenseAssign if that fails, and reports which path ran.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        targetUsername: { type: "string", description: "Username to assign to, for the Apex-fallback path. Defaults to the running user." },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
      required: ["name"],
    },
  },
  {
    name: "list_permission_sets",
    description: "List Net Zero Cloud permission set licenses and permission sets with assignment/capacity counts.",
    inputSchema: { type: "object", properties: {} },
  },
  // ───────── NZC helper tools (stubbed — see JOURNEY_MAP.md / plan §13 M5) ─────────
  {
    name: "enable_net_zero_settings",
    description: "Deploy Industries/Sustainability settings (enableSC* flags) after confirming the license is provisioned.",
    inputSchema: {
      type: "object",
      properties: { confirmProductionWrite: { type: "boolean", description: "Required (true) to deploy against a production-type org." } },
    },
  },
  {
    name: "load_reference_data",
    description: "Load committed reference/emission-factor seed data in dependency order.",
    inputSchema: {
      type: "object",
      properties: { confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." } },
    },
  },
  {
    name: "scaffold_sample_data",
    description: "Generate and load hybrid sample data (seed + runtime-generated transactional records) across configured domains.",
    inputSchema: {
      type: "object",
      properties: {
        profile: { type: "string", enum: ["small", "full"], default: "small" },
        teardownId: { type: "string", description: "Optional fixture manifest id to tear down instead of loading." },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
    },
  },
  {
    name: "calculate_footprints",
    description: "Calculate or load carbon footprints linked to an Annual Emissions Inventory, auto-detecting the DPE vs. coherent-data-load path.",
    inputSchema: {
      type: "object",
      properties: {
        year: { type: "string" },
        confirmProductionWrite: { type: "boolean", description: "Required (true) to write against a production-type org." },
      },
    },
  },
  // ───────── Validation tools (stubbed — see plan §13 M6) ─────────
  {
    name: "audit_nzc_config",
    description: "Run validation rules against the connected org. Groups: foundation | reference-data | data-integrity | all.",
    inputSchema: { type: "object", properties: { group: { type: "string" } } },
  },
  {
    name: "list_validation_groups",
    description: "List available validation rule groups.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "diagnose_nzc_issue",
    description: "Find validation rules / known issues matching a specific error message or symptom.",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
  },
  // ───────── Knowledge / status tools ─────────
  {
    name: "list_nzc_modules",
    description: "List all Net Zero Cloud modules that have curated documentation in the knowledge base.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_nzc_module_docs",
    description: "Get curated documentation for a specific Net Zero Cloud module.",
    inputSchema: { type: "object", properties: { module: { type: "string" } }, required: ["module"] },
  },
  {
    name: "search_nzc_knowledge",
    description: "Search across all curated Net Zero Cloud documentation for a topic or term.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number", default: 10 } },
      required: ["query"],
    },
  },
  {
    name: "explain_nzc_concept",
    description: "Get an explanation of a specific Net Zero Cloud concept (e.g., 'Annual Emissions Inventory', 'Scope 3 procurement').",
    inputSchema: { type: "object", properties: { concept: { type: "string" } }, required: ["concept"] },
  },
  {
    name: "get_nzc_troubleshooting",
    description: "Get troubleshooting guidance for a specific symptom from knowledge/troubleshooting/common-issues.md.",
    inputSchema: { type: "object", properties: { issue: { type: "string" } }, required: ["issue"] },
  },
  {
    name: "get_org_status",
    description: "Get a single dashboard view of the connected Net Zero Cloud org (license, settings, PSLs, record types, pipeline counts).",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "health_check",
    description: "Run a combined setup + org status health check.",
    inputSchema: { type: "object", properties: {} },
  },
];

/** Mutating tools must be explicitly confirmed before running against a production-type org. */
const MUTATING_TOOLS = new Set([
  "create_record",
  "update_record",
  "delete_record",
  "bulk_upsert_records",
  "import_tree",
  "deploy_metadata",
  "run_apex",
  "assign_permset",
  "assign_permset_license",
  "enable_net_zero_settings",
  "load_reference_data",
  "scaffold_sample_data",
  "calculate_footprints",
]);

const PENDING_MILESTONE: Record<string, string> = {
  enable_net_zero_settings: "M5",
  load_reference_data: "M5",
  scaffold_sample_data: "M5",
  calculate_footprints: "M5",
  audit_nzc_config: "M6",
  list_validation_groups: "M6",
  diagnose_nzc_issue: "M6",
};

function ok(value: unknown): CallToolResult {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return { content: [{ type: "text", text }] };
}

function errorResult(err: unknown): CallToolResult {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text", text: message }], isError: true };
}

function notImplemented(toolName: string): CallToolResult {
  const milestone = PENDING_MILESTONE[toolName] ?? "a later milestone";
  return {
    content: [
      {
        type: "text",
        text:
          `Tool "${toolName}" is registered (stable name + schema) but not yet implemented — planned for ${milestone}. ` +
          `See JOURNEY_MAP.md and the project plan for its intended behavior.`,
      },
    ],
  };
}

/** Refuses a mutating call against a production-type org unless the caller explicitly set confirmProductionWrite: true. */
async function guardProductionWrite(toolName: string, args: Args): Promise<string | null> {
  if (!MUTATING_TOOLS.has(toolName)) return null;
  const targetOrg = cli.getTargetOrg();
  if (!targetOrg) return null; // no org selected — the handler itself will fail with a clear error.
  const isProd = await authTools.isProductionOrg(targetOrg).catch(() => true); // fail closed on lookup failure
  if (!isProd) return null;
  if (args.confirmProductionWrite === true) return null;
  return (
    `Refusing to run "${toolName}" — target org "${targetOrg}" is production-type (not a scratch org or sandbox). ` +
    `Re-invoke with confirmProductionWrite: true to proceed. Confirm this with the user by org alias first — ` +
    `never set this flag on the user's behalf without them explicitly agreeing.`
  );
}

async function dispatch(toolName: string, args: Args): Promise<CallToolResult> {
  switch (toolName) {
    // Org tools
    case "check_nzc_setup":
      return ok(await authTools.checkNzcSetup());
    case "list_sf_orgs":
      return ok(await authTools.listSfOrgs());
    case "set_target_org":
      return ok(authTools.setTargetOrg(args.alias as string));
    case "open_org":
      return ok(await authTools.openOrg(args.path as string | undefined));

    // Data tools
    case "run_soql":
      return ok(await dataTools.runSoql(args.query as string, args.useTooling as boolean | undefined));
    case "describe_sobject":
      return ok(await dataTools.describeSObject(args.object as string));
    case "get_record":
      return ok(await dataTools.getRecord(args.object as string, args.id as string, args.fields as string[] | undefined));
    case "create_record":
      return ok(await dataTools.createRecord(args.object as string, args.fields as Record<string, unknown>));
    case "update_record":
      return ok(await dataTools.updateRecord(args.object as string, args.id as string, args.fields as Record<string, unknown>));
    case "delete_record":
      return ok(await dataTools.deleteRecord(args.object as string, args.id as string));
    case "bulk_upsert_records":
      return ok(
        await dataTools.bulkUpsertRecords(args.object as string, args.records as Record<string, unknown>[], {
          externalId: args.externalId as string | undefined,
          wait: args.wait as number | undefined,
        })
      );
    case "import_tree":
      return ok(await dataTools.importTree(args.planPath as string));
    case "export_tree":
      return ok(await dataTools.exportTree(args.query as string, args.outputDir as string, args.prefix as string | undefined));

    // Metadata tools
    case "deploy_metadata":
      return ok(
        await metadataTools.deployMetadata(args.metadataDir as string, {
          dryRun: args.dryRun as boolean | undefined,
          testLevel: args.testLevel as string | undefined,
        })
      );
    case "retrieve_metadata":
      return ok(await metadataTools.retrieveMetadata(args.manifestPath as string, args.targetDir as string));

    // Apex tools
    case "run_apex":
      return ok(await cli.runApex(args.code as string));

    // Permission tools
    case "assign_permset":
      return ok(await permsTools.assignPermset(args.name as string));
    case "assign_permset_license":
      return ok(await permsTools.assignPermsetLicense(args.name as string, args.targetUsername as string | undefined));
    case "list_permission_sets":
      return ok(await permsTools.listPermissionSets());

    // NZC helper tools — pending M5
    case "enable_net_zero_settings":
    case "load_reference_data":
    case "scaffold_sample_data":
    case "calculate_footprints":
      return notImplemented(toolName);

    // Validation tools — pending M6
    case "audit_nzc_config":
    case "list_validation_groups":
    case "diagnose_nzc_issue":
      return notImplemented(toolName);

    // Knowledge / status tools
    case "list_nzc_modules":
      return ok(await knowledge.listNzcModules());
    case "get_nzc_module_docs":
      return ok(await knowledge.getNzcModuleDocs(args.module as string));
    case "search_nzc_knowledge":
      return ok(await knowledge.searchNzcKnowledge(args.query as string, args.limit as number | undefined));
    case "explain_nzc_concept":
      return ok(await knowledge.explainNzcConcept(args.concept as string));
    case "get_nzc_troubleshooting":
      return ok(await knowledge.getNzcTroubleshooting(args.issue as string));
    case "get_org_status":
      return ok(await statusTools.getOrgStatus());
    case "health_check":
      return ok(await statusTools.healthCheck());

    default:
      return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
  }
}

/**
 * The SDK's low-level Server dispatches each incoming request via
 * `Promise.resolve().then(() => handler(...))` per message and does NOT wait
 * for one request's handler to finish before starting the next (see
 * `_onrequest` in @modelcontextprotocol/sdk/dist/esm/shared/protocol.js) — so
 * a client that pipelines e.g. set_target_org followed immediately by
 * create_record can have both handlers' bodies interleave. That's a real
 * hazard here specifically because guardProductionWrite reads mutable
 * module-level state (cli.getTargetOrg()) that a preceding call may still be
 * in the middle of writing. Serializing every tool call through one FIFO
 * queue makes each call's full guard+dispatch run to completion before the
 * next one starts, regardless of how the client paced its requests.
 */
let requestQueue: Promise<unknown> = Promise.resolve();
function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const run = requestQueue.then(fn, fn);
  requestQueue = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function main() {
  const server = new Server({ name: SERVER_NAME, version: SERVER_VERSION }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    serialized(async () => {
      const toolName = request.params.name;
      const known = tools.find((t) => t.name === toolName);
      if (!known) {
        return { content: [{ type: "text", text: `Unknown tool: ${toolName}` }], isError: true };
      }
      const args = (request.params.arguments ?? {}) as Args;
      try {
        const refusal = await guardProductionWrite(toolName, args);
        if (refusal) return { content: [{ type: "text", text: refusal }], isError: true };
        return await dispatch(toolName, args);
      } catch (err) {
        return errorResult(err);
      }
    })
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${SERVER_NAME}] MCP server v${SERVER_VERSION} ready on stdio`);
}

main().catch((err) => {
  console.error(`[${SERVER_NAME}] Fatal error:`, err);
  process.exit(1);
});
