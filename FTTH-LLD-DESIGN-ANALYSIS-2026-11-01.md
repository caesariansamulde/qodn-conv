# FTTH completed-design analysis and converter improvement brief

**Date:** November 1, 2026 — Asia/Manila  
**Source collection:** `D:\KASBEL\HORIs\LLDs`  
**Purpose:** Learn the actual completed-design conventions and identify changes that save drafting time, reduce repeated entry, and prevent inconsistent deliverables.

## Main conclusion

The next useful version of the converter should produce a coordinated LLD drawing package from one project record. Your completed work contains much more than positioned poles and NAP symbols: it includes route presentation, utility survey references, geographical paging, project quantities, NAP schedules, fiber termination, fiber core assignment, and splicing connectivity.

The existing converter already reproduces important parts of your visual language. The strongest next improvements are **preserving correct asset identity and ownership, keeping physical connectivity separate from drawing appearance, generating all quantities and schedules from shared data, and automating the geographical sheet set**. Adding more symbols alone would leave most of the repeated work and cross-document errors intact.

This review also found a reproducible converter issue relevant to your samples: automatic site-utility selection can overwrite a known individual pole owner. That deserves attention before further automation.

## 1. Scope and evidence

I inventoried **24 site folders**, containing **24 completed IEP DWGs and 842 IEP PDF pages**. I extracted text/page metadata from all 24 IEP PDFs and inventoried placemarks in all 24 accompanying HLD KMZs. I then exported and structurally examined six representative DWGs through installed AutoCAD 2027 Core Console, and visually inspected 23 selected PDF pages across five sites.

| Detailed DWG sample | IEP pages / paper layouts | Geographical layouts | Model-space entities | Layer definitions | Reason for selection |
|---|---:|---:|---:|---:|---|
| MIN3792 | 13 | 2 | 583 | 154 | Small extension from an existing NAP |
| MIN1227 | 37 | 26 | 2,048 | 158 | Mixed 8/16-line NAPs, existing sources and dummy NAPs |
| MIN1284 | 36 | 25 | 1,544 | 140 | Multiple electric utilities in one project |
| MIN851 | 91 | 79 | 4,067 | 150 | Large project, many dummy NAPs and two splicing sheets |
| MIN4026 | 57 | 45 | 3,765 | 137 | Large network with legacy drawing conventions |
| MIN5 | 29 | 18 | 1,415 | 144 | Existing standard and dummy NAP integration |

These are direct entity counts, not installation quantities. Model space includes legends, diagrams, template content and OLE objects. Layer and block-definition counts also include unused definitions.

All six analysis DWG copies matched their source SHA-256 hashes after extraction. The originals were not edited. Derived DXFs, inventories, measurements and rendered page evidence are under `exports/lld-review/` in the FTTH workspace.

**Limits:** This was a design-structure and software-improvement study, not a field survey, approval of the engineering design, optical-loss calculation, or certification of BOQ quantities. Spreadsheet contents were not fully reconciled. I did not visually inspect all 842 pages, deeply parse the other 18 DWGs, or run a complete regenerated-converter-versus-finished-DWG comparison.

## 2. How the completed drawings are organized

### 2.1 A repeatable sheet-package structure

The six DWGs share a recognizable paper-space structure:

| Drawing section | Observed layout names | Function |
|---|---|---|
| Cover | `CP` | Site identity, location, project/cluster references and issue status |
| Contents | `TOC` | Section list and number of sheets |
| Legends | `L1`, `L2`, `L3` | Proposed/existing symbols and drafting conventions |
| NAP schedule | `NAP SUMMARY` | NAP identity, capacity, leg, pole and coordinates |
| Context | `VICINITY MAP`, `KEYMAP GEO` | Site location and geographical sheet coverage |
| Detailed route | `GEO`, `GEO (2)` … | Poles, NAPs, roads, spans, cables, residential indications and survey references |
| Termination | `FTP` | ODF ports, legs, assigned loops, spare/not-terminated positions |
| Core allocation | `FCA` | Fiber Core Assignment, including buffer/core colors and loop allocations |
| Connectivity | `SPLICING DETAILS`, sometimes `(2)` | Existing/proposed connections, dummy NAPs, splitter branches, fibers and continuation references |

