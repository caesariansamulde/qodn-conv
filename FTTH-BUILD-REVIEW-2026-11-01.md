# FTTH current-build review

**Review date:** November 1, 2026 (Asia/Manila)  
**Project:** FTTH KMZ-to-CAD Converter & LLD Automator  
**Source version:** 2.3.0  
**Reviewed commit:** `28b2e7a` — October 29, 2026, electric-cooperative OWNER attribute correction  
**Scope:** Current local source, production build, conversion logic, local server, packaging, release files, and documentation. Findings describe the current build; they are not necessarily regressions in the latest commit.

## Executive assessment

The project is a substantial, specialized drafting application with useful FTTH domain logic. It combines survey import, provider-specific pole stencils, HLD NAP classification, CAD generation, road context, map previews, and Excel photo attachment. The production source compiles successfully, and focused checks confirm several important NAP classification rules.

**Recommendation: continue controlled internal evaluation, but address the high-priority defects before distributing a new release or relying on all exports without manual checks.** Compilation is healthy; output correctness, desktop process isolation, admin protection, and release verification need further work. The strongest concerns are a launcher that can terminate unrelated Node.js processes, an Excel export transformation that damages the package manifest, and an HLD CSV whose coordinates can disagree with the CAD drawing.

The existing Windows executables were not validated as equivalent to the reviewed source. Their filesystem modification dates are October 22, while the source includes October 26 changelog entries and the October 29 commit. This is a release-provenance gap, not proof of their embedded version.

## What is implemented

| Area | Current implementation | Assessment |
|---|---|---|
| Survey ingestion | KML and KMZ, multiple input files, multiple KML entries, XML parsing and metadata extraction | Useful coverage; input limits and geographic validation need strengthening |
| Pole standards | Globe, Maps.me, structured PLDT, legacy PLDT, electric-cooperative detection, provider layers and stencil attributes | Strong domain specialization; classification needs lasting regression coverage |
| HLD/NAP handling | Proposed/existing/dummy classifications, batch markers, 8/16-port rules, LCP distinctions, schedule and CAD outputs | Core rules have focused validation; schedule/CAD coordinate consistency has a confirmed defect |
| CAD generation | DXF blocks, attributes, layers, routing, span labels, lot boxes, grid paging and coordinate modes | Extensive implementation; full engineering accuracy and AutoCAD compatibility remain unverified in this review |
| Road and map context | OpenStreetMap Overpass requests, road geometry, residential context, map and satellite previews | Network-dependent features; not fully offline |
| DWG export | Local HTTP endpoint invokes installed AutoCAD Core Console; 20 MB request limit and 120-second process timeout | Requires a usable AutoCAD installation/profile; static web builds offer DXF instead |
| Excel photo workflow | ZIP/folder intake, photo matching and direct XLSX package modification | Useful scope, but currently the weakest output-integrity area |
| Delivery | React/TypeScript/Vite web build, GitHub Pages workflow, PowerShell/C# executable packaging | Build works; automated functional and packaged-release gates are missing |

## Verification performed

- `npm run build` passed using the installed Node.js `v24.16.0`. TypeScript checking and Vite production bundling completed successfully.
- Vite produced a **649.72 kB JavaScript bundle**, approximately **185.70 kB gzip**, and a 13.13 kB stylesheet. It warned that the JavaScript chunk exceeds 500 kB. This is a loading/maintainability concern, not a measured user-facing performance failure.
- Six isolated checks of the actual transpiled source passed: explicit 8-line N01 detection, explicit 16-line detection, batch marker recognition, dummy NAP recognition, structured PLDT recognition and legacy PLDT recognition. Browser imports were stubbed; these were function checks, not end-to-end UI tests.
- A deterministic probe confirmed the HLD CSV/CAD axis mismatch. Another reproduced the Excel manifest transformation defect.
- An isolated call to the local server's path-resolution function confirmed that `/%ZZ` throws `URIError: URI malformed`.
- The starting Git worktree was clean. No application fixes were made. The production build regenerated ignored `dist` output; this report is the review deliverable.

