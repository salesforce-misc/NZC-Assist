# Net Zero Cloud — Module Knowledge Base (Index)

Per-module enablement content curated from the [Net Zero Cloud Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.netzero_cloud_dev_guide.meta/netzero_cloud_dev_guide/netzero_cloud_std_objects_intro.htm) (see `documentation/README.md` for the link registry). Each row maps to a journey in [`JOURNEY_MAP.md`](../../JOURNEY_MAP.md) and a step in its Part 2 setup sequence.

Foundation & Licensing (journey row 1), Permissions & Access (row 2), and the Data Model overview (row 3) are **not** separate module folders here — they're covered directly by the `nzc-foundation-licensing` and `nzc-data-model` skills, which apply across every module below.

## Modules

| Folder | Journey row | Setup-sequence step(s) |
|---|---|---|
| [`settings/`](./settings/README.md) | 4 | 4 |
| [`record-types-config/`](./record-types-config/README.md) | 5 | 5-6 |
| [`reference-data/`](./reference-data/README.md) | 6 | 7-8 |
| [`stationary-buildings/`](./stationary-buildings/README.md) | 7 | 9, 12-13 |
| [`vehicles-fleet/`](./vehicles-fleet/README.md) | 8 | 12-13 |
| [`waste/`](./waste/README.md) | 9 | 12-13 |
| [`water/`](./water/README.md) | 10 | 12-13 |
| [`scope3-procurement/`](./scope3-procurement/README.md) | 11 | 10, 12-13 |
| [`scope3-travel/`](./scope3-travel/README.md) | 12 | 12-13 |
| [`annual-inventory/`](./annual-inventory/README.md) | 13 | 11 |
| [`footprint-calc/`](./footprint-calc/README.md) | 14 | 14 |

11 module folders. Each is a stub README pointing back to `JOURNEY_MAP.md` and the Developer Guide. Rows 15 (targets/forecast/credits/ESG) and 16 (testing & go-live) are not modules in this sense — row 15 is out of v1 scope, and row 16 is the `nzc-testing-validation` skill + `nzc-sdet` agent.
