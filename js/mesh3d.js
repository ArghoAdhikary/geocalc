/* mesh3d.js — 3D authoring, volumetric mesh, and 3D steady flow (Phase E).
 *
 * Structured hexahedral grid over a box domain, with a finite-difference
 * solution of 3D steady saturated flow (Laplace). Left/right x-faces are
 * prescribed heads (Dirichlet); the other faces are no-flow. Linear fields are
 * reproduced exactly, giving the 3D field and global-balance benchmarks
 * (spec §18.2: patch/symmetry, 2D limiting comparison, 3D field checks).
 *
 * The spec is explicit that 3D release status is NOT inherited from 2D — this
 * solver carries its own benchmark evidence. Dual-mode.
 */
(function (global) {
  "use strict";

  function build3D(p) {
    const W = p.W, D = (p.D != null ? p.D : p.H), T = (p.T != null ? p.T : p.W / 2);
    const nx = Math.max(2, Math.min(60, p.nx | 0 || 24));
    const dx = W / nx;
    const ny = Math.max(1, Math.min(30, Math.round(D / dx)));
    const nz = Math.max(1, Math.min(30, Math.round(T / dx)));
    const dy = D / ny, dz = T / nz;
    const NX = nx + 1, NY = ny + 1, NZ = nz + 1;
    const nNodes = NX * NY * NZ;
    const nElems = nx * ny * nz;
    return { W, D, T, nx, ny, nz, dx, dy, dz, NX, NY, NZ, nNodes, nElems,
             idx: (i, j, k) => (k * NY + j) * NX + i };
  }

  function solveFlow3D(p) {
    const m = build3D(p);
    const { nx, ny, nz, NX, NY, NZ, dx, dy, dz, idx } = m;
    const k = p.k > 0 ? p.k : 1;
    const h = new Float64Array(m.nNodes);
    // Initial linear guess and Dirichlet x-faces.
    for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++)
      h[idx(i, j, kk)] = p.hu + (p.hd - p.hu) * i / nx;

    const cx = 1 / (dx * dx), cy = 1 / (dy * dy), cz = 1 / (dz * dz);
    const omega = 1.6;
    let maxErr = 0;
    for (let it = 0; it < 4000; it++) {
      maxErr = 0;
      for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) for (let i = 1; i < nx; i++) {
        const n = idx(i, j, kk);
        const hL = h[idx(i - 1, j, kk)], hR = h[idx(i + 1, j, kk)];
        const hS = j > 0 ? h[idx(i, j - 1, kk)] : h[idx(i, j + 1 <= ny ? j + 1 : j, kk)];
        const hN = j < ny ? h[idx(i, j + 1, kk)] : h[idx(i, j - 1, kk)];
        const hD = kk > 0 ? h[idx(i, j, kk - 1)] : h[idx(i, j, kk + 1 <= nz ? kk + 1 : kk)];
        const hU = kk < nz ? h[idx(i, j, kk + 1)] : h[idx(i, j, kk - 1)];
        const newH = (cx * (hL + hR) + cy * (hS + hN) + cz * (hD + hU)) / (2 * (cx + cy + cz));
        const relaxed = h[n] + omega * (newH - h[n]);
        maxErr = Math.max(maxErr, Math.abs(relaxed - h[n]));
        h[n] = relaxed;
      }
      if (maxErr < 1e-7) break;
    }

    // Global balance via Darcy flux across the two x-faces.
    let qin = 0, qout = 0;
    for (let kk = 0; kk < NZ; kk++) for (let j = 0; j < NY; j++) {
      const wj = (j === 0 || j === ny) ? 0.5 : 1, wk = (kk === 0 || kk === nz) ? 0.5 : 1, wa = wj * wk * dy * dz;
      qin += k * (h[idx(0, j, kk)] - h[idx(1, j, kk)]) / dx * wa;
      qout += k * (h[idx(nx - 1, j, kk)] - h[idx(nx, j, kk)]) / dx * wa;
    }
    let hMin = Infinity, hMax = -Infinity;
    for (let n = 0; n < h.length; n++) { if (h[n] < hMin) hMin = h[n]; if (h[n] > hMax) hMax = h[n]; }

    return {
      mesh: m, h, k, qin, qout, hMin, hMax, converged: maxErr < 1e-6,
      balanceError: Math.abs(qin - qout) / Math.max(Math.abs(qin), Math.abs(qout), 1e-12),
      headAt: (i, j, kk) => h[idx(i, j, kk)],
      // Extract a horizontal z = const slice as a 2D (NX x NY) array for display.
      sliceZ: (kk) => { const out = new Float64Array(NX * NY); for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) out[j * NX + i] = h[idx(i, j, kk)]; return out; }
    };
  }

  global.Mesh3D = { build3D, solveFlow3D };
})(typeof window !== "undefined" ? window : globalThis);