In these six examples the package has **11 non-geographical sheets**, with an additional sheet where splicing occupies two pages. For example, MIN1227 has 26 geographical sheets + 11 other sheets = 37; MIN851 has 79 + 12 = 91.

The inspected PDFs are US Letter landscape, 792 × 612 PDF points. The sampled GEO layouts reference `DWG To PDF.pc3` and `acad.ctb`. These are observed publishing settings, not a recommendation to assume the printed scale is correct without calibration.

### 2.2 Model space and paper space have different responsibilities

The sampled GEO layouts typically contain three viewport entities, a border polyline, a title-block insert and sheet text. Most mapped content lives in model space, while the sheet provides a repeatable frame and view.

Model space also contains the legend symbols and other non-network content. This is crucial for future quantity extraction. For example:

- MIN3792 contains six `EPOLE` inserts, but only five are the coordinate-tagged SOCOTECO survey poles represented in its project notes.
- MIN1227 contains 93 `EPOLE` inserts, while the project DLPC layer contains 92.
- MIN851 contains 218 `EPOLE` inserts, while the network DANECO layer contains 217.

**Implication:** Do not derive BOQ/RTA quantities by counting every block of a given name. Generated network assets need persistent IDs and explicit roles such as network, legend, schematic or annotation. A legacy importer should combine block attributes, layer aliases, geographic context and reviewable exceptions.

### 2.3 Title blocks are partly structured and partly embedded content

MIN1227 uses a title-block definition named `DADSADASD331231`, with attributes including `SHT_NO`, `DATE`, `SCALE`, `DWG_NO`, `ISSUE`, and staff fields. The definition also contains dozens of MTEXT entities, nested inserts, an image and an OLE object.

This explains why updating a few attributes would not update all project information. Site/location text and quantities can remain separately embedded. The six model spaces each also contain four OLE2FRAME entities; visible schedules can consequently be absent from normal text extraction.

**Improvement:** Retain the approved visual frame, but migrate all project-specific values to named fields populated from the project record. Give the cleaned template a stable name and version. Generate schedules as native tables or controlled linked outputs rather than independent pasted snapshots.

## 3. Drafting conventions worth preserving

### 3.1 Semantic layers and provider-specific blocks

Recurring layers include `P-AERIAL_FOC`, `SPAN`, `GRID`, `NAP BOUNDARY`, `ROAD_BOUNDARIES`, `ROAD_CENTERLINES`, `ROAD_LABELS`, `RTA`, and `P-POLE 9.14m CC`.

Newer examples use explicit equipment layers such as:

- `NEW NAP 16-LINES LCP` / `NEW NAP 16-LINES NON-LCP`;
- `NEW NAP 8-LINES LCP` / `NEW NAP 8-LINES NON-LCP`;
- `EXISTING NAP 16-LINES`, `NEW DUMMY NAP`;
- utility-specific layers such as `DLPC`, `SOCOTECO`, `GLOBE`, `PLDT`, `CONVERGE` and `DITO`.

Older examples use `NEW NAP`, `DUMMY NAP`, `EXPOLE`, `X-POLE`, `X-CONVERGE` and `X-DITO`. MIN851 uses layer `DANECO` while its pole OWNER attributes display `NORDECO`.

The converter should recognize both generations through a documented alias map. Canonical equipment identity should not depend exclusively on the layer name, and canonical utility names should retain the original survey wording for traceability.

Representative block contracts:

| Block | Observed attributes | Required meaning |
|---|---|---|
| `EPOLE` | `OWNER`, `POLNO`, `TYPE`, `DA` | Utility, pole tag, material, geographic coordinates |
| `PTPOLE` | `POLECODE`, `POLNO`, `POLTYP`, `DA` | Telco identity, tag, material, geographic coordinates |
| `P-POLE` | `POLNO`, `POLTYP`, `POLHYT`, `COORDINATES` | Proposed pole designation, material, height, coordinates |
| `GLOBE NAP PROPOSED` / `GLOBE NAP 8-LINES` | `MHTYPE`, `MHNO` | Equipment ID and proposed annotation |
| Existing/dummy NAP variants | `MHTYPE`, `MHNO` | Equipment ID, lifecycle/status and dummy distinction |
| `RTA`, `RTA_2` | `#` | Survey/attachment reference number |

