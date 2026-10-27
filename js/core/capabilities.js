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
      dimension: "2D", maturity: "verified", phase: "B", priority: "P0",
      references: ["Bishop (1955), Géotechnique 5(1)"],
      evidence: ["benchmark:slope.bishop.discretization", "benchmark:slope.bishop.ge.fellenius"],
      envelope: "Homogeneous soil, single circular slip surface, pore pressure via rᵤ. No reinforcement/seismic/non-circular.",
      notes: "Circular slip surface, method of slices. Verified against analytical/convergence benchmarks within the stated envelope; independent review pending before release."
    },
    {
      id: "slope.fellenius", module: "slope", method: "Fellenius (ordinary)",
      dimension: "2D", maturity: "verified", phase: "B", priority: "P0",
      references: ["Fellenius (1936)"],
      evidence: ["benchmark:slope.fellenius.infinite", "benchmark:slope.fellenius.recompute"],
      envelope: "Homogeneous soil, circular/planar slip surface, pore pressure via rᵤ.",
      notes: "Ordinary method of slices. Verified against the analytical infinite-slope case and independent recomputation; independent review pending before release."
    },
    {
      id: "slope.morgenstern", module: "slope", method: "Morgenstern–Price",
      dimension: "2D", maturity: "conceptual", phase: "C", priority: "P1",
      references: ["Morgenstern & Price (1965), Géotechnique 15(1)"],
      notes: "General limit equilibrium with interslice forces. Planned."
    },
    {
      id: "seep.steady", module: "seep", method: "Saturated steady-state (FD)",
      dimension: "2D", maturity: "verified", phase: "B", priority: "P0",
      references: ["Laplace equation; finite differences"],
      evidence: ["benchmark:seep.steady.linear", "benchmark:seep.steady.balance"],
      envelope: "Homogeneous isotropic confined flow, rectangular domain, prescribed-head boundaries (balance ≤0.1%).",
      notes: "Verified against the 1D Darcy analytical field and global balance within the stated envelope; cutoff-wall and layered cases carry their own evidence before release."
    },
    {
      id: "seep.transient", module: "seep", method: "Saturated transient (implicit)",
      dimension: "2D", maturity: "verified", phase: "B", priority: "P0",
      references: ["Diffusion form of the flow equation; backward Euler"],
      evidence: ["benchmark:seep.transient.analytical", "benchmark:seep.transient.balance"],
      envelope: "1D saturated transient diffusion, Dirichlet + no-flow, uniform storativity (balance ≤0.5%).",
      notes: "Implicit (unconditionally stable) time stepping. Verified against the 1D analytical series solution and cumulative balance; 2D/layered cases pending their own benchmarks."
    },
    {
      id: "feflow.steady", module: "seep", method: "FE steady flow (triangular mesh)",
      dimension: "2D", maturity: "verified", phase: "B", priority: "P0",
      references: ["Galerkin finite elements, linear (CST) triangles"],
      evidence: ["benchmark:feflow.steady.linear", "benchmark:feflow.steady.balance"],
      envelope: "Homogeneous rectangular domain, prescribed-head boundaries; linear FE reproduces the analytical field exactly.",
      notes: "Finite-element meshing for flow. Verified against the analytical linear field and nodal reaction balance within the stated envelope."
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
      id: "sigma.staged", module: "sigma", method: "Staged construction",
      dimension: "2D", maturity: "conceptual", phase: "C", priority: "P0",
      references: ["Staged activation/deactivation; state transfer"],
      notes: "Planned (region/load staging and state transfer)."
    },
    {
      id: "consolidation.terzaghi1d", module: "sigma", method: "1D consolidation (Terzaghi)",
      dimension: "1D", maturity: "verified", phase: "C", priority: "P0",
      references: ["Terzaghi 1D consolidation theory"],
      evidence: ["benchmark:consolidation.terzaghi"],
      envelope: "1D consolidation, uniform cv, uniform initial excess pressure, single or double drainage.",
      notes: "Implicit diffusion of excess pore pressure; verified against the Terzaghi analytical degree-of-consolidation series."
    },
    {
      id: "geostatic.init", module: "sigma", method: "Geostatic stress initialization",
      dimension: "2D", maturity: "verified", phase: "C", priority: "P0",
      references: ["Geostatic σv = Σγz; K0 lateral earth pressure"],
      evidence: ["benchmark:geostatic.column"],
      envelope: "Horizontally layered column, horizontal water table; σv, u, σv′, σh′ = K0·σv′.",
      notes: "Documented gravity/geostatic initial state; verified against the analytical column."
    },
    {
      id: "unsat.vangenuchten", module: "seep", method: "van Genuchten / Mualem functions",
      dimension: "n/a", maturity: "verified", phase: "C", priority: "P0",
      references: ["van Genuchten (1980); Mualem (1976)"],
      evidence: ["benchmark:unsat.vangenuchten"],
      envelope: "Retention θ(ψ) and relative conductivity kr(ψ) functions (constitutive), not yet a coupled unsaturated flow run.",
      notes: "Unsaturated constitutive functions verified for endpoints, monotonicity and Mualem bounds. The unsaturated flow solver is a later increment."
    },
    {
      id: "transfer.seep2slope", module: "slope", method: "Seepage→stability pore-pressure transfer",
      dimension: "2D", maturity: "verified", phase: "C", priority: "P0",
      references: ["Phreatic/water-table pore pressure u = γw·depth below the water table"],
      evidence: ["benchmark:transfer.seep2slope"],
      envelope: "Hydrostatic pore pressure from a water-table surface applied to the slip base. Full seepage-field transfer with interpolation/coverage is a later increment.",
      notes: "Couples a phreatic surface into slope stability; verified against the hydrostatic pressure distribution."
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
    if (m.rank >= MATURITY.verified.rank)
      return `Verified against analytical benchmarks for the stated envelope — ${c.method}. ` +
             (c.envelope ? `Envelope: ${c.envelope} ` : "") +
             `Independent review (AC-09) pending before release.`;
    return `Demonstration result — method "${c.method}" is ${m.label}. Not verified for design use.`;
  }

  return { MATURITY, REGISTRY, byId, forModule, maturityInfo, isRunnable, resultDisclaimer };
});
