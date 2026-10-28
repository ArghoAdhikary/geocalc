# GeoCalc Pro

An independently implemented desktop app for **geotechnical analysis**, built to
a developer requirements specification in phases, with an AI chat assistant and
a **numerical validation** discipline: a method is labeled *Verified* only when
its analytical benchmarks pass — and these run in CI before every release.

## Analyses

| Module | What it does | Maturity |
|---|---|---|
| **Geometry editor** | Draw/edit closed polygon regions (points, polylines, regions) by mouse **and** an editable coordinate table; grid/snap, pan/zoom, undo/redo, per-region material, validation (self-intersection, zero area, overlap), slope/two-layer templates, and “send ground profile → Slope” | Implemented (algorithms unit-tested) |
| **Slope stability** | Method of slices — Fellenius, Bishop, **Spencer** (force + moment); **grid** or **entry-and-exit** circular search; rᵤ, water-table, piezometric-line, **or rapid-drawdown** pore pressure | Verified (envelope) |
| **Rapid drawdown** | Effective-stress drawdown study: before (full pool) / long-term drained / **critical undrained** across a sweep of pool levels → **FoS-vs-drawdown curve** + CSV export (γ_sat weights, hydrostatic buoyancy, conservative no-dissipation bound) | Verified (envelope) |
| **Parametric study** | Sweep any slope parameter (φ′, c′, β, H, γ, rᵤ, water levels) → **critical-FoS-vs-parameter curve**; export the curve and the **critical-surface slices** as CSV for Python/MATLAB/R | — |
| **Seepage** | 2D steady (FD) and transient (implicit) saturated flow, cutoff wall | Verified (envelope) |
| **FE flow** | Finite-element meshing for steady flow (triangular elements) | Verified (envelope) |
| **Stress–deformation** | 2D plane-strain linear-elastic FEM, self-weight + surcharge | Implemented (unverified) |
| **Consolidation** | 1D Terzaghi consolidation with the U–Tv verification plot | Verified (envelope) |
| **Dynamics** | SDOF response (Newmark), response spectrum, 1D site response | Verified (envelope) |
| **Thermal** | 1D steady and transient conduction | Verified (envelope) |
| **3D flow** | 3D volumetric mesh + steady flow, mid-depth slice view | Verified (envelope) |
| **Probabilistic** | Monte Carlo slope reliability — P(failure), reliability index β | Verified (envelope) |
| **Materials** | Editable soil library: colour, classification, bulk/saturated unit weight, drained (c′, φ′) **and** undrained (cu) strength with a drainage selector, permeability, stiffness, provenance (source/test/date/approval), range advisories, search, duplicate, import/export | — |
| **Standards & metadata** | Project metadata + an editable **standards register** (AS 1726 / AS 1289 / AS 3798 / AS 4678 as candidates to *verify*) and a user-entered **design-criteria** register — a register, not a compliance engine | — |
| **Validation** | Live benchmark evidence matrix (all analytical cases) | — |

Every *Verified* method states its **envelope**; results carry a disclaimer;
nothing is marked *Released* (an independent reviewer sign-off is still required
per the spec). Unverified methods are clearly labeled **demonstration** output.

## AI assistant

Three honest ways to use AI, none required:

1. **Offline interpreter** — built-in, no account, handles common commands.
2. **Manual mode (📋)** — use your existing **ChatGPT Plus / Claude Pro / Gemini**
   subscription in its own web app: GeoCalc builds a prompt from the context you
   pick, you copy it, paste it into the provider, and paste the reply back. No API
   key and no extra bill. Opening the provider sends nothing automatically, and the
   reply is never applied to your project on its own — numerical results always come
   from the solver.
3. **API mode** — direct calls with your own key for **Claude, OpenAI, Gemini, or any
   OpenAI-compatible endpoint** (key stored only on your machine). This bills your API
   account **separately** from any consumer subscription; a consumer subscription does
   not grant third-party API access.

## Headless / scripting

Run analyses from a project file, reproducibly (seeded Monte Carlo):

```bash
node bin/geocalc-run.js myproject.gcp --mc 2000 42
```

## Download

Prebuilt apps for macOS and Windows are on the
[Releases](../../releases) page (`.dmg`/`.zip` for macOS, installer/portable
`.exe` for Windows).

The apps are **not code-signed** (that needs a paid Apple/Microsoft developer
certificate), so Gatekeeper/SmartScreen will warn on first launch:

- **macOS (Apple Silicon):** after dragging **GeoCalc Pro.app** to `/Applications`,
  the app may report that it "is damaged and can't be opened." That's the
  unsigned-app check, not a corrupt download. Clear it once in Terminal:

  ```bash
  xattr -cr "/Applications/GeoCalc Pro.app"
  ```

  Then open it normally. (Right-click → Open also works for the milder
  "unidentified developer" warning.)
- **Windows:** on the SmartScreen prompt choose **More info → Run anyway**.

## Build & test from source

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm test            # unit tests + analytical benchmark suite (CI gate)
npm start           # run in a dev window
npm run build       # package for the current OS into dist/
```

## Disclaimer

GeoCalc Pro is an independent, open-source learning tool. It is **not**
affiliated with, endorsed by, or derived from any commercial geotechnical
product. Its solvers are simplified and verified only within the stated
envelopes — always verify against established methods before any real design
decision.

## License

MIT — see [LICENSE](LICENSE).