An observed inconsistency to resolve when defining the standard: proposed-pole layers say 9.14 m, while sampled `POLHYT` attributes say 9.0 m. Do not silently select one value; establish the intended material specification and generate both layer and attribute consistently.

### 3.2 Readability depends on rotation, mirroring and offsets

The completed drawings use both rotated and mirrored symbols. Among coordinate-tagged pole inserts:

| Site | Pole inserts | Mirrored | Non-zero rotation |
|---|---:|---:|---:|
| MIN3792 | 7 | 2 | 4 |
| MIN1227 | 121 | 41 | 44 |
| MIN851 | 345 | 149 | 86 |
| MIN5 | 59 | 26 | 21 |

MIN1227 has 15 recognized Globe NAP inserts; all are rotated and eight mirrored. MIN851 has 52 recognized Globe NAP inserts; 51 are rotated and 23 mirrored. Rotation and mirroring overlap; these counts are not separate populations.

Your CAD positions are broadly consistent with an ellipsoidal Mercator representation plus drafting offsets. Comparing coordinate attributes projected with the converter's WGS84 Mercator formula to block insertion positions gives median offsets of approximately 3.46 m in MIN1227 and 4.05 m in MIN851. These measurements do not establish the survey datum or prove why each symbol moved; they show that insertion coordinates cannot automatically be treated as untouched survey coordinates.

**Improvement:** Keep separate fields for surveyed position, equipment attachment position and display position/rotation. Moving a stencil for readability must not change the measured span or underlying network connection. Extend the existing `poleLayout.ts` collision logic with editable side/rotation/mirror choices and saved overrides that survive regeneration.

### 3.3 Geographical paging already matches the converter's dimensions

The working GEO grid rectangles measure approximately **199.611 × 199.243 drawing units**, matching `GRID_WIDTH_METERS` and `GRID_HEIGHT_METERS` in `src/gridPaging.ts`. Counts match the detailed GEO sheet counts in all six samples.

Each also contains three larger GRID rectangles of approximately 475.714 × 475.714 units. Therefore a generic count of all `GRID` entities would overcount geographical sheets by three in these examples.

**Improvement:** Extend the existing paging geometry into a real sheet-set generator: identify route coverage, create numbered GEO layouts and viewports, populate the keymap, update contents and total counts, and publish in numeric order. Evaluate labels and lot boundaries near sheet edges as well as pole-center coverage. Allow deliberate overlap or continuation markers where a strict non-overlap rule would make the drawing hard to follow.

Do not equate grid width or a title-block scale string with a verified printed scale. Validate plot units, page settings and viewport transforms against a known distance.

### 3.4 Span labels are tied to the project cable total

The following sums of numeric `SPAN` labels exactly match the 12-core cable total shown in the respective PDF notes:

| Site | Numeric SPAN labels | Sum / printed 12c total |
|---|---:|---:|
| MIN3792 | 6 | 390.3 m |
| MIN1227 | 126 | 5,788.1 m |
| MIN851 | 382 | 22,416.0 m |
| MIN4026 | 197 | 10,590.9 m |

This is a useful observed reconciliation rule. It does not reveal all allowances or prove that summing visible labels is universally sufficient. MIN1284 includes SPAN text that is not a simple numeric `…m` value, so a text-only calculation must flag omissions.

**Improvement:** Calculate span labels and project totals from the same span records. Store the base measurement, allowance, run count, cable type and rounding policy separately. Account for multiple cables sharing a physical span, existing versus proposed work, and 12F versus 72F. Count physical poles once while calculating cable quantities per actual cable run.

## 4. The completed designs require an explicit network model

### 4.1 Geography and fiber connectivity are different views

The GEO plan describes where infrastructure sits. The splicing sheet describes how fibers pass through closures, dummy NAPs and splitters. They represent the same assets but require different layouts and different rules.

MIN851 shows branches, successive dummy NAPs and two schematic sheets. MIN1227 combines existing `DVO_067` assets with `MIN1227` identifiers. MIN5 includes `CRA_001` existing NAPs and dummy NAPs in a MIN5 project. An imported prefix different from the current site is therefore not automatically an error.

