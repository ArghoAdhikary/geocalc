/* unsat.js — unsaturated soil-water characteristic functions (Phase C).
 *
 * van Genuchten (1980) water-retention and Mualem relative hydraulic
 * conductivity, the retention-function first step for unsaturated flow
 * (FR-SEP-003). Suction psi is a positive matric suction (head, m); psi <= 0
 * means saturated.
 *
 *   Se(psi) = [1 + (alpha*psi)^n]^(-m),  m = 1 - 1/n
 *   theta   = theta_r + (theta_s - theta_r) * Se
 *   kr      = Se^L * [1 - (1 - Se^(1/m))^m]^2   (Mualem, L = 0.5)
 *
 * Dual-mode (browser global window.Unsat + CommonJS / vm).
 */
(function (global) {
  "use strict";

  function effSaturation(psi, vg) {
    if (psi <= 0) return 1;
    const m = 1 - 1 / vg.n;
    return Math.pow(1 + Math.pow(vg.alpha * psi, vg.n), -m);
  }
  function waterContent(psi, vg) {
    return vg.theta_r + (vg.theta_s - vg.theta_r) * effSaturation(psi, vg);
  }
  function relConductivity(psi, vg) {
    const Se = effSaturation(psi, vg);
    if (Se >= 1) return 1;
    if (Se <= 0) return 0;
    const m = 1 - 1 / vg.n;
    const inner = 1 - Math.pow(1 - Math.pow(Se, 1 / m), m);
    const L = (vg.L != null) ? vg.L : 0.5;
    return Math.pow(Se, L) * inner * inner;
  }

  // A common silt loam parameter set, for defaults and benchmarking.
  function defaultVG() { return { theta_r: 0.067, theta_s: 0.45, alpha: 2.0, n: 1.41, L: 0.5 }; }

  global.Unsat = { effSaturation, waterContent, relConductivity, defaultVG };
})(typeof window !== "undefined" ? window : globalThis);
