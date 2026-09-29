# Source Documentation

This directory holds curated links into the official, publicly-hosted Net Zero Cloud documentation. NZC-Assist's knowledge base is **curated from the online Developer Guide** — there is no bundled PDF and no personal file paths (see `CLAUDE.md` / the confirmed v1 scope decisions).

## Primary reference

- **Net Zero Cloud Developer Guide — Standard Objects** — https://developer.salesforce.com/docs/atlas.en-us.netzero_cloud_dev_guide.meta/netzero_cloud_dev_guide/netzero_cloud_std_objects_intro.htm
  - This is the root of the standard-objects reference used throughout `JOURNEY_MAP.md`, `knowledge/data-model.md`, and the `skills/nzc-*` object catalogs.
  - The Developer Guide's own table of contents (left nav on that page) is the authoritative index into per-object and per-domain pages (emission factors, footprints, annual inventory, settings, etc.).

## Adding more links

As `knowledge/modules/*` and the `skills/nzc-*/SKILL.md` files are authored (M3), add the **specific** Developer Guide / Help page for each domain here once it has actually been opened and confirmed, in this form:

```
- <exact page title> — <exact URL>
```

Do not add a URL to this file (or cite one in a skill/knowledge doc) unless it has been fetched and confirmed to exist — a wrong or guessed URL is worse than no URL. If a fact can't be traced to a fetched page, treat it as unverified and confirm the corresponding object/field/setting against the live org via `describe_sobject` instead (see `CLAUDE.md` § "Always `describe_sobject`").

## What deliberately does not live here

- No bundled PDF — the source of truth is the live Developer Guide, which stays current across releases; a bundled PDF would go stale.
- No personal file paths or machine-specific script dependencies.
- No screenshots — `JOURNEY_MAP.md` is authored directly from the Developer Guide's object/setup descriptions, not transcribed from a screenshot.
