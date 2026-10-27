/* feflow.js — finite-element meshing and steady seepage for flow (Phase B).
 *
 * A structured triangular mesh over a rectangular domain with a linear (CST)
 * Galerkin discretisation of steady saturated Laplace flow:
 *     div( k grad h ) = 0
 * Boundaries: left = prescribed head hu, right = prescribed head hd
 * (Dirichlet); top and bottom are natural no-flow boundaries.
 *
 * Linear elements reproduce a linear head field exactly, so for a homogeneous
 * rectangle the FE solution equals the analytical field to solver precision —
 * used as the FE flow benchmark. Boundary flux (nodal reactions) gives the
 * global water-balance check.
 *
 * Dual-mode (browser global window.FEFlow + CommonJS / vm). Uses LinAlg.
 */
(function (global, factoryGetLinAlg) {
  "use strict";

  function build(p) {
    const W = p.W, H = (p.D != null ? p.D : p.H);
    const nx = Math.max(2, Math.min(40, p.nx | 0 || 20));
    const ny = Math.max(2, Math.min(40, Math.round(nx * H / W)));
    const NX = nx + 1, NY = ny + 1, nNodes = NX * NY;
    const dx = W / nx, dy = H / ny;
    const nid = (i, j) => j * NX + i;

    const X = new Float64Array(nNodes), Y = new Float64Array(nNodes);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const n = nid(i, j); X[n] = i * dx; Y[n] = j * dy; }

    const tris = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = nid(i, j), b = nid(i + 1, j), c = nid(i + 1, j + 1), d = nid(i, j + 1);
      tris.push([a, b, c]); tris.push([a, c, d]);
    }
    return { W, H, nx, ny, NX, NY, nNodes, dx, dy, nid, X, Y, tris };
  }

  function solveSteady(p) {
    const LinAlg = (typeof global.LinAlg !== "undefined") ? global.LinAlg : null;
    if (!LinAlg) throw new Error("FEFlow requires LinAlg");
    const m = build(p);
    const k = p.k > 0 ? p.k : 1;
    const n = m.nNodes;
    const K = new Float64Array(n * n);

    for (const t of m.tris) {
      const [i, j, l] = t;
      const xi = m.X[i], yi = m.Y[i], xj = m.X[j], yj = m.Y[j], xl = m.X[l], yl = m.Y[l];
      const area2 = (xj - xi) * (yl - yi) - (xl - xi) * (yj - yi);
      const A = Math.abs(area2) / 2;
      if (A < 1e-14) continue;
      // Shape-function gradients (b = dN/dx*2A, c = dN/dy*2A).
      const b = [yj - yl, yl - yi, yi - yj];
      const c = [xl - xj, xi - xl, xj - xi];
      const f = k / (4 * A);
      for (let r = 0; r < 3; r++) for (let s = 0; s < 3; s++) {
        K[t[r] * n + t[s]] += f * (b[r] * b[s] + c[r] * c[s]);
      }
    }

    // Dirichlet BCs: left column -> hu, right column -> hd.
    const headBC = new Float64Array(n).fill(NaN);
    for (let j = 0; j < m.NY; j++) { headBC[m.nid(0, j)] = p.hu; headBC[m.nid(m.nx, j)] = p.hd; }

    // Keep a copy of K to recover boundary reactions after solving.
    const Kfull = Float64Array.from(K);
    const F = new Float64Array(n);
    // Move each known head's contribution to the RHS of the non-fixed rows.
    for (let d = 0; d < n; d++) {
      if (Number.isNaN(headBC[d])) continue;
      const g = headBC[d];
      for (let row = 0; row < n; row++) {
        if (row === d || !Number.isNaN(headBC[row])) continue;
        F[row] -= K[row * n + d] * g;
      }
    }
    // Then zero the fixed rows/columns and pin the known values.
    for (let d = 0; d < n; d++) {
      if (Number.isNaN(headBC[d])) continue;
      for (let col = 0; col < n; col++) { K[d * n + col] = 0; K[col * n + d] = 0; }
      K[d * n + d] = 1; F[d] = headBC[d];
    }

    const h = LinAlg.solveDense(K, F, n);

    // Boundary reactions q = Kfull * h at Dirichlet nodes (nodal flux).
    let qIn = 0, qOut = 0;
    for (let d = 0; d < n; d++) {
      if (Number.isNaN(headBC[d])) continue;
      let r = 0; for (let col = 0; col < n; col++) r += Kfull[d * n + col] * h[col];
      if (h[d] >= (p.hu + p.hd) / 2) qIn += r; else qOut += r;
    }
    const Q = (qIn - qOut) / 2; // symmetric balance magnitude

    let hMin = Infinity, hMax = -Infinity;
    for (let i = 0; i < n; i++) { if (h[i] < hMin) hMin = h[i]; if (h[i] > hMax) hMax = h[i]; }

    return {
      mesh: m, h, k, Q, qIn, qOut, hMin, hMax,
      balanceError: Math.abs(qIn + qOut) / Math.max(Math.abs(qIn), Math.abs(qOut), 1e-12),
      headAt: (i, j) => h[m.nid(i, j)]
    };
  }

  global.FEFlow = { build, solveSteady };
})(typeof window !== "undefined" ? window : globalThis);
