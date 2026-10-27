/* probabilistic.js — probabilistic slope stability (Phase F).
 *
 * Monte Carlo reliability analysis: strength parameters c' and phi' are
 * sampled from normal distributions with a seeded, reproducible generator, and
 * the factor of safety is evaluated on the deterministic critical surface for
 * each realization. Reports mean, standard deviation and probability of failure
 * P(FoS < 1) for the selected limit state (FR-SLP-009; seeded reproducibility,
 * FR-VAL-009).
 *
 * Dual-mode (browser global window.Probabilistic + CommonJS / vm).
 */
(function (global) {
  "use strict";

  // Deterministic seeded PRNG (mulberry32) and a Box–Muller normal sampler.
  function mulberry32(seed) {
    let s = seed >>> 0;
    return function () {
      s += 0x6D2B79F5;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function normalSample(rng, mean, std) {
    const u1 = Math.max(1e-12, rng()), u2 = rng();
    return mean + std * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }

  function stats(arr) {
    const n = arr.length;
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / Math.max(1, n - 1);
    return { n, mean, std: Math.sqrt(variance), min: Math.min.apply(null, arr), max: Math.max.apply(null, arr) };
  }

  // Monte Carlo slope reliability on the deterministic critical surface.
  // dists: { cMean, cStd, phiMean, phiStd }.
  function monteCarloSlope(baseP, dists, N, seed) {
    const base = global.Slope.analyze(baseP);
    if (!base.best) return null;
    const { xc, yc, R } = base.best;
    const rng = mulberry32(seed >>> 0);
    const fos = [];
    for (let i = 0; i < N; i++) {
      const p = Object.assign({}, baseP);
      p.c = Math.max(0, normalSample(rng, dists.cMean, dists.cStd));
      p.phi = Math.max(0, Math.min(60, normalSample(rng, dists.phiMean, dists.phiStd)));
      const r = global.Slope.foSForCircle(p, xc, yc, R, baseP.nslices || 30);
      const f = baseP.method === "fellenius" ? r.fellenius : r.bishop;
      if (isFinite(f) && f > 0) fos.push(f);
    }
    const s = stats(fos);
    const pf = fos.filter(f => f < 1).length / fos.length;
    // Reliability index (normal approximation): beta = (mean - 1)/std.
    const beta = s.std > 0 ? (s.mean - 1) / s.std : Infinity;
    return { fos, mean: s.mean, std: s.std, min: s.min, max: s.max, n: s.n, pf, beta, circle: { xc, yc, R } };
  }

  global.Probabilistic = { mulberry32, normalSample, stats, monteCarloSlope };
})(typeof window !== "undefined" ? window : globalThis);
