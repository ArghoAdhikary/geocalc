/* dynamics.js — linear dynamic response (Phase D, QUAKE).
 *
 * Single-degree-of-freedom (SDOF) response by Newmark-beta (average
 * acceleration, unconditionally stable, energy conserving for the undamped
 * case), analytical references for free vibration and harmonic steady state,
 * response-spectrum computation, and the 1D linear (viscoelastic) site-response
 * transfer function. These support the oscillator, signal, energy and
 * time-step regression family (FR-QAK-008) with analytical references.
 *
 * Dual-mode (browser global window.Dynamics + CommonJS / vm).
 */
(function (global) {
  "use strict";

  // Newmark-beta average-acceleration integration of  m x'' + c x' + k x = p(t).
  // p is an array sampled at dt; returns displacement/velocity/acceleration.
  function sdofNewmark(m, c, k, p, dt, x0, v0) {
    const n = p.length;
    const x = new Float64Array(n), v = new Float64Array(n), a = new Float64Array(n);
    x[0] = x0 || 0; v[0] = v0 || 0;
    a[0] = (p[0] - c * v[0] - k * x[0]) / m;
    const gamma = 0.5, beta = 0.25;
    const a1 = m / (beta * dt * dt) + c * gamma / (beta * dt);
    const a2 = m / (beta * dt) + c * (gamma / beta - 1);
    const a3 = m * (1 / (2 * beta) - 1) + c * dt * (gamma / (2 * beta) - 1);
    const kHat = k + a1;
    for (let i = 0; i < n - 1; i++) {
      const pHat = p[i + 1] + a1 * x[i] + a2 * v[i] + a3 * a[i];
      x[i + 1] = pHat / kHat;
      v[i + 1] = (gamma / (beta * dt)) * (x[i + 1] - x[i]) + (1 - gamma / beta) * v[i] + dt * (1 - gamma / (2 * beta)) * a[i];
      a[i + 1] = (1 / (beta * dt * dt)) * (x[i + 1] - x[i]) - (1 / (beta * dt)) * v[i] - (1 / (2 * beta) - 1) * a[i];
    }
    return { x, v, a };
  }

  // Analytical damped free vibration displacement at time t.
  function freeVibration(wn, zeta, x0, v0, t) {
    const wd = wn * Math.sqrt(1 - zeta * zeta);
    const A = x0, B = (v0 + zeta * wn * x0) / wd;
    return Math.exp(-zeta * wn * t) * (A * Math.cos(wd * t) + B * Math.sin(wd * t));
  }

  // Analytical steady-state amplitude of m x''+c x'+k x = p0 sin(w t).
  function harmonicAmplitude(wn, zeta, k, p0, w) {
    const r = w / wn;
    return (p0 / k) / Math.sqrt((1 - r * r) * (1 - r * r) + (2 * zeta * r) * (2 * zeta * r));
  }

  // Response spectrum: peak spectral acceleration Sa(T) for base accel ag(t).
  function responseSpectrum(ag, dt, periods, zeta) {
    const out = [];
    for (const T of periods) {
      const wn = 2 * Math.PI / T, m = 1, k = wn * wn, c = 2 * zeta * wn * m;
      const p = new Float64Array(ag.length);
      for (let i = 0; i < ag.length; i++) p[i] = -m * ag[i]; // base excitation
      const r = sdofNewmark(m, c, k, p, dt, 0, 0);
      let peak = 0; for (let i = 0; i < r.x.length; i++) peak = Math.max(peak, Math.abs(r.x[i]));
      out.push({ T, Sa: wn * wn * peak });
    }
    return out;
  }

  // 1D viscoelastic site amplification |F(f)| for a uniform layer (Vs, H) on a
  // rigid base; peaks at the fundamental frequency f1 = Vs/(4H).
  function siteAmplification(f, Vs, H, zeta) {
    const a = 2 * Math.PI * f * H / Vs;
    return 1 / Math.sqrt(Math.cos(a) * Math.cos(a) + (zeta * a) * (zeta * a));
  }
  function siteFundamental(Vs, H) { return Vs / (4 * H); }
  function sitePeakFrequency(Vs, H, zeta) {
    const f1 = siteFundamental(Vs, H);
    let best = 0, bestF = 0;
    for (let f = 0.02 * f1; f <= 2 * f1; f += 0.002 * f1) {
      const amp = siteAmplification(f, Vs, H, zeta);
      if (amp > best) { best = amp; bestF = f; }
    }
    return { peakFrequency: bestF, peakAmplification: best, fundamental: f1 };
  }

  global.Dynamics = { sdofNewmark, freeVibration, harmonicAmplitude, responseSpectrum,
                      siteAmplification, siteFundamental, sitePeakFrequency };
})(typeof window !== "undefined" ? window : globalThis);
