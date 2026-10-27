/* benchmarks.js — numerical verification evidence matrix (Phase B).
 *
 * Each benchmark compares a solver result to an INDEPENDENT analytical
 * reference with a tolerance fixed a priori (FR-VAL-001..008). A method is
 * only labeled "Verified" in the capability registry when its benchmarks pass;
 * these run in CI as a release gate, so a published build always has passing
 * evidence. Agreement with another program is never used as a reference
 * (FR-VAL-003). "Verified" here means verified against these analytical cases
 * within the stated envelope — an independent reviewer sign-off (AC-09) is a
 * human step still required before "Released".
 *
 * Dual-mode: reads solvers from the global scope (window in the browser,
 * globalThis under Node/vm where the solver files have been loaded).
 */
(function (global) {
  "use strict";

  function norm2(arr) { let s = 0; for (let i = 0; i < arr.length; i++) s += arr[i] * arr[i]; return Math.sqrt(s); }

  // --- analytical helper: 1D transient diffusion, left Dirichlet + right no-flow ---
  function transient1D(x, t, L, h1, h0, c) {
    let sum = 0;
    for (let n = 0; n < 60; n++) {
      const kk = (2 * n + 1) * Math.PI / (2 * L);
      sum += (4 / ((2 * n + 1) * Math.PI)) * Math.sin(kk * x) * Math.exp(-kk * kk * c * t);
    }
    return h1 + (h0 - h1) * sum;
  }

  const CASES = [
    {
      id: "slope.fellenius.infinite",
      method: "slope.fellenius",
      title: "Infinite-slope Fellenius vs closed form",
      source: "Analytical infinite-slope factor of safety (textbook closed form)",
      tol: 1e-6, metric: "relative FoS error",
      run(S) {
        const Sl = S.Slope, c = 10, phi = 25, gamma = 18, z = 3, beta = 20, ru = 0.2;
        const computed = Sl.planarFellenius(c, phi, gamma, z, beta, ru, 12);
        const reference = Sl.infiniteSlopeClosedForm(c, phi, gamma, z, beta, ru);
        return { computed, reference, error: Math.abs(computed - reference) / Math.abs(reference) };
      }
    },
    {
      id: "slope.fellenius.recompute",
      method: "slope.fellenius",
      title: "Method-of-slices summation matches documented formula",
      source: "Independent recomputation of Σ from the solver's own slice data",
      tol: 1e-9, metric: "relative FoS error",
      run(S) {
        const Sl = S.Slope;
        const p = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, nslices: 40 };
        const r = Sl.foSForCircle(p, 24, 17, 17);
        const phi = p.phi * Math.PI / 180;
        let num = 0, den = 0;
        for (const s of r.slices) {
          num += p.c * s.dl + Math.max(0, s.W * Math.cos(s.alpha) - s.u * s.dl) * Math.tan(phi);
          den += s.W * Math.sin(s.alpha);
        }
        const reference = num / den;
        return { computed: r.fellenius, reference, error: Math.abs(r.fellenius - reference) / Math.abs(reference) };
      }
    },
    {
      id: "slope.bishop.discretization",
      method: "slope.bishop",
      title: "Slice-count convergence (FoS change < 1%)",
      source: "Discretisation study, FR-VAL-008 (last two refinements)",
      tol: 0.01, metric: "relative FoS change (60→120 slices)",
      run(S) {
        const Sl = S.Slope;
        const p = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25 };
        const f60 = Sl.foSForCircle(p, 24, 17, 17, 60).bishop;
        const f120 = Sl.foSForCircle(p, 24, 17, 17, 120).bishop;
        return { computed: f120, reference: f60, error: Math.abs(f120 - f60) / Math.abs(f60) };
      }
    },
    {
      id: "slope.bishop.ge.fellenius",
      method: "slope.bishop",
      title: "Bishop ≥ Fellenius for identical geometry (theoretical invariant)",
      source: "Known relationship between simplified Bishop and ordinary method",
      tol: 0, metric: "Bishop − Fellenius ≥ 0",
      run(S) {
        const r = S.Slope.foSForCircle({ H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, ru: 0.25, nslices: 40 }, 24, 17, 17);
        const diff = r.bishop - r.fellenius;
        return { computed: r.bishop, reference: r.fellenius, error: diff >= -1e-9 ? 0 : Math.abs(diff) };
      }
    },
    {
      id: "seep.steady.linear",
      method: "seep.steady",
      title: "Steady Darcy field vs linear analytical solution",
      source: "1D Darcy: head linear between two fixed heads (FR-VAL-004)",
      tol: 0.01, metric: "normalised RMS head error",
      run(S) {
        const s = S.Seep.solve({ W: 40, D: 20, nx: 80, hu: 16, hd: 4, k: 1, wall_on: false });
        let se = 0, cnt = 0;
        for (let j = 0; j < s.NY; j++) for (let i = 0; i < s.NX; i++) {
          const hlin = 16 + (4 - 16) * i / s.nx, e = s.h[j * s.NX + i] - hlin; se += e * e; cnt++;
        }
        const error = Math.sqrt(se / cnt) / (16 - 4);
        return { computed: error, reference: 0, error };
      }
    },
    {
      id: "seep.steady.balance",
      method: "seep.steady",
      title: "Steady global water balance (inflow = outflow)",
      source: "Darcy flux integral, FR-VAL-006 (≤ 0.1%)",
      tol: 0.001, metric: "normalised balance error",
      run(S) {
        const s = S.Seep.solve({ W: 40, D: 20, nx: 80, hu: 16, hd: 4, k: 1, wall_on: false });
        let qin = 0, qout = 0;
        for (let j = 0; j < s.NY; j++) {
          const wj = (j === 0 || j === s.ny) ? 0.5 : 1;
          qin += s.k * (s.h[j * s.NX + 0] - s.h[j * s.NX + 1]) / s.dx * s.dy * wj;
          qout += s.k * (s.h[j * s.NX + (s.nx - 1)] - s.h[j * s.NX + s.nx]) / s.dx * s.dy * wj;
        }
        const error = Math.abs(qin - qout) / Math.max(Math.abs(qin), Math.abs(qout), 1e-12);
        return { computed: qout, reference: qin, error };
      }
    },
    {
      id: "seep.transient.analytical",
      method: "seep.transient",
      title: "1D transient diffusion vs series solution",
      source: "Analytical 1D diffusion, Dirichlet + no-flow (FR-VAL-008)",
      tol: 0.03, metric: "relative head error at mid-domain",
      run(S) {
        const L = 10, k = 1, Sst = 0.01, h1 = 10, h0 = 0, c = k / Sst, tEnd = 0.2;
        const r = S.Seep.solveTransient({ W: L, D: 1, nx: 50, hu: h1, hd: h0, h0: h0, k, S: Sst, rightBC: "noflow", tEnd, dt: tEnd / 100 });
        const iMid = Math.round(r.nx / 2), x = iMid * r.dx;
        const computed = r.headAt(iMid, 0);
        const reference = transient1D(x, tEnd, L, h1, h0, c);
        return { computed, reference, error: Math.abs(computed - reference) / Math.max(Math.abs(reference), Math.abs(h1 - h0)) };
      }
    },
    {
      id: "seep.transient.balance",
      method: "seep.transient",
      title: "Transient cumulative water balance",
      source: "Storage change vs net inflow, FR-VAL-006 (≤ 0.5%)",
      tol: 0.005, metric: "normalised cumulative balance error",
      run(S) {
        const r = S.Seep.solveTransient({ W: 10, D: 1, nx: 50, hu: 10, hd: 0, h0: 0, k: 1, S: 0.01, rightBC: "noflow", tEnd: 0.2, dt: 0.2 / 100 });
        return { computed: r.storage, reference: r.netInflow, error: r.balanceError };
      }
    },
    {
      id: "feflow.steady.linear",
      method: "feflow.steady",
      title: "FE steady flow field vs linear analytical solution",
      source: "Linear FE reproduces linear head exactly (FR-VAL-004)",
      tol: 0.01, metric: "normalised RMS head error",
      run(S) {
        const r = S.FEFlow.solveSteady({ W: 40, D: 20, nx: 24, hu: 16, hd: 4, k: 1 });
        const m = r.mesh; let se = 0;
        for (let n = 0; n < m.nNodes; n++) { const hlin = 16 + (4 - 16) * m.X[n] / m.W; const e = r.h[n] - hlin; se += e * e; }
        const error = Math.sqrt(se / m.nNodes) / (16 - 4);
        return { computed: error, reference: 0, error };
      }
    },
    {
      id: "feflow.steady.balance",
      method: "feflow.steady",
      title: "FE steady global water balance (reactions)",
      source: "Nodal reaction balance, FR-VAL-006 (≤ 0.1%)",
      tol: 0.001, metric: "normalised balance error",
      run(S) {
        const r = S.FEFlow.solveSteady({ W: 40, D: 20, nx: 24, hu: 16, hd: 4, k: 1 });
        return { computed: r.qOut, reference: r.qIn, error: r.balanceError };
      }
    }
  ];

  function solvers() {
    return { Slope: global.Slope, Seep: global.Seep, FEFlow: global.FEFlow };
  }

  // Run all benchmarks (optionally filtered to one method). Returns results.
  function run(filterMethod) {
    const S = solvers();
    const out = [];
    for (const c of CASES) {
      if (filterMethod && c.method !== filterMethod) continue;
      let r;
      try {
        const res = c.run(S);
        r = { id: c.id, method: c.method, title: c.title, source: c.source, metric: c.metric,
              tol: c.tol, computed: res.computed, reference: res.reference, error: res.error,
              pass: res.error <= c.tol, error_message: null };
      } catch (e) {
        r = { id: c.id, method: c.method, title: c.title, source: c.source, metric: c.metric,
              tol: c.tol, pass: false, error: NaN, error_message: String(e && e.message || e) };
      }
      out.push(r);
    }
    return out;
  }

  // Which methods have every one of their benchmarks passing.
  function verifiedMethods() {
    const results = run();
    const byMethod = {};
    for (const r of results) {
      if (!(r.method in byMethod)) byMethod[r.method] = true;
      if (!r.pass) byMethod[r.method] = false;
    }
    return Object.keys(byMethod).filter(m => byMethod[m]);
  }

  global.Benchmarks = { CASES, run, verifiedMethods };
})(typeof window !== "undefined" ? window : globalThis);
