/* Phase B numerical verification — runs the analytical benchmark evidence
 * matrix. This is the release gate: a method is "Verified" in the registry
 * only if its benchmarks pass here (FR-VAL-001..008, §20.2).
 */
const test = require("node:test");
const assert = require("node:assert");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");

function loadContext() {
  const sandbox = {};
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  const files = [
    "js/linalg.js", "js/slope.js", "js/seep.js", "js/feflow.js",
    "js/consolidation.js", "js/unsat.js", "js/geostatic.js",
    "js/dynamics.js", "js/thermal.js", "js/mesh3d.js", "js/probabilistic.js",
    "js/core/benchmarks.js"
  ];
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "..", f), "utf8"), sandbox, { filename: f });
  }
  return sandbox;
}
const G = loadContext();
const results = G.Benchmarks.run();

for (const r of results) {
  test(`benchmark: ${r.id} — ${r.title}`, () => {
    assert.ok(!r.error_message, "benchmark threw: " + r.error_message);
    assert.ok(
      r.pass,
      `${r.metric} = ${r.error} exceeds tol ${r.tol} (computed=${r.computed}, reference=${r.reference})`
    );
  });
}

test("verified methods match expectation", () => {
  const verified = new Set(G.Benchmarks.verifiedMethods());
  for (const m of ["slope.fellenius", "slope.bishop", "seep.steady", "seep.transient", "feflow.steady",
                   "consolidation.terzaghi1d", "unsat.vangenuchten", "geostatic.init", "transfer.seep2slope",
                   "dynamic.sdof", "dynamic.site1d", "thermal.steady", "thermal.transient",
                   "flow3d.steady", "probabilistic.montecarlo"]) {
    assert.ok(verified.has(m), `${m} should be benchmark-verified`);
  }
});
