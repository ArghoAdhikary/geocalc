# GeoCalc

A small desktop app for **geotechnical analysis**, with a built-in AI chat
assistant. Three modules:

- **Slope stability** — limit equilibrium, method of slices (Fellenius &
  Bishop simplified), circular slip surface with a grid search for the critical
  factor of safety.
- **Seepage** — 2D steady-state confined flow, finite-difference Laplace solver,
  optional impermeable cutoff wall, head field and flow rate.
- **Stress–deformation** — 2D plane-strain linear-elastic FEM (constant-strain
  triangles), self-weight and surcharge, settlement and stresses.

## AI assistant

A chat panel drives the app in plain language ("set slope angle to 40 and run").
It works offline with a built-in interpreter, and can use a provider of your
choice for full natural-language understanding:

- Anthropic Claude, OpenAI (ChatGPT), Google Gemini, or any OpenAI-compatible
  endpoint (including a local LLM).

Your API key is stored only on your machine and sent directly to the provider
you choose.

## Download

Prebuilt apps for macOS and Windows are on the
[Releases](../../releases) page.

- **macOS**: open the `.dmg`, drag GeoCalc to Applications. The app is not
  code-signed, so the first time you may need to right-click → Open.
- **Windows**: run the installer (`.exe`), or use the portable build.

## Build from source

Requires [Node.js](https://nodejs.org) 20+.

```bash
npm install
npm start          # run in a dev window
npm run build      # package for the current OS into dist/
```

## Disclaimer

GeoCalc is an independent, open-source learning tool. It is **not** affiliated
with, endorsed by, or derived from any commercial geotechnical product. Its
solvers are simplified and intended for learning and preliminary checks — always
verify results against established methods before any real design decision.

## License

MIT — see [LICENSE](LICENSE).