The current `buildHldFocCables` routine groups NAPs by loop/feeder identifier, sorts by N/D sequence, and chooses a source using identifier matching or proximity when explicit lines are absent. Explicit lines use a 25 m proximity threshold for snapping/coverage. Those are helpful drafting heuristics, but they are insufficient to certify the branch and fiber assignments visible in the finished work.

**Recommended behavior:** Preserve explicit HLD routes; suggest uncertain links with their evidence; require review for ambiguous attachments; keep loop, cable, source and port relationships as explicit data. A nearby asset must not be declared electrically/fiber-connected merely because it lies near the route.

### 4.2 FTP and FCA need configurable equipment profiles

The inspected sheets do not all use the same leg presentation. MIN3792's FTP shows six groups of 12 positions; MIN1227's FTP presents twelve groups of six positions. The FCA sheets retain 72-core/buffer structure and allocations such as L901/L902 alongside spare or not-terminated entries.

**Improvement:** Define an equipment/termination profile rather than assuming a universal 72-port mapping. Store ODF port, buffer, fiber/core, leg, loop and assignment status explicitly. Generate FTP, FCA and splicing labels from that model. Do not infer existing occupied ports from NAP naming or default them to free.

### 4.3 Lot boxes communicate service context

Geographical sheets show residential cells and NAP boundaries positioned beside the road and rotated to fit the corridor. Preserve that visual convention, but distinguish schematic service cells from surveyed parcel geometry. An 8-line NAP's graphic cell count is not, by itself, a verified customer count or cadastral lot count.

Extend the converter's lot placement so the designer can adjust orientation, side and grouping, with constraints against roads, neighboring symbols and sheet boundaries. Keep HLD cluster associations explicit for the NAP schedule.

## 5. Concrete inconsistencies and automation opportunities

### A. Mixed-utility classification can be lost in the converter — reproduced

**Drawing evidence:** MIN1284 has 96 `EXPOLE` inserts whose OWNER attributes split into **82 NORDECO and 14 DLPC**. It also has 82 `RTA` and 14 `RTA_2` inserts, plus separate DLPC/NORDECO RTA documents in its site folder.

**Code evidence:** `detectSiteElectricCoop` selects the most frequent utility; `handleFile` passes that result as the utility argument into classification. In `determinePoleLayer`, the configured/site utility branch runs before the per-pole owner branch (`src/main.tsx:2327`, `:2357`, `:11759`).

**Focused reproduction:** Two NORDECO sample poles and one explicitly named DLPC pole individually resolve to DANECO, DANECO and DLPC. Passing the auto-detected site utility makes all three resolve to DANECO. NORDECO-to-DANECO is the current alias; the defect is loss of DLPC ownership.

**First fix:** Use each pole's explicit owner first. Apply the site default only to genuinely unidentified electric poles. Separate an intentional global override from automatic detection, show how many records an override changes, and generate utility-specific RTA numbering/reports from the preserved owner field.

### B. A plotted NAP summary conflicts with its own project — visually confirmed

**MIN3792 IEP PDF, page 6:** The summary row shows `MIN2378_L903_N01`, **8** lines. The same sheet's notes show MIN3792, one 16-line NAP and 16 total lines. The DWG's proposed NAP attribute is `MIN3792_L901_N04`; the accompanying HLD also names `MIN3792_L901_N04_16_LINES`.

This is evidence of a cross-output inconsistency, not evidence that the installed equipment is wrong. Generate the schedule from the same asset records as the CAD symbols, and compare IDs and capacities before publishing. OLE/pasted content must be included in the check; ordinary DXF text extraction alone misses this table.

### C. Cover and title-block locations differ — visually/textually confirmed

**MIN1227:** The cover says BRGY. TORIL, DAVAO CITY, DAVAO DEL SUR. Repeated title-block text says BRGY. SAN VICENTE, BANGA, SOUTH COTABATO.

Maintain one approved project-location record and populate all sheets from it. Flag differing locations without automatically replacing legitimate equipment/site aliases.

### D. Large sheet labels and title-block numbers disagree

**MIN4026:** PDF page 27 displays geographical grid **19**, but its title block says **20 of 45**; page 28 displays **20**, but says **19 of 45**. Page 47 displays **39**, while its title-block text says **39 OF 40** instead of the 45-sheet geographical total.