**Validation limits:** No live browser usability/accessibility pass, representative full KMZ-to-DWG conversion, AutoCAD AUDIT inspection, Excel round-trip, packaged EXE launch, fresh-machine installation, dependency vulnerability audit, or deployed-site verification was performed. External telemetry endpoints were not exercised. These limits prevent a production-readiness certification.

## Priority findings

### 1. High — Desktop updates can terminate unrelated Node.js applications

**Evidence:** `scripts/package-single-exe.ps1:103`, `:191–199`.

The generated launcher calls `KillStaleServerProcesses(appDir)` when an extraction/update is needed. Although the method receives the application directory, it does not use it: it enumerates every process named `node` and calls `Kill()` on each one.

**Impact:** Launching a new package can interrupt unrelated development servers, scripts, or other Node-based applications under the user's account. The behavior is clear in source; the destructive action was not executed during review.

**Recommended correction:** Track the FTTH server process and verify its executable/script path before stopping it. Prefer a graceful shutdown endpoint or a stored PID combined with identity validation. Test upgrades while an unrelated Node process remains running.

### 2. High — Excel photo export can produce an invalid workbook manifest

**Evidence:** `src/ExcelPicConverter.tsx:436–437`.

When the workbook lacks a JPEG content-type registration, the code replaces `<Types` with `<Types><Default .../>`. A normal `<Types xmlns="...">` root consequently loses its namespace attribute; that original attribute becomes text inside the document.

**Impact:** The resulting XLSX package has an invalid content-types manifest and may require repair or fail to open. The string transformation was reproduced; the resulting workbook was not opened in Excel.

**Recommended correction:** Parse the manifest as XML and append a correctly namespaced `Default` element while retaining the existing root and attributes. Validate exports from workbooks both with and without existing JPEG registrations.

### 3. High for populated workbooks — Excel export overwrites existing package assets

**Evidence:** `src/ExcelPicConverter.tsx:389`, `:426–434`.

The converter writes `image1.jpeg` onward, replaces `drawing1.xml` and its relationships, and replaces the complete relationships file for sheet 2. It does not preserve or merge existing parts at these locations.

**Impact:** A workbook already using those parts can lose images or drawing content, or retain broken references to hyperlinks and other related objects. This is conditional on the input workbook's structure; source inspection confirms the overwrite behavior.

**Recommended correction:** Allocate unused media/drawing names and merge relationships. If the workflow intentionally supports only one controlled survey template, validate that template and reject incompatible workbooks before changing any package parts.

### 4. Medium — HLD CSV coordinates disagree with latitude-first CAD output

**Evidence:** `src/main.tsx:9400–9403`, `:9954–9961`, `:9977–9978`.

The CAD generator selects latitude as X and longitude as Y in `raw_lat_lon` and `epsg_4326_lat_lon` modes. The CSV exporter falls back to longitude as X and latitude as Y. It also rounds both CAD columns to two decimal places even when their units are degrees.

**Reproduction:** At latitude `7.123456`, longitude `125.612345`, the CAD transform returns X=`7.123456`, Y=`125.612345`. The CSV emits X=`125.61`, Y=`7.12`.

**Impact:** A schedule can contradict the drawing. Reusing the CAD columns as geographic coordinates also introduces substantial precision loss.

**Recommended correction:** Use one shared projection function for both outputs; use degree-appropriate precision for geographic modes. Label units explicitly and compare every supported coordinate mode in regression checks.

### 5. High for author controls — Admin authorization relies on embedded shared passkeys

**Evidence:** `scripts/usage-logger.mjs:508–519`; `src/main.tsx:11473–11484`.

The server accepts hardcoded passkeys for telemetry and revocation configuration, and the frontend contains a default accepted passkey. The status endpoint also returns configured endpoint URLs and recent logs without an author-authentication check (`scripts/usage-logger.mjs:473–496`).

**Impact:** The author-only boundary does not protect against someone who can inspect the distributed client or source and access the local service. They can change telemetry destinations or revocation configuration. The standalone server binds to loopback, which limits direct network exposure; this finding is not a claim that the server is publicly reachable.

