#!/usr/bin/env node
/* geocalc-run — headless batch/scripting runner (Phase F).
 *
 * Loads a GeoCalc Pro project (.gcp) and runs analyses headlessly, printing a
 * JSON result with provenance. Uses the same solver code as the app (loaded in
 * a vm context), satisfying the headless-path and reproducibility requirements
 * (FR-ARC-006, FR-VAL-009). Monte Carlo runs are seeded and reproducible.
 *
 *   node bin/geocalc-run.js <project.gcp> [--mc <N> <seed>]
 */
"use strict";
const vm = require("vm");
const fs = require("fs");
const path = require("path");
const Project = require("../js/core/project.js");

function loadContext() {
  const sandbox = {};
  vm.createContext(sandbox);
  sandbox.window = sandbox;
  const root = path.join(__dirname, "..");
  const files = [
    "js/linalg.js", "js/slope.js", "js/seep.js", "js/feflow.js",
    "js/consolidation.js", "js/unsat.js", "js/geostatic.js",
    "js/dynamics.js", "js/thermal.js", "js/mesh3d.js", "js/probabilistic.js"
  ];
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), sandbox, { filename: f });
  return sandbox;
}

function main() {
  const projPath = process.argv[2];
  if (!projPath) {
    console.error("usage: geocalc-run <project.gcp> [--mc <N> <seed>]");
    process.exit(1);
  }
  const proj = Project.deserialize(fs.readFileSync(projPath, "utf8"));
  const G = loadContext();

  const out = {
    app: "GeoCalc Pro", version: proj.appVersion || "",
    project: { name: proj.name, revision: proj.revision },
    generated: new Date().toISOString(),
    note: "Verified methods apply only within their stated envelope; independent review (AC-09) pending before release.",
    analyses: {}
  };

  const sp = proj.analyses.slope;
  const sres = G.Slope.analyze(sp);
  out.analyses.slope = sres.best
    ? { method: sp.method, fos: sres.best.fos, centre: [sres.best.xc, sres.best.yc], radius: sres.best.R }
    : { error: "no valid slip surface" };

  const seep = G.Seep.solve(proj.analyses.seep);
  out.analyses.seep = { q: seep.q, exitGradient: seep.exitGrad };

  const mc = process.argv.indexOf("--mc");
  if (mc > 0) {
    const N = parseInt(process.argv[mc + 1] || "500", 10);
    const seed = parseInt(process.argv[mc + 2] || "1", 10);
    const r = G.Probabilistic.monteCarloSlope(sp, { cMean: sp.c, cStd: sp.c * 0.2, phiMean: sp.phi, phiStd: sp.phi * 0.1 }, N, seed);
    out.analyses.slopeProbabilistic = r
      ? { samples: r.n, meanFoS: r.mean, stdFoS: r.std, probabilityOfFailure: r.pf, reliabilityIndex: r.beta, seed }
      : { error: "no base surface" };
  }

  console.log(JSON.stringify(out, null, 2));
}
main();