Generate the map number, `SHT_NO`, keymap link, contents and publication order from the same sheet object. Validate duplicate/missing numbers and denominator consistency.

### E. Legacy names and exploded geometry make raw counting unreliable

MIN4026's model has 26 `GLOBE NAP PROPOSED` inserts, whereas the printed notes list 26 sixteen-line and two eight-line NAPs. There are also non-INSERT shapes on `NEW NAP`. This is not enough evidence to declare assets missing; it demonstrates why a block-name-only counter cannot reconcile every legacy drawing.

Keep generated equipment as attributed blocks. For legacy imports, flag unclassified NAP-like geometry and reconcile against HLD/schedules with designer confirmation. Never silently turn uncertain shapes into quantities.

### F. External dependencies and inconsistent metadata need a preflight

The six DXFs contain an image reference to `D:\GLOBE HOMERUN PROJECT\TEAM\MENG HELI.jpg`. AutoCAD export logs also report font substitution. These references can behave differently on another machine even when an existing PDF looks correct.

Package required assets with the template, use controlled fonts, check unresolved references, and flag blank drawing/issue fields or conflicting pole-height descriptions. Do not assume an external reference is missing merely because its path is machine-specific; check it explicitly at export time.

## 6. Recommended converter design

### One project record, several generated views

| Record | Important fields |
|---|---|
| Project | Site ID, approved location, cluster IDs, revision, date, provider, template version, coordinate system |
| Pole | Stable internal ID, original survey ID/name, explicit owner, canonical utility, tag, material, height, surveyed position, RTA group/number |
| Equipment | Stable ID, original and approved equipment names, aliases, existing/proposed status, standard/dummy type, splitter configuration, capacity, attached pole |
| Physical span | From/to pole, route geometry, measurement source, base length, allowances, crossing information, review status |
| Cable run | Cable ID, fiber count, existing/proposed status, traversed spans, run count, source/destination equipment |
| Fiber assignment | ODF/closure/port/core, leg and loop references, occupied/spare state, downstream connection |
| Drawing placement | Asset ID, display offset, rotation, mirror, label placement, designer override |
| Sheet | Stable sheet ID, bounds, view transform, number, section total, layout name, title-block fields |

Do not use editable labels, layer names or PDF page positions as database keys. Preserve source provenance for every imported fact and record whether a value was supplied, inferred or confirmed by the designer.

The generated views then become CAD geometry, NAP summary, project notes, RTA lists, BOQ quantities, FTP/FCA, splicing diagrams and the published sheet index. Manual drafting corrections should be saved as overrides on this record rather than disappearing on the next export.

### A practical designer workflow

1. **Create project:** Enter or import the site identity and select a versioned provider/template profile.
2. **Import sources:** HLD, pole survey and optional existing-design records; preserve source file identities and revisions.
3. **Resolve exceptions:** Review uncertain owners, duplicate IDs, unmatched NAP-to-pole links, conflicting capacities and source connections.
4. **Review routes:** Accept explicit paths; confirm suggested branches, crossings and cable assignments.
5. **Adjust presentation:** Rotate/mirror/offset symbols and lot groups; retain these choices when recalculating.
6. **Generate sheets and schedules:** Produce geographical layouts, keymap, title blocks, notes, NAP summary and utility RTA groups from shared records.
7. **Validate and publish:** Show actionable errors linked to the affected asset/sheet. Export DWG, PDF and schedules with a common revision manifest.

## 7. Implementation priorities and acceptance criteria

