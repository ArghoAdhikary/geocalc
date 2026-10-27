/* project.js — GeoCalc Pro project model and persistence contract.
 *
 * Implements FR-ARC-004/005 and the data-model rules:
 *  - A versioned, structured manifest (schemaVersion + project revision).
 *  - Deterministic serialization (stable key order) for atomic writes and
 *    reproducible round trips.
 *  - A migration hook; unknown future versions fail visibly.
 *
 * A project holds settings (display units), a materials library, and the
 * parameters for each analysis. Geometry in Phase A is parametric; a full
 * interactive geometry editor is a later increment.
 *
 * Dual-mode (browser global window.Project + CommonJS).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Project = api;
})(this, function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const APP = "GeoCalc Pro";

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9);
  }

  function defaultMaterials() {
    return [
      { id: "mat_fill",  name: "Fill",          gamma: 18, c: 10, phi: 25, E: 30, nu: 0.30, k: 1.0 },
      { id: "mat_clay",  name: "Stiff clay",    gamma: 19, c: 25, phi: 22, E: 45, nu: 0.35, k: 0.001 },
      { id: "mat_sand",  name: "Dense sand",    gamma: 20, c: 0,  phi: 36, E: 60, nu: 0.28, k: 5.0 }
    ];
  }

  // The analysis parameter blocks mirror the solver inputs; each references a
  // material from the library where a single-material analysis is used.
  function defaultAnalyses() {
    return {
      slope: { materialId: "mat_fill", H: 10, beta: 34, crest: 12, toe: 14,
               ru: 0.25, method: "bishop", nslices: 30, grid: 14,
               porePressureMode: "ru", wt: 4 },
      seep:  { W: 40, D: 20, nx: 80, hu: 16, hd: 4, k: 1.0,
               wall_on: true, wall_x: 20, wall_d: 12 },
      sigma: { materialId: "mat_fill", W: 20, H: 10, nx: 18,
               q: 50, qw: 6, field: "uy" },
      consolidation: { H: 4, cv: 1, u0: 100, drainage: "double", tEnd: 2, nz: 100 }
    };
  }

  function newProject(name) {
    const now = new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      app: APP,
      appVersion: (typeof window !== "undefined" && window.GC_VERSION) || "4.0.0",
      name: name || "Untitled project",
      created: now,
      modified: now,
      revision: 1,
      settings: {
        units: { length: "m", unitWeight: "kN/m3", stress: "kPa", permeability: "m/day", angle: "deg" }
      },
      materials: defaultMaterials(),
      analyses: defaultAnalyses()
    };
  }

  function bumpRevision(project) {
    project.revision = (project.revision | 0) + 1;
    project.modified = new Date().toISOString();
    return project;
  }

  function materialById(project, id) {
    return (project.materials || []).find(m => m.id === id) || null;
  }

  // Deterministic JSON (stable key order) for atomic writes / round trips.
  function stableStringify(value) {
    return JSON.stringify(sortKeys(value), null, 2);
  }
  function sortKeys(v) {
    if (Array.isArray(v)) return v.map(sortKeys);
    if (v && typeof v === "object") {
      const out = {};
      for (const k of Object.keys(v).sort()) out[k] = sortKeys(v[k]);
      return out;
    }
    return v;
  }

  function serialize(project) { return stableStringify(project); }

  function migrate(obj) {
    // Future schema upgrades go here; each must be covered by a round-trip test.
    if (obj.schemaVersion === SCHEMA_VERSION) return obj;
    if (obj.schemaVersion < SCHEMA_VERSION) {
      // No prior versions yet; placeholder for forward migrations.
      obj.schemaVersion = SCHEMA_VERSION;
      return obj;
    }
    throw new Error(`Project schema v${obj.schemaVersion} is newer than this app supports (v${SCHEMA_VERSION}). Update GeoCalc Pro to open it.`);
  }

  function deserialize(text) {
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) { throw new Error("Not a valid GeoCalc Pro project file (JSON parse failed)."); }
    if (!obj || obj.app !== APP || typeof obj.schemaVersion !== "number")
      throw new Error("Not a recognised GeoCalc Pro project file.");
    obj = migrate(obj);
    validate(obj);
    return obj;
  }

  function validate(project) {
    if (!project.analyses || !project.analyses.slope || !project.analyses.seep || !project.analyses.sigma)
      throw new Error("Project is missing required analyses.");
    if (!Array.isArray(project.materials))
      throw new Error("Project is missing its materials library.");
    return true;
  }

  return {
    SCHEMA_VERSION, APP, uid,
    newProject, bumpRevision, materialById,
    serialize, deserialize, migrate, validate, stableStringify
  };
});
