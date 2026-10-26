/* linalg.js — small dense linear algebra helpers (no dependencies).
 * Used by the SIGMA finite-element solver. */
(function (global) {
  "use strict";

  // Solve A x = b for a dense symmetric positive-definite-ish system
  // using Gaussian elimination with partial pivoting.
  // A: Float64Array flattened n*n (row-major), b: Float64Array n. Returns x.
  function solveDense(A, b, n) {
    const a = Float64Array.from(A);
    const x = Float64Array.from(b);
    for (let col = 0; col < n; col++) {
      // partial pivot
      let piv = col, max = Math.abs(a[col * n + col]);
      for (let r = col + 1; r < n; r++) {
        const v = Math.abs(a[r * n + col]);
        if (v > max) { max = v; piv = r; }
      }
      if (max < 1e-14) continue; // singular-ish; skip (constrained rows)
      if (piv !== col) {
        for (let k = 0; k < n; k++) {
          const t = a[col * n + k]; a[col * n + k] = a[piv * n + k]; a[piv * n + k] = t;
        }
        const tb = x[col]; x[col] = x[piv]; x[piv] = tb;
      }
      const diag = a[col * n + col];
      for (let r = col + 1; r < n; r++) {
        const f = a[r * n + col] / diag;
        if (f === 0) continue;
        for (let k = col; k < n; k++) a[r * n + k] -= f * a[col * n + k];
        x[r] -= f * x[col];
      }
    }
    // back substitution
    for (let row = n - 1; row >= 0; row--) {
      let s = x[row];
      for (let k = row + 1; k < n; k++) s -= a[row * n + k] * x[k];
      const d = a[row * n + row];
      x[row] = Math.abs(d) < 1e-14 ? 0 : s / d;
    }
    return x;
  }

  // Conjugate-gradient solver for large sparse SPD systems given a
  // matrix-vector product function matvec(x) -> y. Used by SEEP if needed.
  function cg(matvec, b, n, tol, maxIt) {
    tol = tol || 1e-8; maxIt = maxIt || 5000;
    const x = new Float64Array(n);
    const r = Float64Array.from(b);
    const p = Float64Array.from(r);
    let rs = dot(r, r, n);
    const bnorm = Math.sqrt(dot(b, b, n)) || 1;
    for (let it = 0; it < maxIt; it++) {
      const Ap = matvec(p);
      const alpha = rs / (dot(p, Ap, n) || 1e-30);
      for (let i = 0; i < n; i++) { x[i] += alpha * p[i]; r[i] -= alpha * Ap[i]; }
      const rsNew = dot(r, r, n);
      if (Math.sqrt(rsNew) / bnorm < tol) break;
      const beta = rsNew / (rs || 1e-30);
      for (let i = 0; i < n; i++) p[i] = r[i] + beta * p[i];
      rs = rsNew;
    }
    return x;
  }

  function dot(a, b, n) { let s = 0; for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; }

  global.LinAlg = { solveDense, cg };
})(window);
