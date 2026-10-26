/* sigma.js — 2D plane-strain linear-elastic stress & deformation (FEM).
 *
 * Constant-strain triangle (CST) elements on a structured rectangular mesh.
 * Loads: self-weight (body force) + an optional vertical surcharge on part of
 * the top surface. Boundary conditions: base fully fixed, vertical sides on
 * rollers (horizontal restraint).
 *
 * Outputs nodal displacements and element stresses (sx, sy, txy),
 * then averages element stresses to nodes for smooth contouring.
 *
 * Units: E in kPa (converted from MPa input), gamma kN/m3, q kPa,
 * lengths m. Displacements come out in metres; shown in mm.
 */
(function (global) {
  "use strict";

  function run(p) {
    const W = p.W, H = p.H;
    const nx = Math.max(6, Math.min(30, p.nx | 0));
    const ny = Math.max(4, Math.round(nx * H / W));
    const NX = nx + 1, NY = ny + 1;
    const nNodes = NX * NY;
    const dx = W / nx, dy = H / ny;

    const E = p.E * 1000;   // MPa -> kPa
    const nu = Math.min(0.49, Math.max(0, p.nu));
    const gamma = p.gamma;

    // Node coordinates (origin bottom-left, y up).
    const X = new Float64Array(nNodes), Y = new Float64Array(nNodes);
    const nid = (i, j) => j * NX + i;
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) { const n = nid(i, j); X[n] = i * dx; Y[n] = j * dy; }

    // Triangular elements: split each quad cell into two triangles.
    const tris = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = nid(i, j), b = nid(i + 1, j), c = nid(i + 1, j + 1), d = nid(i, j + 1);
        tris.push([a, b, c]);
        tris.push([a, c, d]);
      }

    // Plane-strain constitutive matrix D (3x3).
    const f = E / ((1 + nu) * (1 - 2 * nu));
    const D = [
      [f * (1 - nu), f * nu, 0],
      [f * nu, f * (1 - nu), 0],
      [0, 0, f * (1 - 2 * nu) / 2]
    ];

    const ndof = 2 * nNodes;
    const K = new Float64Array(ndof * ndof); // dense global stiffness
    const F = new Float64Array(ndof);

    const elemB = [];   // store B and area for stress recovery
    for (const t of tris) {
      const [i, j, k] = t;
      const xi = X[i], yi = Y[i], xj = X[j], yj = Y[j], xk = X[k], yk = Y[k];
      const area = 0.5 * ((xj - xi) * (yk - yi) - (xk - xi) * (yj - yi));
      const A = Math.abs(area);
      if (A < 1e-12) { elemB.push(null); continue; }
      // Shape-function derivatives (b*, c*) for a CST.
      const b1 = (yj - yk), b2 = (yk - yi), b3 = (yi - yj);
      const c1 = (xk - xj), c2 = (xi - xk), c3 = (xj - xi);
      const inv2A = 1 / (2 * area); // keep sign consistent with node ordering
      const B = [
        [b1 * inv2A, 0, b2 * inv2A, 0, b3 * inv2A, 0],
        [0, c1 * inv2A, 0, c2 * inv2A, 0, c3 * inv2A],
        [c1 * inv2A, b1 * inv2A, c2 * inv2A, b2 * inv2A, c3 * inv2A, b3 * inv2A]
      ];
      // Ke = A * B^T D B  (unit thickness, plane strain).
      const DB = mul3x6(D, B);           // 3x6
      const Ke = mulBt_x(B, DB, A);      // 6x6
      const dofs = [2 * i, 2 * i + 1, 2 * j, 2 * j + 1, 2 * k, 2 * k + 1];
      for (let r = 0; r < 6; r++)
        for (let s = 0; s < 6; s++)
          K[dofs[r] * ndof + dofs[s]] += Ke[r][s];
      // Self-weight body force: total weight gamma*A split equally to 3 nodes, downward (-y).
      const fy = -gamma * A / 3;
      F[2 * i + 1] += fy; F[2 * j + 1] += fy; F[2 * k + 1] += fy;
      elemB.push({ B, tri: t, A });
    }

    // Surcharge q (kPa) over width qw centred on the top surface.
    if (p.q > 0 && p.qw > 0) {
      const x0 = (W - p.qw) / 2, x1 = (W + p.qw) / 2;
      for (let i = 0; i < nx; i++) {
        const nA = nid(i, ny), nB = nid(i + 1, ny);
        const xa = X[nA], xb = X[nB];
        const xmid = 0.5 * (xa + xb);
        if (xmid < x0 || xmid > x1) continue;
        const load = p.q * dx;            // total line load on this top edge
        F[2 * nA + 1] += -load / 2;       // split to the two edge nodes
        F[2 * nB + 1] += -load / 2;
      }
    }

    // Boundary conditions: base (j=0) fully fixed; sides (i=0,nx) roller (ux=0).
    const fixedDof = new Uint8Array(ndof);
    for (let i = 0; i < NX; i++) { const n = nid(i, 0); fixedDof[2 * n] = 1; fixedDof[2 * n + 1] = 1; }
    for (let j = 0; j < NY; j++) { fixedDof[2 * nid(0, j)] = 1; fixedDof[2 * nid(nx, j)] = 1; }

    // Apply BCs by penalty / row-column elimination.
    for (let d = 0; d < ndof; d++) {
      if (!fixedDof[d]) continue;
      for (let k = 0; k < ndof; k++) { K[d * ndof + k] = 0; K[k * ndof + d] = 0; }
      K[d * ndof + d] = 1; F[d] = 0;
    }

    const U = LinAlg.solveDense(K, F, ndof);

    // Element stresses -> averaged to nodes.
    const sx = new Float64Array(nNodes), sy = new Float64Array(nNodes),
          txy = new Float64Array(nNodes), cnt = new Float64Array(nNodes);
    for (const eb of elemB) {
      if (!eb) continue;
      const { B, tri } = eb;
      const [i, j, k] = tri;
      const ue = [U[2 * i], U[2 * i + 1], U[2 * j], U[2 * j + 1], U[2 * k], U[2 * k + 1]];
      const eps = [0, 0, 0];
      for (let r = 0; r < 3; r++) for (let s = 0; s < 6; s++) eps[r] += B[r][s] * ue[s];
      const s0 = D[0][0] * eps[0] + D[0][1] * eps[1];
      const s1 = D[1][0] * eps[0] + D[1][1] * eps[1];
      const s2 = D[2][2] * eps[2];
      for (const n of tri) { sx[n] += s0; sy[n] += s1; txy[n] += s2; cnt[n]++; }
    }
    for (let n = 0; n < nNodes; n++) if (cnt[n]) { sx[n] /= cnt[n]; sy[n] /= cnt[n]; txy[n] /= cnt[n]; }

    const uy = new Float64Array(nNodes), ux = new Float64Array(nNodes);
    let maxSettle = 0;
    for (let n = 0; n < nNodes; n++) {
      ux[n] = U[2 * n]; uy[n] = U[2 * n + 1];
      if (-uy[n] > maxSettle) maxSettle = -uy[n];
    }

    return { NX, NY, nx, ny, dx, dy, W, H, X, Y, tris, ux, uy, sx, sy, txy,
             maxSettle, nid };
  }

  // --- tiny matrix helpers (fixed small sizes) ---
  function mul3x6(D, B) {
    const R = [[0,0,0,0,0,0],[0,0,0,0,0,0],[0,0,0,0,0,0]];
    for (let r = 0; r < 3; r++)
      for (let c = 0; c < 6; c++) {
        let s = 0; for (let k = 0; k < 3; k++) s += D[r][k] * B[k][c];
        R[r][c] = s;
      }
    return R;
  }
  function mulBt_x(B, DB, A) {
    const R = []; for (let r = 0; r < 6; r++) R.push([0,0,0,0,0,0]);
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 6; c++) {
        let s = 0; for (let k = 0; k < 3; k++) s += B[k][r] * DB[k][c];
        R[r][c] = s * A;
      }
    return R;
  }

  global.Sigma = { run };
})(window);
