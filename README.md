# GeoCalc Pro

An independently implemented desktop app for **geotechnical analysis**, built to
a developer requirements specification in phases, with an AI chat assistant and
a **numerical validation** discipline: a method is labeled *Verified* only when
its analytical benchmarks pass — and these run in CI before every release.

## Analyses

| Module | What it does | Maturity |
|---|---|---|
| **Slope stability** | Method of slices (Fellenius, Bishop), circular search, rᵤ **or** water-table pore pressure | Verified (envelope) |
| **Seepage** | 2D steady (FD) and transient (implicit) saturated flow, cutoff wall | Verified (envelope) |
| **FE flow** | Finite-element meshing for steady flow (triangular elements) | Verified (envelope) |
| **Stress–deformation** | 2D plane-strain linear-elastic FEM, self-weight + surcharge | Implemented (unverified) |
| **Consolidation** | 1D Terzaghi consolidation with the U–Tv verification plot | Verified (envelope) |
| **Dynamics** | SDOF response (Newmark), response spectrum, 1D site response | Verified (envelope) |
| **Thermal** | 1D steady and transient conduction | Verified (envelope) |
| **3D flow** | 3D volumetric mesh + steady flow, mid-depth slice view | Verified (envelope) |
| **Probabilistic** | Monte Carlo slope reliability — P(failure), reliability index β | Verified (envelope) |
| **Materials** | Shared soil library feeding the analyses | — |
| **Validation** | Live benchmark evidence matrix (all analytical cases) | — |

Every *Verified* method states its **envelope**; results carry a disclaimer;
nothing is marked *Released* (an independent reviewer sign-off is still required
per the spec). Unverified methods are clearly labeled **demonstration** output.

## AI assistant

A chat panel drives the app in plain language. It works offline with a built-in
interpreter, and can use **Claude, OpenAI, Gemini, or any OpenAI-compatible
endpoint** with your own key (stored only on your machine).

## Headless / scripting

Run analyses from a project file, reproducibly (seeded Monte Carlo):

```bash
node bin/geocalc-run.js myproject.gcp --mc 2000 42
```

## Download

Prebuilt apps for macOS and Windows are on the
[Releases](../../releases) page (`.dmg`/`.zip` for macOS, installer/portable
`.exe` for Windows). The apps are not code-signed, so the first launch may need
right-click → Open (macOS) or "Run anyway" (Windows).

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
