/* capabilities.js — capability registry with maturity states.
 *
 * Implements FR-SCP-001..004:
 *  - A registry of modules/methods with dimension, maturity state, public
 *    references, and notes.
 *  - Maturity states are an ordered scale; the UI must enable controls only
 *    when the implementation exists, show the state when a method is selected,
 *    and carry it into every exported report.
 *  - No capability here is claimed "Verified" or "Released"; the current
 *    solvers are "Implemented (unverified)" until a benchmark matrix exists
 *    (that is Phase B per the specification roadmap).
 *
 * Dual-mode (browser global window.Capabilities + CommonJS).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Capabilities = api;
})(this, function () {
  "use strict";

  // Ordered maturity scale (FR-SCP-002).
  const MATURITY = {
    conceptual:  { rank: 0, label: "Conceptual",            runnable: false, color: "#8a93a3" },
    mockup:      { rank: 1, label: "Mockup",                runnable: false, color: "#8a93a3" },
    prototype:   { rank: 2, label: "Prototype",             runnable: true,  color: "#c98a12" },
    implemented: { rank: 3, label: "Implemented (unverified)", runnable: true, color: "#c98a12" },
    verified:    { rank: 4, label: "Verified (benchmarks)", runnable: true,  color: "#1a9c62" },
    released:    { rank: 5, label: "Released",              runnable: true,  color: "#1a9c62" }
  };

  // The registry. `phase` and `priority` follow the specification matrix.
  const REGISTRY = [
    {
      id: "slope.bishop", module: "slope", method: "Bishop's simplified",
      dimension: "2D", maturity: "implemented", phase: "B", priority: "P0",
      references: ["Bishop (1955), Géotechnique 5(1)"],
      notes: "Circular slip surface, method of slices. Not yet benchmark-verified."
    },
    {
      id: "slope.fellenius", module: "slope", method: "Fellenius (ordinary)",
      dimension: "2D", maturity: "implemented", phase: "B", priority: "P0",
      references: ["Fellenius (1936)"],
      notes: "Circular slip surface, ordinary method of slices."
    },
    {
      id: "slope.morgenstern", module: "slope", method: "Morgenstern–Price",
      dimension: "2D", maturity: "conceptual", phase: "C", priority: "P1",
      references: ["Morgenstern & Price (1965), Géotechnique 15(1)"],
      notes: "General limit equilibrium with interslice forces. Planned."
    },
    {
      id: "seep.steady", module: "seep", method: "Saturated steady-state (FD)",
      dimension: "2D", maturity: "implemented", phase: "B", priority: "P0",
      references: ["Laplace equation; finite differences"],
      notes: "Homogeneous isotropic confined flow with cutoff. Not benchmark-verified."
    },
    {
      id: "seep.transient", module: "seep", method: "Saturated transient",
      dimension: "2D", maturity: "conceptual", phase: "B", priority: "P0",
      references: ["Diffusion form of the flow equation"],
      notes: "Planned."
    },
    {
      id: "seep.unsaturated", module: "seep", method: "Unsaturated flow",
      dimension: "2D", maturity: "conceptual", phase: "C", priority: "P0",
      references: ["Richards equation; van Genuchten / Fredlund functions"],
      notes: "Planned."
    },
    {
      id: "sigma.elastic", module: "sigma", method: "Linear-elastic (plane strain)",
      dimension: "2D", maturity: "implemented", phase: "C", priority: "P0",
      references: ["Plane-strain FEM, constant-strain triangles"],
      notes: "Self-weight + surcharge. Not benchmark-verified."
    },
    {
      id: "sigma.staged", module: "sigma", method: "Staged construction / consolidation",
      dimension: "2D", maturity: "conceptual", phase: "C", priority: "P0",
      references: ["Biot consolidation"],
      notes: "Planned."
    },
    {
      id: "dynamic.response", module: "dynamic", method: "Equivalent-linear / dynamic response",
      dimension: "2D", maturity: "conceptual", phase: "D", priority: "P0",
      references: ["Equivalent-linear site response"],
      notes: "Planned."
    },
    {
      id: "thermal.conduction", module: "thermal", method: "Heat transport",
      dimension: "2D", maturity: "conceptual", phase: "D", priority: "P1",
      references: ["Conduction/advection heat equation"],
      notes: "Planned."
    },
    {
      id: "model3d", module: "model3d", method: "Three-dimensional modeling",
      dimension: "3D", maturity: "conceptual", phase: "E", priority: "P0",
      references: [],
      notes: "Planned; 3D release status is not inherited from 2D."
    }
  ];

  function byId(id) { return REGISTRY.find(c => c.id === id) || null; }
  function forModule(mod) { return REGISTRY.filter(c => c.module === mod); }
  function maturityInfo(key) { return MATURITY[key] || MATURITY.conceptual; }
  function isRunnable(id) { const c = byId(id); return !!c && maturityInfo(c.maturity).runnable; }

  // A short disclaimer suitable for results panels and report headers.
  function resultDisclaimer(id) {
    const c = byId(id);
    if (!c) return "";
    const m = maturityInfo(c.maturity);
    if (m.rank >= MATURITY.released.rank) return "";
    if (m.rank >= MATURITY.verified.rank) return `Verified for stated benchmarks only — ${c.method}.`;
    return `Demonstration result — method "${c.method}" is ${m.label}. Not verified for design use.`;
  }

  return { MATURITY, REGISTRY, byId, forModule, maturityInfo, isRunnable, resultDisclaimer };
});
