/* Headless solver sanity tests (FR-ARC-006).
 * The solver files are browser IIFEs that attach to `window`; we run them in a
 * vm context whose global IS `window`, so cross-references (e.g. LinAlg) resolve
 * exactly as they do in the browser. These are plausibility checks, NOT the
 * benchmark validation required before any method may be called "verified".
 */
const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function loadSolvers() {
  const sandbox = {};
  vm.createContext(sandbox);
  sandbox.window = sandbox; // window === global, as in a browser
  for (const f of ["linalg.js", "slope.js", "seep.js", "sigma.js"]) {
    const code = fs.readFileSync(path.join(__dirname, "..", "js", f), "utf8");
    vm.runInContext(code, sandbox, { filename: f });
  }
  return sandbox;
}
const G = loadSolvers();

test("slope: finds a plausible critical factor of safety", () => {
  const out = G.Slope.analyze({ H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, method: "bishop", nslices: 30, grid: 12 });
  assert.ok(out.best, "a critical circle should be found");
  assert.ok(out.best.fos > 0.5 && out.best.fos < 5, "FoS should be in a plausible range, got " + out.best.fos);
});
test("slope: lower cohesion lowers the factor of safety", () => {
  const base = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, phi: 25, ru: 0.25, method: "bishop", nslices: 30, grid: 12 };
  const hi = G.Slope.analyze({ ...base, c: 20 }).best.fos;
  const lo = G.Slope.analyze({ ...base, c: 2 }).best.fos;
  assert.ok(lo < hi, `expected lower c -> lower FoS (c=2:${lo} vs c=20:${hi})`);
});
test("slope: Spencer satisfies force and moment equilibrium (|Fm−Ff| small)", () => {
  const p = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, nslices: 40 };
  const sp = G.Slope.spencerForCircle(p, 24, 17, 17, 40);
  assert.ok(sp, "Spencer should converge on this circle");
  assert.ok(sp.residual < 5e-3, "force & moment factors should coincide, residual=" + sp.residual);
});
test("slope: Spencer moment factor at λ=0 equals Bishop (circular surface)", () => {
  const p = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, nslices: 40 };
  const fm0 = G.Slope.spencerForCircle(p, 24, 17, 17, 40).curve.find(c => c.lambda === 0).fm;
  const bis = G.Slope.foSForCircle(p, 24, 17, 17, 40).bishop;
  assert.ok(Math.abs(fm0 - bis) < 1e-4, `Spencer Fm(0)=${fm0} vs Bishop=${bis}`);
});
test("slope: entry-and-exit search matches the grid-search critical FoS", () => {
  const p = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, method: "bishop", nslices: 30, grid: 16 };
  const grid = G.Slope.analyze(p).best.fos;
  const ee = G.Slope.analyze({ ...p, search: "entryexit", entry: { x0: 2, x1: 9, n: 6 }, exit: { x0: 22, x1: 36, n: 6 }, nR: 12 }).best.fos;
  assert.ok(Math.abs(ee - grid) / grid < 0.03, `entry/exit=${ee} vs grid=${grid}`);
});
test("slope: a flat piezometric line reproduces the water-table pore pressures", () => {
  const base = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, nslices: 40 };
  const fWT = G.Slope.foSForCircle({ ...base, porePressureMode: "watertable", wt: 5 }, 24, 17, 17, 40).bishop;
  const fPZ = G.Slope.foSForCircle({ ...base, porePressureMode: "piezometric", piezo: [{ x: -10, y: 5 }, { x: 60, y: 5 }] }, 24, 17, 17, 40).bishop;
  assert.strictEqual(fWT, fPZ);
});
test("seep: steady flow is positive and bounded", () => {
  const s = G.Seep.solve({ W: 40, D: 20, nx: 60, hu: 16, hd: 4, k: 1, wall_on: true, wall_x: 20, wall_d: 12 });
  assert.ok(s.q > 0 && isFinite(s.q), "flow should be positive and finite");
  assert.ok(s.converged, "solver should converge");
});
test("sigma: settles downward under load", () => {
  const m = G.Sigma.run({ W: 20, H: 10, nx: 14, E: 30, nu: 0.3, gamma: 18, q: 50, qw: 6, field: "uy" });
  assert.ok(m.maxSettle > 0 && isFinite(m.maxSettle), "max settlement should be positive and finite");
});
