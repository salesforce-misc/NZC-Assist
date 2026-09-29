---
description: Browse the Net Zero Cloud module documentation index
---

# Net Zero Cloud Module Docs

Browse curated documentation for each Net Zero Cloud module.

$ARGUMENTS

## Steps

1. If a module name was provided in arguments → call `get_nzc_module_docs` for that module.
2. If no module → call `list_nzc_modules` and show the index (module name, one-line summary, JOURNEY_MAP row it maps to).
3. Render the module doc: overview, key objects, setup step it belongs to, related skill(s), and the source dev-guide URL from `documentation/README.md`.
4. If the user asks a specific question rather than browsing, redirect to `/nzc:help`.
5. Never invent a dev-guide URL — only surface URLs already curated in `documentation/README.md`.