| Order | Improvement | Why it matters | Acceptance criterion |
|---|---|---|---|
| 1 | Preserve per-pole ownership | Directly addresses the reproduced mixed-utility defect | MIN1284-style input retains 82 NORDECO and 14 DLPC records; defaults fill only unknown owners |
| 2 | Shared project/equipment records and linked summaries | Eliminates repeated entry and stale project data | CAD NAP IDs/capacities, NAP summary and notes reconcile; project location agrees across sheets |
| 3 | Versioned DWG template and GEO sheet generation | Removes repeated layout/view/title-block work | Pilot generates all numbered GEO layouts, keymap and contents with matching counts and labels |
| 4 | Explicit route/span model and cable totals | Prevents wrong connections and quantity drift | Every published cable has reviewed endpoints; span/run totals reconcile under documented allowance rules |
| 5 | Utility RTA references and drawing-to-survey navigation | Reduces manual numbering and lookup | Each reference resolves to the correct pole and utility report; numbers are unique within their defined group |
| 6 | Persistent placement overrides | Preserves the effort spent on readable drawings | Re-import/rebuild retains approved placement for unchanged asset IDs and flags changed assets |
| 7 | FTP/FCA/splicing generation | Removes complex cross-sheet duplication | Every displayed core/port connection comes from an explicit assignment; existing usage is preserved and conflicts are reported |
| 8 | Controlled release preflight and packaging | Catches incomplete or environment-dependent deliverables | Publish reports no unresolved critical conflicts; resources, template version and common revision are recorded |

Orders 1–3 offer the best initial balance of usefulness and implementation risk. Fiber assignment should follow a confirmed network model, not be inferred wholesale from proximity or naming.

### Initial validation rules

- Known utility owners survive auto-detection; unknown owners remain visible until resolved.
- Equipment IDs are unique within the appropriate namespace; legacy source aliases remain allowed.
- Standard NAP capacity agrees with its approved splitter/type; dummy equipment contributes no customer ports.
- Equipment attachment and cable endpoints are explicit; crossings do not automatically create junctions.
- Span measurement uses the intended physical coordinates, independent of stencil displacement.
- Invalid or out-of-policy spans create visible review items. The current span routine skips lengths below 2 m or above the maximum (`buildPoleSpansEntities`, `src/main.tsx:7017`); omitted spans should not disappear without explanation.
- Physical pole quantities exclude legends/schematics. Cable totals account for actual runs and status.
- Map number, sheet attribute, contents count and publication order agree.
- Cover, title blocks, summaries and export filenames use the same project/revision data.
- ODF/core allocations have no unintended duplicate use; existing assignments are not overwritten by defaults.
- Required fonts/images/templates are available; generated blocks preserve editable attributes.

Thresholds for spans, snapping, crossings and optical limits must be configurable against the actual approved engineering standard. The examples alone do not establish those limits.

## 8. Suggested pilot and regression collection

Use **MIN3792** for the first complete package-generation pilot: only two GEO sheets, one proposed NAP, one existing source, seven coordinate-tagged poles and a 390.3 m displayed span total. Correct the known schedule inconsistency in the expected reference data rather than teaching the converter to reproduce it.

Then add:

- **MIN1284:** multiple owners and separate RTA groups;
- **MIN1227:** mixed capacities, source aliases, rotated/mirrored symbols and 26-sheet paging;
- **MIN5:** existing dummy NAPs and existing standard sources;
- **MIN851:** 79 geographical sheets, 345 coordinate-tagged poles, 52 recognized NAP/dummy blocks and complex branches;
- **MIN4026:** legacy layers/non-block geometry and numbering checks.

For each fixture, preserve source hashes, approved network records, expected quantities, expected sheet order and representative page renders. Compare engineering meaning and sheet usability rather than byte-for-byte DWG equality. Keep known reference inconsistencies as deliberate failing QA cases.

## 9. Evidence and follow-up

Primary source drawings are the six `*_IEP.dwg` files in their corresponding site folders under `D:\KASBEL\HORIs\LLDs`. Visual findings use the matching IEP PDFs: MIN3792 pages 6, 9, 11–13; MIN1227 pages 1, 9, 20, 35–37; MIN1284 pages 9 and 15; MIN851 pages 9, 50, 89–91; and MIN4026 pages 27, 28, 47 and 56. MIN3792 page 8 was also inspected for keymap structure.

Local evidence includes `inventory.json`, six `*-structure.json` files, `measured-patterns.json`, `source-manifest.json`, AutoCAD conversion logs and rendered pages under `exports/lld-review/`. Analysis helpers were added under `scripts/`; production converter code was not changed.

The remaining design decisions before implementing the full workflow are the approved template version, intended pole-height specification, treatment of aliases, cable allowance/run-count rules, utility numbering policy, and the ODF/leg profiles to support. These should become explicit project settings and acceptance tests rather than assumptions hidden in drawing code.
