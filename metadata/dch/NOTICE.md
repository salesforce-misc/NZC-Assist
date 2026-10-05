# Attribution

The Disclosure & Compliance Hub (DCH) metadata under `metadata/dch/`, the Word report templates and the DocGen sample packs under `data/dch/`, and the Apex bodies inlined in `src/dch/` are derived from the internal Salesforce project `DCHFullSetup` (https://git.soma.salesforce.com/mverigin/DCHFullSetup, commit 705012897845ab593a8a04315b79ff728d6de140), authored by Myles Verigin.

The project's CumulusCI flows were re-expressed as MCP tools in `src/dch/`. The content was carried over unchanged, except that directories were renamed, the per-directory `package.xml` files were dropped (the files are deployed in source format), and the templates were decoded from base64 recipe payloads into `.docx` files.
