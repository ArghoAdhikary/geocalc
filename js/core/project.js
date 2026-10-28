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

  const SCHEMA_VERSION = 2; // v2 adds the shared geometry model (Phase H)
  const APP = "GeoCalc Pro";

  function uid(prefix) {
    return prefix + "_" + Math.random().toString(36).slice(2, 9);
  }

  // Full material record (Phase I). All fields beyond id/name are optional and
  // defaulted by normalizeMaterial, so older project files upgrade softly.
  const MATERIAL_DEFAULTS = {
    classification: "", color: "#c9b88a", description: "",
    gamma: 18, gammaSat: 19,          // bulk / saturated unit weight (kN/m³)
    c: 0, phi: 30,                    // effective (drained) strength: c′, φ′
    cu: 0,                            // undrained shear strength (kPa)
    drainage: "drained",             // "drained" | "undrained"
    k: 1.0,                           // permeability (m/day)
    E: 30, nu: 0.30,                  // Young's modulus (MPa), Poisson's ratio
    source: "", testMethod: "", date: "", uncertainty: "", applicability: "", approvedBy: "",
    illustrative: true                // seeded example, not site-verified
  };
  function normalizeMaterial(m) { return Object.assign({}, MATERIAL_DEFAULTS, m || {}); }

  function defaultMaterials() {
    return [
      { id: "mat_fill", name: "Fill",       classification: "Compacted fill",  color: "#d9c38a", gamma: 18, gammaSat: 19.5, c: 10, phi: 25, cu: 0,  drainage: "drained",   E: 30, nu: 0.30, k: 1.0,   illustrative: true },
      { id: "mat_clay", name: "Stiff clay", classification: "CL/CH clay",      color: "#aec9ec", gamma: 19, gammaSat: 19.5, c: 25, phi: 22, cu: 75, drainage: "undrained", E: 45, nu: 0.35, k: 0.001, illustrative: true },
      { id: "mat_sand", name: "Dense sand", classification: "SW/SP sand",      color: "#e7cf8a", gamma: 20, gammaSat: 21.0, c: 0,  phi: 36, cu: 0,  drainage: "drained",   E: 60, nu: 0.28, k: 5.0,   illustrative: true }
    ].map(normalizeMaterial);
  }

  // Physical-range advisories (do not silently change user input; just flag).
  const MATERIAL_RANGES = {
    gamma: [10, 24], gammaSat: [12, 24], c: [0, 200], phi: [0, 50], cu: [0, 500],
    k: [1e-8, 1e4], E: [0.1, 2000], nu: [0, 0.499]
  };
  function materialWarnings(m) {
    const w = [];
    for (const f in MATERIAL_RANGES) {
      const [lo, hi] = MATERIAL_RANGES[f]; const v = +m[f];
      if (m[f] != null && m[f] !== "" && (v < lo || v > hi)) w.push(`${f} = ${v} is outside the typical range ${lo}–${hi}`);
    }
    if (m.gammaSat && m.gamma && +m.gammaSat < +m.gamma) w.push("saturated unit weight is below the bulk unit weight");
    return w;
  }

  // The analysis parameter blocks mirror the solver inputs; each references a
  // material from the library where a single-material analysis is used.
  function defaultAnalyses() {
    return {
      slope: { materialId: "mat_fill", H: 10, beta: 34, crest: 12, toe: 14,
               gamma: 18, c: 10, phi: 25,
               ru: 0.25, method: "bishop", search: "grid", nslices: 30, grid: 14,
               porePressureMode: "ru", wt: 4,
               piezoText: "0, 9\n20, 7\n40, 7",
               e0: 2, e1: 9, x0: 24, x1: 36, een: 6, enr: 12,
               gammaSat: 20.5, wtHigh: 9, wtLow: 0, ddSteps: 12,
               par: "s_phi", parFrom: 20, parTo: 40, parSteps: 10 },
      seep:  { W: 40, D: 20, nx: 80, hu: 16, hd: 4, k: 1.0,
               wall_on: true, wall_x: 20, wall_d: 12 },
      sigma: { materialId: "mat_fill", W: 20, H: 10, nx: 18,
               q: 50, qw: 6, field: "uy" },
      consolidation: { H: 4, cv: 1, u0: 100, drainage: "double", tEnd: 2, nz: 100 },
      dynamics: { vs: 200, H: 20, zeta: 0.05 },
      thermal: { L: 1, alpha: 1, Ti: 100, Ts: 0, tEnd: 0.02, n: 100 },
      flow3d: { W: 40, D: 20, T: 20, nx: 24, hu: 16, hd: 4, k: 1.0 },
      prob: { cStd: 3, phiStd: 3, N: 2000, seed: 1 }
    };
  }

  function defaultMeta() {
    return { site: "", author: "", checker: "", designSituation: "", jurisdiction: "Australia", notes: "" };
  }

  // Candidate standards families to ASSESS — not assumed universal requirements.
  // Seeded with status "verification-required" and NO invented clause numbers,
  // editions or factors; the engineer verifies edition, scope and applicability.
  function defaultStandards() {
    const s = (title, identifier, applicableFeature) => ({
      id: uid("std"), title, identifier, edition: "", amendments: "",
      applicableFeature, link: "", lastVerified: "", status: "verification-required"
    });
    return [
      s("Geotechnical site investigations", "AS 1726", "Site investigation, soil description"),
      s("Methods of testing soils for engineering purposes", "AS 1289 (series)", "Laboratory/field soil parameters"),
      s("Guidelines on earthworks for commercial and residential developments", "AS 3798", "Earthworks, compacted fill"),
      s("Earth-retaining structures", "AS 4678", "Retaining walls, reinforced soil")
    ];
  }

  function newProject(name) {
    const now = new Date().toISOString();
    return {
      schemaVersion: SCHEMA_VERSION,
      app: APP,
      appVersion: (typeof window !== "undefined" && window.GC_VERSION) || "13.0.0",
      name: name || "Untitled project",
      created: now,
      modified: now,
      revision: 1,
      settings: {
        units: { length: "m", unitWeight: "kN/m3", stress: "kPa", permeability: "m/day", angle: "deg" }
      },
      meta: defaultMeta(),              // editable project metadata (Phase J)
      materials: defaultMaterials(),
      analyses: defaultAnalyses(),
      geometry: { regions: [] },        // shared 2D geometry model (Phase H)
      standards: defaultStandards(),    // standards register (Phase J)
      criteria: []                      // user-entered design criteria (Phase J)
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
    // Each forward migration must be covered by a round-trip test.
    if (obj.schemaVersion > SCHEMA_VERSION)
      throw new Error(`Project schema v${obj.schemaVersion} is newer than this app supports (v${SCHEMA_VERSION}). Update GeoCalc Pro to open it.`);
    // v1 -> v2: introduce the shared geometry model (older files simply had none).
    if (obj.schemaVersion < 2) {
      if (!obj.geometry || !Array.isArray(obj.geometry.regions)) obj.geometry = { regions: [] };
    }
    obj.schemaVersion = SCHEMA_VERSION;
    return obj;
  }

  function deserialize(text) {
    let obj;
    try { obj = JSON.parse(text); }
    catch (e) { throw new Error("Not a valid GeoCalc Pro project file (JSON parse failed)."); }
    if (!obj || obj.app !== APP || typeof obj.schemaVersion !== "number")
      throw new Error("Not a recognised GeoCalc Pro project file.");
    obj = migrate(obj);
    if (!obj.geometry || !Array.isArray(obj.geometry.regions)) obj.geometry = { regions: [] };
    if (Array.isArray(obj.materials)) obj.materials = obj.materials.map(normalizeMaterial);
    if (!obj.meta) obj.meta = defaultMeta();
    if (!Array.isArray(obj.standards)) obj.standards = [];
    if (!Array.isArray(obj.criteria)) obj.criteria = [];
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
    serialize, deserialize, migrate, validate, stableStringify,
    MATERIAL_DEFAULTS, normalizeMaterial, materialWarnings, defaultMaterials,
    defaultMeta, defaultStandards
  };
});
