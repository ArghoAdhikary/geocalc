/* thermal.js — heat conduction (Phase D, THM).
 *
 * Steady and transient 1D conduction:
 *   steady:     d2T/dx2 = 0  with fixed end temperatures (linear profile),
 *               flux q = k * (T0 - TL)/L.
 *   transient:  dT/dt = alpha * d2T/dx2  (alpha = thermal diffusivity),
 *               implicit backward Euler; slab initially Ti, both faces Ts.
 *
 * Verified against the analytical linear profile/flux and the 1D transient
 * series solution (thermal benchmark family, spec §18.2). Dual-mode.
 */
(function (global) {
  "use strict";

  function steady1D(k, L, T0, TL, n) {
    const N = (n | 0) || 50;
    const T = new Float64Array(N + 1);
    for (let i = 0; i <= N; i++) T[i] = T0 + (TL - T0) * i / N;
    const flux = k * (T0 - TL) / L; // positive from hot to cold
    return { T, flux, L, n: N };
  }

  // Analytical transient slab: both faces held at Ts, uniform initial Ti.
  // (T - Ts)/(Ti - Ts) = sum 4/((2m+1)pi) sin((2m+1)pi x/L) exp(-((2m+1)pi/L)^2 alpha t)
  function transientSeries(x, t, L, Ti, Ts, alpha) {
    let s = 0;
    for (let m = 0; m < 80; m++) {
      const kk = (2 * m + 1) * Math.PI / L;
      s += (4 / ((2 * m + 1) * Math.PI)) * Math.sin(kk * x) * Math.exp(-kk * kk * alpha * t);
    }
    return Ts + (Ti - Ts) * s;
  }

  // Numerical transient slab, implicit backward Euler.
  function transient1D(p) {
    const alpha = p.alpha > 0 ? p.alpha : 1;
    const L = p.L > 0 ? p.L : 1;
    const Ti = (p.Ti != null) ? p.Ti : 100;
    const Ts = (p.Ts != null) ? p.Ts : 0;
    const n = Math.max(10, Math.min(2000, p.n | 0 || 100));
    const dz = L / n, N = n + 1;
    const tEnd = p.tEnd > 0 ? p.tEnd : 0.1 * L * L / alpha;
    const dt = p.dt > 0 ? p.dt : tEnd / 200;

    const T = new Float64Array(N).fill(Ti);
    T[0] = Ts; T[n] = Ts; // both faces fixed
    const r = alpha / (dz * dz), sdt = 1 / dt;
    const Told = new Float64Array(N);
    const nSteps = Math.max(1, Math.round(tEnd / dt));
    for (let step = 0; step < nSteps; step++) {
      Told.set(T);
      for (let it = 0; it < 2000; it++) {
        let err = 0;
        for (let i = 1; i < n; i++) {
          const v = (sdt * Told[i] + r * (T[i - 1] + T[i + 1])) / (sdt + 2 * r);
          err = Math.max(err, Math.abs(v - T[i]));
          T[i] = v;
        }
        if (err < 1e-10) break;
      }
    }
    return { T, n, dz, L, alpha, tEnd, dt, nSteps, Ti, Ts, tempAt: i => T[i] };
  }

  global.Thermal = { steady1D, transient1D, transientSeries };
})(typeof window !== "undefined" ? window : globalThis);