**Recommended correction:** Remove reusable secrets from frontend code, authenticate privileged local actions with server-managed credentials, and separate ordinary application status from sensitive administrator details.

### 6. Medium — Malformed request paths can crash the local server

**Evidence:** `scripts/serve-dist.mjs:30–36`, `:63`.

`decodeURIComponent` executes without an exception boundary in the HTTP request path. The isolated request-path probe `/%ZZ` produced an exception, and the server callback has no surrounding handler for it.

**Impact:** A malformed local HTTP request can terminate the app server instead of returning a client error.

**Recommended correction:** Catch malformed URL/encoding errors and return HTTP 400. Add file-stream error handling and use a path-containment check based on path components rather than a simple string prefix.

### 7. Medium — Imported text reaches HTML map popups without final escaping

**Evidence:** `src/main.tsx:10127–10138`, `:10717`, `:10738`.

Generated previews concatenate NAP references, route names and pole fields into popup/tooltip HTML. Escaping `<` during JSON serialization protects the script container, but the values are decoded again before being inserted into HTML strings.

**Impact:** Imported text can be interpreted as markup in the preview, creating an HTML/script injection risk for untrusted survey data. This was identified by source tracing; no browser exploit was attempted.

**Recommended correction:** Build popup elements with text nodes or escape every imported field at its final HTML insertion point. Include markup-bearing names in preview tests.

## Additional reliability and maintenance gaps

- **Geographic validation:** `parseCoordinates` at `src/main.tsx:529` checks only numeric finiteness. A probe accepted longitude 181 and latitude 95. Reject invalid geographic ranges with actionable source-feature errors before projection.
- **Import capacity:** `readSourceFile` at `src/main.tsx:10426` reads KMZ entries without explicit file-size, decompressed-size or feature-count limits. Large archives and synchronous CAD generation need representative workload testing; no performance limit was measured here.
- **Automated coverage:** `package.json` has no test or lint scripts. The Pages workflow installs and builds but does not run functional assertions. Existing inspection scripts and CAD samples are useful diagnostic material, not an automated release gate.
- **Code concentration:** `src/main.tsx` contains **14,948 lines**, combining UI, parsing, projection, CAD assembly, previews, telemetry and licensing. Split these responsibilities incrementally, starting with shared projection and export functions where consistency already failed.
- **Documentation/runtime mismatch:** README states Node 18 or higher. Installed Vite 7.3.5 declares Node `^20.19.0 || >=22.12.0`. Document and enforce a compatible runtime; the CI workflow already selects Node 22.
- **Version drift:** The package/UI say 2.3.0, browser telemetry records 2.2.9 (`src/main.tsx:11305`), and server telemetry defaults to 2.2.8 (`scripts/usage-logger.mjs:389`). Generate these values from one version source.
- **Operational dependencies:** DWG needs local AutoCAD; map tiles and OSM context need external services. The code includes remote usage reporting and revocation checks. Document these dependencies and the renewal procedure for the hardcoded September 2, 2027 UTC expiry, and test offline/error behavior deliberately.

## Recommended release plan

**Before the next distribution:** Fix process termination scope, Excel manifest/asset preservation, CSV projection consistency and embedded admin credentials. Harden request-path handling and popup escaping. Keep the fixes separate enough to verify each behavior.

**Then establish a small acceptance suite:** Cover Globe/Maps.me/PLDT samples; 8/16-line and existing/dummy NAPs; all coordinate modes; layer/attribute counts; known spans; malformed and large imports; Excel files with existing drawings; and an EXE upgrade while another Node application is running. Check outputs in actual AutoCAD and Excel, not just through compilation.

**Finally rebuild and identify the release:** Produce the desktop package from the reviewed commit, record version/commit/runtime in a manifest, publish checksums, and verify a clean-machine launch. Keep a clear distinction between the static web DXF experience and the desktop DWG experience.

The most valuable next milestone is a reproducible, verified release with consistent engineering outputs. The application already has broad feature coverage; these corrections would make that functionality substantially more dependable.
