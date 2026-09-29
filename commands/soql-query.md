---
description: Run a SOQL query against your connected Net Zero Cloud org
---

# Run SOQL Query

Execute a SOQL query against the connected Net Zero Cloud Salesforce org.

$ARGUMENTS

## Steps

1. Verify org connection with `check_nzc_setup`.
2. If a query was provided in arguments → execute with `run_soql`. Format as a readable table.
3. If no query → ask what data, then suggest using `describe_sobject` first to discover field names.
4. If user describes intent (e.g., "show me stationary sources") → use `describe_sobject` to find actual fields, build the query, run it.

Common starters: `nzc-data-model` and `salesforce-query` skills have the canonical Net Zero Cloud queries.

**Reminder**: Net Zero Cloud object/field names can vary by license and release — always verify with `describe_sobject` before constructing complex queries. Never use `run_soql` for record types, `*Config` custom metadata, or Industries/Sustainability settings — those are metadata, not data (use `deploy_metadata`/`retrieve_metadata`).
