# FTTH KMZ-to-CAD Converter & LLD Automator

A specialized GIS-to-CAD conversion suite for Outside Plant (OSP) Fiber-to-the-Home (FTTH) engineering. It automatically converts surveyed poles, Network Access Points (NAPs), and aerial cable spans from Google Earth KMZ/KML files into standardized AutoCAD DXF/DWG formats.

---

## Key Features

### 1. Pole Survey Converter
* **Automated Pole Positioning & Collision Avoidance**: Automatically clears poles from road carriageways and aligns pole data stencils outside road boundary curbs.
* **Standard Telco Stencils**: Generates native AutoCAD block inserts with standard attribute tags (`PTPOLE`, `EPOLE`, `P-POLE`, etc.) for Globe Telecom, PLDT, and regional power utilities (DLPC, Meralco, Cotelco, etc.).
* **Aerial FOC Cable Routing (`P-AERIAL_FOC`)**: Auto-routes aerial cables along the road corridor with configurable road inset offsets (3m–5m) and places vertices facing each surveyed pole.
* **Span Measurement Layer (`SPAN`)**: Measures surveyed span lengths formatted to 1 decimal place with configurable allowance (+2.0m).
* **Automated Grid Paging Boxes**: Generates standardized CAD keymap paging frames with manual page-number placeholders (`#`).
* **Element Toggles**: Easily toggle on/off individual CAD layers (FOC Cable, Grid Paging Box, Pole Stencils, Spans, Road Boundaries, Demand Polygons).

### 2. HLD NAP Converter
* **Dual-Line NAP Stencils**: Produces standard telco attribute blocks:
  * **Line 1 (`MHTYPE`)**: Clean NAP identifier (e.g., `DVO_067_L907_N01`).
  * **Line 2 (`MHNO`)**: `NAP AUGMENT` (for proposed) or `SOURCE EXISTING NAP` (for existing).
* **Multi-File / LLD Support**: Drag and drop both HLD KMZ and Pole Survey KMZ together to generate pole-by-pole LLD cable paths.
* **Automatic Feeder / Distribution Cable Linking**: Connects OLT, FOC closures, dummy NAPs, and distribution loops.

---

## Getting Started

### Residential lot layout

Attach the finalized HLD and load the road context before generating residential lot groups. The planner evaluates nearby road space for all proposed NAPs, then selects placements that avoid road carriageways and other generated groups. Curved groups follow the road outline. Frontage, depth and row arrangement adapt to available space, and the cells within each NAP group have equal areas. Candidate selection uses a common feasible lot-area scale across the site, so neighboring groups remain comparable. The starting scale is derived from nearby road-island widths. A row-count change recalculates the full footprint depth instead of shrinking individual lots inside an unchanged footprint. Dimensions and outlines remain adaptive. In narrow strips between roads, the planner fits the front and back rails to the two facing curbs, retaining vertices from both boundaries rather than leaving unused space along one side. The planner prefers two rows with shared column dividers, but can use four rows or different column counts in the inner and outer rows of a tight bend to retain practical cell proportions. Schematic checks require at least 10 m of frontage, 6.5 m of usable depth, a depth/frontage ratio no greater than 2, and frontage variation no greater than 1.5 within a row; these are layout heuristics, not surveyed parcel standards. Facing curbs are matched by local cross-sections; pointed tips and sliver-shaped cells are avoided. RES labels use each cell’s area centroid, with an interior-center fallback for concave cells, and text size is checked against the complete rotated label box. Lot counts remain 10 cells for an 8-line NAP and 16 cells for a 16-line NAP.

The planner attempts the complete 10/16-cell allocation for every supplied HLD NAP. Crowded locations are repacked along real curbs using a common site-wide scale. When one continuous footprint cannot fit, a complete group can occupy multiple clear curb-attached strips; the parts retain equal cell areas and are checked against each other, neighboring groups and the roads. The nearest part stays within 35 m of the owning NAP, and additional parts stay within 55 m. Complete road carriageways protect junction interiors even where curb lines were trimmed. Actual curb segments are also checked for interior crossings.

No colliding fallback geometry is exported. If the supplied road geometry cannot accommodate a complete valid group, the NAP remains in the HLD source list and appears under **Residential lots need review**. Missing road context is also explicit. HLD coordinates are retained. These are schematic residential cells, not surveyed parcel boundaries.

Run the geometry and DXF integration checks with `npm run test:lots`. GRID paging remains off by default; its numbering workflow is unchanged.

### Prerequisites
* [Node.js](https://nodejs.org/) (version 18 or higher)
* [Git](https://git-scm.com/)

### Installation & Local Development
```bash
# Clone the repository
git clone https://github.com/<your-username>/<your-repo-name>.git
cd <your-repo-name>

# Install dependencies
npm install

# Start local development server
npm run dev
```
Open your browser at `http://localhost:5173`.

### Production Build
```bash
# Compile TypeScript and bundle with Vite
npm run build
```

### Packaging Windows Standalone Executable (.exe)
```powershell
# Compiles a single-file portable Windows executable
npm run package
```
The output executable will be created at `FTTH-KMZ-to-CAD.exe` and `release/FTTH-KMZ-to-CAD.exe`.

---

## Deployment to GitHub Pages

This project includes an automated GitHub Actions workflow (`.github/workflows/deploy.yml`).
1. Push this repository to GitHub.
2. In your repository on GitHub, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, select **GitHub Actions**.
4. Every push to `main` or `master` will automatically build and publish the live web app.

Residential frontage follows the exact road-boundary polyline with zero setback, including vertices between lot dividers. GRID paging searches alternative frame offsets using generated drawing extents, keeps explicit road/cable paths continuously covered, and gives each generated lot group a complete page with clearance. Supplemental overlapping detail pages may be added where a group straddles the common page lattice. Frame dimensions remain approximately 199.61 × 199.24 m; GRID remains off by default and numbering stays manual. Run paging regressions with `npm run test:grid`.
