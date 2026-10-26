/* seep.js — 2D steady-state confined seepage.
 *
 * Governs Laplace's equation  d2h/dx2 + d2h/dy2 = 0  for a homogeneous,
 * isotropic soil. Solved by finite differences on a structured grid using
 * successive over-relaxation (SOR).
 *
 * Boundary conditions:
 *   - Left edge  : constant head = upstream head (Dirichlet)
 *   - Right edge : constant head = downstream head (Dirichlet)
 *   - Top/bottom : no flow (Neumann), handled by mirroring
 *   - Cutoff wall: an impermeable vertical barrier (cells marked inactive)
 *
 * Output: head field, Darcy flow rate through the domain, and gradient
 * magnitudes for display.
 */
(function (global) {
  "use strict";

  function solve(p) {
    const W = p.W, D = p.D;
    const nx = Math.max(20, Math.min(160, p.nx | 0));
    const dx = W / nx;
    const ny = Math.max(10, Math.round(D / dx));
    const dy = D / ny;
    const NX = nx + 1, NY = ny + 1;

    const h = new Float64Array(NX * NY);
    const active = new Uint8Array(NX * NY).fill(1);
    const fixed = new Uint8Array(NX * NY);     // Dirichlet nodes
    const idx = (i, j) => j * NX + i;

    // Initial guess: linear ramp from upstream to downstream head.
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++)
        h[idx(i, j)] = p.hu + (p.hd - p.hu) * i / nx;

    // Dirichlet boundaries (left = upstream, right = downstream).
    for (let j = 0; j < NY; j++) {
      h[idx(0, j)] = p.hu; fixed[idx(0, j)] = 1;
      h[idx(nx, j)] = p.hd; fixed[idx(nx, j)] = 1;
    }

    // Cutoff wall: impermeable vertical column of nodes from the top down.
    let wallI = -1, wallRows = 0;
    if (p.wall_on) {
      wallI = Math.round(p.wall_x / dx);
      wallI = Math.max(1, Math.min(nx - 1, wallI));
      wallRows = Math.round(p.wall_d / dy);
      wallRows = Math.max(0, Math.min(ny, wallRows));
      for (let j = 0; j < wallRows; j++) active[idx(wallI, j)] = 0;
    }

    // SOR iteration.
    const omega = 1.85;
    let maxErr = 0;
    for (let it = 0; it < 4000; it++) {
      maxErr = 0;
      for (let j = 0; j < NY; j++) {
        for (let i = 1; i < nx; i++) {
          const n = idx(i, j);
          if (fixed[n] || !active[n]) continue;
          // Neighbours with no-flow mirroring at top/bottom and at walls.
          const hL = active[idx(i - 1, j)] ? h[idx(i - 1, j)] : h[n];
          const hR = active[idx(i + 1, j)] ? h[idx(i + 1, j)] : h[n];
          const hU = (j < ny && active[idx(i, j + 1)]) ? h[idx(i, j + 1)] : null;
          const hD = (j > 0 && active[idx(i, j - 1)]) ? h[idx(i, j - 1)] : null;
          const up = hU === null ? (hD === null ? h[n] : hD) : hU;
          const dn = hD === null ? (hU === null ? h[n] : hU) : hD;
          const newH = 0.25 * (hL + hR + up + dn);
          const relaxed = h[n] + omega * (newH - h[n]);
          maxErr = Math.max(maxErr, Math.abs(relaxed - h[n]));
          h[n] = relaxed;
        }
      }
      if (maxErr < 1e-6) break;
    }

    // Darcy flow rate through a vertical section just right of the wall
    // (or at mid-domain if no wall). q = k * sum(i_x * dy) per unit thickness.
    const k = p.k;
    const secI = p.wall_on ? Math.min(nx - 1, wallI + 1) : Math.round(nx / 2);
    let q = 0;
    for (let j = 0; j < NY; j++) {
      const a = idx(secI - 1, j), b = idx(secI + 1 <= nx ? secI + 1 : nx, j);
      if (!active[a] || !active[b]) continue;
      const grad = (h[a] - h[b]) / (2 * dx); // horizontal gradient
      q += k * grad * dy;
    }

    // Gradient magnitude field for display (exit-gradient style).
    const grad = new Float64Array(NX * NY);
    let maxGrad = 0, exitGrad = 0;
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        const n = idx(i, j);
        if (!active[n]) { grad[n] = 0; continue; }
        const iL = active[idx(Math.max(0, i - 1), j)] ? idx(Math.max(0, i - 1), j) : n;
        const iR = active[idx(Math.min(nx, i + 1), j)] ? idx(Math.min(nx, i + 1), j) : n;
        const jU = (j < ny && active[idx(i, j + 1)]) ? idx(i, j + 1) : n;
        const jD = (j > 0 && active[idx(i, j - 1)]) ? idx(i, j - 1) : n;
        const gx = (h[iL] - h[iR]) / (2 * dx);
        const gy = (h[jD] - h[jU]) / (2 * dy);
        const g = Math.hypot(gx, gy);
        grad[n] = g;
        if (g > maxGrad) maxGrad = g;
        if (j === ny) exitGrad = Math.max(exitGrad, g); // top surface exit gradient
      }
    }

    let hMin = Infinity, hMax = -Infinity;
    for (let n = 0; n < h.length; n++) {
      if (!active[n]) continue;
      if (h[n] < hMin) hMin = h[n];
      if (h[n] > hMax) hMax = h[n];
    }

    return {
      NX, NY, nx, ny, dx, dy, h, active, grad,
      hMin, hMax, maxGrad, exitGrad, q: Math.abs(q), k,
      wallI, wallRows, converged: maxErr < 1e-5
    };
  }

  global.Seep = { solve };
})(window);
