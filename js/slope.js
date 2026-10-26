/* slope.js — Slope stability by the method of slices (circular slip surface).
 *
 * Methods implemented:
 *   - Fellenius / Ordinary method of slices
 *   - Bishop's simplified method (iterative)
 *
 * The critical factor of safety is found by a grid search over trial circle
 * centres and radii. Pore pressure is modelled with the ru coefficient
 * (u = ru * gamma * h). This is a standard, textbook limit-equilibrium model,
 * suitable for learning and preliminary checks.
 */
(function (global) {
  "use strict";

  // Build the ground-surface profile as a polyline of {x, y} points,
  // going left (high) to right (low): crest, slope face, toe.
  function groundProfile(p) {
    const toeX = p.crest + p.H / Math.tan(p.beta * Math.PI / 180);
    return [
      { x: 0, y: p.H },                 // back of crest
      { x: p.crest, y: p.H },           // crest edge (top of slope)
      { x: toeX, y: 0 },                // toe (bottom of slope)
      { x: toeX + p.toe, y: 0 }         // end of toe bench
    ];
  }

  // Ground elevation at x by linear interpolation along the profile.
  function surfaceY(prof, x) {
    if (x <= prof[0].x) return prof[0].y;
    if (x >= prof[prof.length - 1].x) return prof[prof.length - 1].y;
    for (let i = 0; i < prof.length - 1; i++) {
      const a = prof[i], b = prof[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x || 1e-9);
        return a.y + t * (b.y - a.y);
      }
    }
    return 0;
  }

  // Factor of safety for one trial circle (centre xc,yc, radius R).
  // Returns {fos, slices} or null if the circle is not a valid slip surface.
  function circleFoS(p, prof, xc, yc, R, method, nSlices) {
    const gamma = p.gamma, c = p.c, phi = p.phi * Math.PI / 180, ru = p.ru;

    // Find entry/exit x where the lower arc meets the ground surface.
    // Scan across the circle's horizontal extent.
    const xLeft = xc - R, xRight = xc + R;
    const scanN = 200;
    let x1 = null, x2 = null;
    let prevSign = null;
    for (let i = 0; i <= scanN; i++) {
      const x = xLeft + (xRight - xLeft) * i / scanN;
      const dx = x - xc;
      if (Math.abs(dx) > R) continue;
      const arcY = yc - Math.sqrt(Math.max(0, R * R - dx * dx)); // lower arc
      const g = surfaceY(prof, x);
      const sign = Math.sign(g - arcY); // >0 where ground above arc (soil present)
      if (prevSign !== null && sign !== prevSign) {
        if (x1 === null) x1 = x; else x2 = x;
      }
      prevSign = sign;
    }
    if (x1 === null || x2 === null || x2 - x1 < 0.5) return null;

    const b = (x2 - x1) / nSlices;
    let num = 0, den = 0;
    const slices = [];
    for (let i = 0; i < nSlices; i++) {
      const xm = x1 + b * (i + 0.5);
      const dx = xm - xc;
      if (Math.abs(dx) >= R) return null;
      const baseY = yc - Math.sqrt(R * R - dx * dx);
      const topY = surfaceY(prof, xm);
      const h = topY - baseY;
      if (h <= 0) continue;                    // no soil in this slice
      // Base inclination. The profile descends to the right, so the driving
      // (downslope) sense is +x toward the toe; negate dx so Sum(W sin alpha)
      // is positive for the real failure direction.
      const alpha = Math.asin(-dx / R);        // base inclination (rad)
      const W = gamma * h * b;                 // slice weight (kN/m)
      const u = ru * gamma * h;                // pore pressure at base
      const dl = b / Math.cos(alpha);          // base length
      den += W * Math.sin(alpha);
      slices.push({ xm, baseY, topY, alpha, W, u, dl, b });
    }
    if (slices.length < 3 || den <= 0) return null;

    if (method === "fellenius") {
      for (const s of slices) {
        const N = s.W * Math.cos(s.alpha) - s.u * s.dl;
        num += c * s.dl + Math.max(0, N) * Math.tan(phi);
      }
      return { fos: num / den, slices, xc, yc, R };
    }

    // Bishop simplified — iterate on FoS.
    let F = 1.2;
    for (let it = 0; it < 60; it++) {
      let n = 0;
      for (const s of slices) {
        const mAlpha = Math.cos(s.alpha) + Math.sin(s.alpha) * Math.tan(phi) / F;
        if (mAlpha <= 0.2) { n = NaN; break; }
        n += (c * s.b + (s.W - s.u * s.b) * Math.tan(phi)) / mAlpha;
      }
      if (!isFinite(n)) return null;
      const Fnew = n / den;
      if (Math.abs(Fnew - F) < 1e-4) { F = Fnew; break; }
      F = Fnew;
    }
    if (!isFinite(F) || F <= 0) return null;
    return { fos: F, slices, xc, yc, R };
  }

  // Grid search for the critical (minimum FoS) circle.
  function analyze(p) {
    const prof = groundProfile(p);
    const toeX = prof[2].x;
    const method = p.method, nSlices = p.nslices, g = p.grid;

    // Centre grid sits above and behind the slope crest region.
    const cx0 = p.crest * 0.3, cx1 = toeX + p.toe * 0.3;
    const cy0 = p.H * 1.0, cy1 = p.H * 2.6;

    let best = null;
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        const xc = cx0 + (cx1 - cx0) * i / (g - 1);
        const yc = cy0 + (cy1 - cy0) * j / (g - 1);
        // radii: from just reaching ground down to deep circles
        const rMin = yc - p.H * 0.9;
        const rMax = yc + p.H * 0.4;
        const nR = 10;
        for (let k = 0; k < nR; k++) {
          const R = rMin + (rMax - rMin) * k / (nR - 1);
          if (R <= 1) continue;
          const res = circleFoS(p, prof, xc, yc, R, method, nSlices);
          if (res && isFinite(res.fos) && res.fos > 0.1 && res.fos < 20) {
            if (!best || res.fos < best.fos) best = res;
          }
        }
      }
    }
    return { prof, best, toeX };
  }

  global.Slope = { analyze, groundProfile, surfaceY };
})(window);
