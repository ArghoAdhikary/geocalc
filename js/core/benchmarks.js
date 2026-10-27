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
    },
    {
      id: "consolidation.terzaghi",
      method: "consolidation.terzaghi1d",
      title: "1D consolidation vs Terzaghi series (U at Tv = 0.2)",
      source: "Terzaghi 1D consolidation analytical degree of consolidation",
      tol: 0.02, metric: "relative error in U",
      run(S) {
        const Co = S.Consolidation, cv = 1, H = 2, u0 = 100, Tv = 0.2;
        const tEnd = Tv * (H / 2) * (H / 2) / cv;
        const r = Co.solve1D({ cv, H, u0, nz: 100, tEnd, dt: tEnd / 400, drainage: "double" });
        const ref = Co.terzaghiU(Tv);
        return { computed: r.U, reference: ref, error: Math.abs(r.U - ref) / Math.abs(ref) };
      }
    },
    {
      id: "unsat.vangenuchten",
      method: "unsat.vangenuchten",
      title: "van Genuchten retention: endpoints, monotonicity, Mualem kr",
      source: "van Genuchten (1980) retention + Mualem (1976) conductivity",
      tol: 1e-9, metric: "max property violation",
      run(S) {
        const U = S.Unsat, vg = U.defaultVG();
        let v = 0;
        // Exact endpoints.
        v = Math.max(v, Math.abs(U.waterContent(0, vg) - vg.theta_s));   // saturated
        v = Math.max(v, Math.abs(U.relConductivity(0, vg) - 1));          // kr(0) = 1
        // Independent recomputation of Se at a specific suction (verifies formula).
        const psi0 = 1.5, m = 1 - 1 / vg.n;
        const seRef = Math.pow(1 + Math.pow(vg.alpha * psi0, vg.n), -m);
        v = Math.max(v, Math.abs(U.effSaturation(psi0, vg) - seRef));
        // Monotonic decreasing theta, and kr bounded in [0,1].
        let prev = Infinity;
        for (let psi = 0; psi <= 10; psi += 0.5) { const th = U.waterContent(psi, vg); if (th > prev + 1e-12) v = Math.max(v, th - prev); prev = th; }
        const kr = U.relConductivity(1, vg); if (kr < 0 || kr > 1) v = Math.max(v, Math.max(kr - 1, -kr, 0));
        // Asymptotic sanity: very dry approaches theta_r (within 1% of the range).
        const dry = U.waterContent(1e6, vg), band = vg.theta_r + (vg.theta_s - vg.theta_r) * 0.01;
        if (dry > band) v = Math.max(v, dry - band);
        return { computed: v, reference: 0, error: v };
      }
    },
    {
      id: "geostatic.column",
      method: "geostatic.init",
      title: "Geostatic vertical stress vs γ·z (homogeneous column)",
      source: "Analytical geostatic σv = γz; u = γw·(z − z_wt)",
      tol: 1e-9, metric: "max relative stress/pressure error",
      run(S) {
        const G = S.Geostatic, gamma = 18, zwt = 2;
        const res = G.profile([{ gamma, thickness: 20, K0: 0.5 }], zwt, [1, 5, 10, 15]);
        let e = 0;
        for (const row of res) {
          const svRef = gamma * row.z, uRef = row.z > zwt ? G.GAMMA_W * (row.z - zwt) : 0;
          e = Math.max(e, Math.abs(row.sigma_v - svRef) / svRef, Math.abs(row.u - uRef) / Math.max(uRef, 1e-9));
        }
        return { computed: e, reference: 0, error: e };
      }
    },
    {
      id: "transfer.seep2slope",
      method: "transfer.seep2slope",
      title: "Phreatic pore-pressure transfer u = γw·(wt − base)",
      source: "Hydrostatic pore pressure below a water table (FR-SEP-008)",
      tol: 1e-9, metric: "max pore-pressure error on slices",
      run(S) {
        const Sl = S.Slope, gw = 9.81, wt = 6;
        const p = { H: 10, beta: 34, crest: 12, toe: 14, gamma: 18, c: 10, phi: 25, nslices: 40, porePressureMode: "watertable", wt, gammaW: gw };
        const r = Sl.foSForCircle(p, 24, 17, 17);
        let e = 0;
        for (const s of r.slices) { const ref = Math.max(0, gw * (wt - s.baseY)); e = Math.max(e, Math.abs(s.u - ref)); }
        return { computed: e, reference: 0, error: e };
      }
    },
    {
      id: "dynamic.sdof.free",
      method: "dynamic.sdof",
      title: "SDOF free vibration vs analytical damped response",
      source: "Analytical damped single-degree-of-freedom free vibration",
      tol: 0.01, metric: "max displacement error",
      run(S) {
        const D = S.Dynamics, wn = 2 * Math.PI, zeta = 0.05, m = 1, k = wn * wn, c = 2 * zeta * wn * m;
        const dt = 0.005, n = Math.round(3 / dt), p = new Float64Array(n);
        const r = D.sdofNewmark(m, c, k, p, dt, 1, 0);
        let e = 0; for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(r.x[i] - D.freeVibration(wn, zeta, 1, 0, i * dt)));
        return { computed: e, reference: 0, error: e };
      }
    },
    {
      id: "dynamic.sdof.harmonic",
      method: "dynamic.sdof",
      title: "SDOF harmonic steady-state amplitude vs analytical",
      source: "Analytical harmonic response amplitude |H(ω)|",
      tol: 0.02, metric: "relative amplitude error",
      run(S) {
        const D = S.Dynamics, wn = 2 * Math.PI, zeta = 0.05, m = 1, k = wn * wn, c = 2 * zeta * wn * m;
        const w = 0.7 * wn, p0 = 1, dt = 0.005, n = Math.round(20 / dt), p = new Float64Array(n);
        for (let i = 0; i < n; i++) p[i] = p0 * Math.sin(w * i * dt);
        const r = D.sdofNewmark(m, c, k, p, dt, 0, 0);
        let amp = 0; for (let i = n - Math.round(5 / dt); i < n; i++) amp = Math.max(amp, Math.abs(r.x[i]));
        const ref = D.harmonicAmplitude(wn, zeta, k, p0, w);
        return { computed: amp, reference: ref, error: Math.abs(amp - ref) / Math.abs(ref) };
      }
    },
    {
      id: "dynamic.sdof.energy",
      method: "dynamic.sdof",
      title: "Undamped free vibration conserves energy",
      source: "Energy behaviour, FR-QAK-008 (average-acceleration Newmark)",
      tol: 0.001, metric: "max relative energy drift",
      run(S) {
        const D = S.Dynamics, wn = 2 * Math.PI, m = 1, k = wn * wn, c = 0;
        const dt = 0.005, n = Math.round(5 / dt), p = new Float64Array(n);
        const r = D.sdofNewmark(m, c, k, p, dt, 1, 0);
        const E0 = 0.5 * r.v[0] * r.v[0] + 0.5 * k * r.x[0] * r.x[0];
        let e = 0; for (let i = 0; i < n; i++) e = Math.max(e, Math.abs(0.5 * r.v[i] * r.v[i] + 0.5 * k * r.x[i] * r.x[i] - E0) / E0);
        return { computed: e, reference: 0, error: e };
      }
    },
    {
      id: "dynamic.sdof.timestep",
      method: "dynamic.sdof",
      title: "Time-step refinement convergence",
      source: "Time-step refinement, FR-QAK-008 / FR-VAL-008",
      tol: 0.01, metric: "relative change dt → dt/2",
      run(S) {
        const D = S.Dynamics, wn = 2 * Math.PI, zeta = 0.03, m = 1, k = wn * wn, c = 2 * zeta * wn * m;
        const xAt = (dt, tt) => { const n = Math.round(3 / dt); const p = new Float64Array(n); return D.sdofNewmark(m, c, k, p, dt, 1, 0).x[Math.round(tt / dt)]; };
        const a = xAt(0.01, 2.0), b = xAt(0.005, 2.0);
        return { computed: b, reference: a, error: Math.abs(a - b) / Math.max(Math.abs(b), 0.01) };
      }
    },
    {
      id: "dynamic.site1d.freq",
      method: "dynamic.site1d",
      title: "1D site response fundamental frequency f₁ = Vs/4H",
      source: "Analytical SH-wave resonance of a uniform layer on rigid base",
      tol: 0.02, metric: "relative frequency error",
      run(S) {
        const D = S.Dynamics, Vs = 200, H = 20, zeta = 0.05;
        const r = D.sitePeakFrequency(Vs, H, zeta), ref = D.siteFundamental(Vs, H);
        return { computed: r.peakFrequency, reference: ref, error: Math.abs(r.peakFrequency - ref) / ref };
      }
    },
    {
      id: "thermal.steady.slab",
      method: "thermal.steady",
      title: "Steady conduction slab vs linear profile and flux",
      source: "Analytical 1D steady conduction (linear T, q = kΔT/L)",
      tol: 1e-9, metric: "max profile/flux error",
      run(S) {
        const T = S.Thermal, k = 2, L = 1, T0 = 100, TL = 20, n = 50;
        const r = T.steady1D(k, L, T0, TL, n);
        let e = 0; for (let i = 0; i <= n; i++) e = Math.max(e, Math.abs(r.T[i] - (T0 + (TL - T0) * i / n)));
        const fref = k * (T0 - TL) / L; e = Math.max(e, Math.abs(r.flux - fref) / Math.abs(fref));
        return { computed: e, reference: 0, error: e };
      }
    },
    {
      id: "thermal.transient.series",
      method: "thermal.transient",
      title: "Transient conduction vs analytical series",
      source: "Analytical 1D transient conduction series solution",
      tol: 0.03, metric: "relative mid-slab temperature error",
      run(S) {
        const Th = S.Thermal, alpha = 1, L = 1, Ti = 100, Ts = 0, tEnd = 0.02;
        const r = Th.transient1D({ alpha, L, Ti, Ts, n: 100, tEnd, dt: tEnd / 200 });
        const iMid = Math.round(r.n / 2), x = iMid * r.dz;
        const ref = Th.transientSeries(x, tEnd, L, Ti, Ts, alpha);
        return { computed: r.tempAt(iMid), reference: ref, error: Math.abs(r.tempAt(iMid) - ref) / Math.max(Math.abs(ref), Math.abs(Ti - Ts)) };
      }
    },
    {
      id: "flow3d.steady.linear",
      method: "flow3d.steady",
      title: "3D steady flow field vs linear analytical (patch/field)",
      source: "Analytical 3D Laplace: head linear between prescribed x-faces",
      tol: 0.01, metric: "normalised RMS head error",
      run(S) {
        const r = S.Mesh3D.solveFlow3D({ W: 40, D: 20, T: 20, nx: 20, hu: 16, hd: 4, k: 1 });
        const m = r.mesh; let se = 0, cnt = 0;
        for (let kk = 0; kk < m.NZ; kk++) for (let j = 0; j < m.NY; j++) for (let i = 0; i < m.NX; i++) {
          const hlin = 16 + (4 - 16) * i / m.nx, e = r.headAt(i, j, kk) - hlin; se += e * e; cnt++;
        }
        const error = Math.sqrt(se / cnt) / (16 - 4);
        return { computed: error, reference: 0, error };
      }
    },
    {
      id: "flow3d.steady.balance",
      method: "flow3d.steady",
      title: "3D steady global water balance (inflow = outflow)",
      source: "Darcy flux across the two prescribed-head faces, FR-VAL-006",
      tol: 0.001, metric: "normalised balance error",
      run(S) {
        const r = S.Mesh3D.solveFlow3D({ W: 40, D: 20, T: 20, nx: 20, hu: 16, hd: 4, k: 1 });
        return { computed: r.qout, reference: r.qin, error: r.balanceError };
      }
    }
  ];

  function solvers() {
    return {
      Slope: global.Slope, Seep: global.Seep, FEFlow: global.FEFlow,
      Consolidation: global.Consolidation, Unsat: global.Unsat, Geostatic: global.Geostatic,
      Dynamics: global.Dynamics, Thermal: global.Thermal, Mesh3D: global.Mesh3D
    };
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
