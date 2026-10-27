/* geostatic.js — geostatic (in-situ) stress initialization (Phase C).
 *
 * Computes total and effective vertical stress and K0 lateral stress down a
 * layered soil column, with pore pressure from a horizontal water table
 * (FR-SIG-003). This is the documented gravity/geostatic initial state used
 * before construction stages.
 *
 *   sigma_v(z)  = sum of gamma_i * thickness above z
 *   u(z)        = gamma_w * (z - z_wt)   for z below the water table, else 0
 *   sigma_v'    = sigma_v - u
 *   sigma_h'    = K0 * sigma_v'
 *   sigma_h     = sigma_h' + u
 *
 * z is depth below ground surface (positive down). Dual-mode.
 */
(function (global) {
  "use strict";

  const GAMMA_W = 9.81; // kN/m^3

  // layers: [{gamma, thickness, K0}], top layer first. depth: query depth(s).
  function profile(layers, waterTableDepth, depths) {
    const out = [];
    for (const z of depths) {
      let sv = 0, acc = 0;
      for (const L of layers) {
        const top = acc, bot = acc + L.thickness;
        if (z <= top) break;
        const dz = Math.min(z, bot) - top;
        sv += L.gamma * dz;
        acc = bot;
        if (z <= bot) break;
      }
      const u = (waterTableDepth != null && z > waterTableDepth) ? GAMMA_W * (z - waterTableDepth) : 0;
      const K0 = currentK0(layers, z);
      const svEff = sv - u;
      const shEff = K0 * svEff;
      out.push({ z, sigma_v: sv, u, sigma_v_eff: svEff, sigma_h_eff: shEff, sigma_h: shEff + u, K0 });
    }
    return out;
  }

  function currentK0(layers, z) {
    let acc = 0;
    for (const L of layers) { acc += L.thickness; if (z <= acc) return (L.K0 != null) ? L.K0 : 0.5; }
    const last = layers[layers.length - 1];
    return (last && last.K0 != null) ? last.K0 : 0.5;
  }

  global.Geostatic = { GAMMA_W, profile };
})(typeof window !== "undefined" ? window : globalThis);
