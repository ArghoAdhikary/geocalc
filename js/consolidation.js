/* consolidation.js — 1D Terzaghi consolidation (Phase C).
 *
 * Solves the 1D consolidation (diffusion) of excess pore pressure
 *     d(ue)/dt = cv * d2(ue)/dz2
 * with uniform initial excess pressure u0 and drained boundaries, by implicit
 * backward-Euler time stepping. The average degree of consolidation U(t) is
 * compared against Terzaghi's analytical series — the consolidation benchmark
 * family (spec §18.2).
 *
 * Drainage: "double" (both faces drained, drainage path H/2) or "single"
 * (top drained, bottom no-flow, drainage path H).
 *
 * Dual-mode (browser global window.Consolidation + CommonJS / vm).
 */
(function (global) {
  "use strict";

  // Terzaghi average degree of consolidation as a function of time factor Tv.
  function terzaghiU(Tv) {
    if (Tv <= 0) return 0;
    let s = 0;
    for (let m = 0; m < 200; m++) {
      const M = (2 * m + 1) * Math.PI / 2;
      s += (2 / (M * M)) * Math.exp(-M * M * Tv);
    }
    return 1 - s;
  }

  // Numerical solve. Returns average degree of consolidation at tEnd plus the
  // excess pore-pressure profile, and the time factor reached.
  function solve1D(p) {
    const cv = p.cv > 0 ? p.cv : 1;       // coefficient of consolidation (m^2/time)
    const H = p.H > 0 ? p.H : 1;          // layer thickness
    const u0 = (p.u0 != null) ? p.u0 : 100;
    const nz = Math.max(10, Math.min(500, p.nz | 0 || 100));
    const dz = H / nz;
    const N = nz + 1;
    const single = p.drainage === "single";
    const Hdr = single ? H : H / 2;
    const tEnd = p.tEnd > 0 ? p.tEnd : 0.5 * Hdr * Hdr / cv;
    const dt = p.dt > 0 ? p.dt : tEnd / 200;

    const ue = new Float64Array(N).fill(u0);
    // Boundary conditions: drained faces have ue = 0.
    const fixed = new Uint8Array(N);
    ue[0] = 0; fixed[0] = 1;                       // top always drained
    if (!single) { ue[nz] = 0; fixed[nz] = 1; }    // bottom drained (double)

    const r = cv / (dz * dz);
    const sdt = 1 / dt;
    const uOld = new Float64Array(N);
    const nSteps = Math.max(1, Math.round(tEnd / dt));
    for (let step = 0; step < nSteps; step++) {
      uOld.set(ue);
      for (let it = 0; it < 2000; it++) {
        let err = 0;
        for (let i = 0; i < N; i++) {
          if (fixed[i]) continue;
          const aL = i > 0 ? r : 0;
          const aR = i < nz ? r : 0;         // at i=nz with single drainage: no-flow -> aR=0
          const sumN = (aL ? aL * ue[i - 1] : 0) + (aR ? aR * ue[i + 1] : 0);
          const diag = sdt + aL + aR;
          const v = (sdt * uOld[i] + sumN) / diag;
          err = Math.max(err, Math.abs(v - ue[i]));
          ue[i] = v;
        }
        if (err < 1e-10) break;
      }
    }

    // Average degree of consolidation U = 1 - (mean ue)/u0 (trapezoidal).
    let integral = 0;
    for (let i = 0; i < N; i++) {
      const w = (i === 0 || i === nz) ? 0.5 : 1;
      integral += ue[i] * w * dz;
    }
    const meanUe = integral / H;
    const U = 1 - meanUe / u0;
    const Tv = cv * tEnd / (Hdr * Hdr);
    return { U, Tv, ue, nz, dz, H, cv, tEnd, Hdr, single, nSteps };
  }

  global.Consolidation = { terzaghiU, solve1D };
})(typeof window !== "undefined" ? window : globalThis);
