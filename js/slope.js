/* slope.js — Slope stability by the method of slices (circular slip surface).
 *
 * Methods implemented:
 *   - Fellenius / Ordinary method of slices
 *   - Bishop's simplified method (iterative, moment equilibrium)
 *   - Spencer's method (rigorous — satisfies both force and moment
 *     equilibrium with a constant interslice-force inclination λ)
 *
 * Slip-surface search:
 *   - Grid of trial circle centres and radii, OR
 *   - Entry-and-exit: circles are generated through an entry range on the
 *     crest and an exit range near the toe, with radius increments.
 *
 * Pore pressure: rᵤ coefficient (u = rᵤ·γ·h), a horizontal water table, or a
 * piezometric line (polyline) — u = γ_w·(piezometric elevation − base).
 *
 * These are standard, textbook limit-equilibrium models, suitable for learning
 * and preliminary checks. Equations follow Fredlund & Krahn (1977), "Comparison
 * of slope stability methods of analysis", Can. Geotech. J. 14(3).
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

  // Linear interpolation of y along an ascending-x polyline, clamped at ends.
  function interpPolyline(poly, x) {
    if (!poly || poly.length === 0) return 0;
    if (x <= poly[0].x) return poly[0].y;
    if (x >= poly[poly.length - 1].x) return poly[poly.length - 1].y;
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      if (x >= a.x && x <= b.x) {
        const t = (x - a.x) / (b.x - a.x || 1e-9);
        return a.y + t * (b.y - a.y);
      }
    }
    return 0;
  }

  // Ground elevation at x by linear interpolation along the profile.
  function surfaceY(prof, x) { return interpPolyline(prof, x); }

  // Piezometric elevation at x along a user piezometric line.
  function piezoY(line, x) { return interpPolyline(line, x); }

  // Pore pressure at a slice base, by the selected model.
  function poreU(p, baseX, baseY, h, gamma, ru) {
    const gw = p.gammaW || 9.81;
    if (p.porePressureMode === "watertable") {
      return Math.max(0, gw * ((p.wt != null ? p.wt : 0) - baseY));
    }
    if (p.porePressureMode === "piezometric" && p.piezo && p.piezo.length >= 2) {
      return Math.max(0, gw * (piezoY(p.piezo, baseX) - baseY));
    }
    return ru * gamma * h; // rᵤ coefficient (default)
  }

  // Discretise one trial circle into slices. Returns {slices, x1, x2} or null
  // when the circle is not a valid slip surface. Each slice carries the common
  // quantities every method needs: base inclination α, weight W, pore pressure
  // u, base length l (dl), width b, and base/top elevations.
  function buildSlices(p, prof, xc, yc, R, nSlices) {
    const gamma = p.gamma, ru = p.ru;
    // Entry/exit where the lower arc crosses the ground surface.
    const xLeft = xc - R, xRight = xc + R;
    const scanN = 240;
    let x1 = null, x2 = null, prevSign = null;
    for (let i = 0; i <= scanN; i++) {
      const x = xLeft + (xRight - xLeft) * i / scanN;
      const dx = x - xc;
      if (Math.abs(dx) > R) continue;
      const arcY = yc - Math.sqrt(Math.max(0, R * R - dx * dx));
      const sign = Math.sign(surfaceY(prof, x) - arcY);
      if (prevSign !== null && sign !== prevSign) {
        if (x1 === null) x1 = x; else x2 = x;
      }
      prevSign = sign;
    }
    if (x1 === null || x2 === null || x2 - x1 < 0.5) return null;

    const b = (x2 - x1) / nSlices;
    const slices = [];
    for (let i = 0; i < nSlices; i++) {
      const xm = x1 + b * (i + 0.5);
      const dx = xm - xc;
      if (Math.abs(dx) >= R) return null;
      const baseY = yc - Math.sqrt(R * R - dx * dx);
      const topY = surfaceY(prof, xm);
      const h = topY - baseY;
      if (h <= 0) continue;
      // Profile descends to the right, so the driving sense is +x toward the
      // toe; negate dx so Σ(W·sinα) is positive for the real failure direction.
      const alpha = Math.asin(-dx / R);
      const W = gamma * h * b;
      const u = poreU(p, xm, baseY, h, gamma, ru);
      const dl = b / Math.cos(alpha);
      slices.push({ xm, baseY, topY, h, alpha, W, u, dl, b });
    }
    if (slices.length < 3) return null;
    return { slices, x1, x2 };
  }

  function drivingMoment(slices) {
    let den = 0;
    for (const s of slices) den += s.W * Math.sin(s.alpha);
    return den;
  }

  // Fellenius / ordinary method of slices.
  function felleniusFoS(slices, c, phi) {
    let num = 0;
    for (const s of slices) {
      const N = s.W * Math.cos(s.alpha) - s.u * s.dl;
      num += c * s.dl + Math.max(0, N) * Math.tan(phi);
    }
    const den = drivingMoment(slices);
    return den > 0 ? num / den : null;
  }

  // Bishop's simplified method (moment equilibrium, iterate on F).
  function bishopFoS(slices, c, phi) {
    const den = drivingMoment(slices);
    if (den <= 0) return null;
    let F = 1.2;
    for (let it = 0; it < 80; it++) {
      let n = 0;
      for (const s of slices) {
        const mAlpha = Math.cos(s.alpha) + Math.sin(s.alpha) * Math.tan(phi) / F;
        if (mAlpha <= 0.2) return null;
        n += (c * s.b + (s.W - s.u * s.b) * Math.tan(phi)) / mAlpha;
      }
      const Fnew = n / den;
      if (!isFinite(Fnew)) return null;
      if (Math.abs(Fnew - F) < 1e-5) { F = Fnew; break; }
      F = Fnew;
    }
    return (isFinite(F) && F > 0) ? F : null;
  }

  // Spencer's method (Fredlund & Krahn 1977 general limit equilibrium).
  //
  // Interslice forces are parallel at inclination θ = atan(λ). For a given λ
  // the base normal force follows from vertical equilibrium:
  //    N = [ W + (X_R − X_L) − (sinα/F)(c·l − u·l·tanφ) ] / mα,
  //    mα = cosα + sinα·tanφ/F,
  // the interslice normal E is integrated from horizontal slice equilibrium,
  // and X = λ·E. Two factors of safety follow:
  //    F_m (moment, circular) = Σ[c·l + (N − u·l)tanφ] / Σ[W·sinα]
  //    F_f (force)            = Σ[(c·l + (N − u·l)tanφ)cosα] / Σ[N·sinα]
  // The Spencer solution is the λ where F_m(λ) = F_f(λ): both equilibria met.
  function spencerSolve(slices, c, phi) {
    const tanphi = Math.tan(phi);
    const n = slices.length;
    const den = drivingMoment(slices);
    if (den <= 0) return null;

    // One interslice-force iteration at fixed (λ, F); returns {Fm, Ff}.
    function pass(lam, F) {
      let X = new Array(n + 1).fill(0);
      const N = new Array(n).fill(0);
      for (let inner = 0; inner < 60; inner++) {
        for (let i = 0; i < n; i++) {
          const s = slices[i];
          const ma = Math.cos(s.alpha) + Math.sin(s.alpha) * tanphi / F;
          if (ma <= 0.2) return null;
          N[i] = (s.W + (X[i + 1] - X[i]) - (Math.sin(s.alpha) / F) * (c * s.dl - s.u * s.dl * tanphi)) / ma;
        }
        const newX = new Array(n + 1).fill(0);
        let E = 0;
        for (let i = 0; i < n; i++) {
          const s = slices[i];
          const Sm = (c * s.dl + (N[i] - s.u * s.dl) * tanphi) / F;
          // Horizontal equilibrium of the slice: (E_R − E_L) = S_m·cosα − N·sinα.
          E += Sm * Math.cos(s.alpha) - N[i] * Math.sin(s.alpha);
          newX[i + 1] = lam * E;
        }
        newX[n] = 0; // force-boundary condition at the toe face
        let diff = 0;
        for (let k = 0; k <= n; k++) diff += Math.abs(newX[k] - X[k]);
        X = newX;
        if (diff < 1e-8) break;
      }
      let numM = 0, numF = 0, denF = 0;
      for (let i = 0; i < n; i++) {
        const s = slices[i];
        const resist = c * s.dl + (N[i] - s.u * s.dl) * tanphi;
        numM += resist;
        numF += resist * Math.cos(s.alpha);
        denF += N[i] * Math.sin(s.alpha);
      }
      const Fm = numM / den;
      const Ff = denF !== 0 ? numF / denF : NaN;
      return { Fm, Ff };
    }

    // Converge F for one equilibrium equation ('m' or 'f') at fixed λ.
    function equilibrium(lam, which) {
      let F = 1.5;
      for (let outer = 0; outer < 100; outer++) {
        const r = pass(lam, F);
        if (!r) return null;
        const Ft = which === "m" ? r.Fm : r.Ff;
        if (!isFinite(Ft) || Ft <= 0) return null;
        if (Math.abs(Ft - F) < 1e-6) return { F: Ft, Fm: r.Fm, Ff: r.Ff };
        F = 0.5 * F + 0.5 * Ft; // relaxation for stability
      }
      const r = pass(lam, F);
      return r ? { F, Fm: r.Fm, Ff: r.Ff } : null;
    }

    // Sweep λ, record F_m and F_f, and locate the crossing F_m = F_f.
    const lambdas = [-0.3, -0.2, -0.1, 0, 0.1, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6];
    const curve = [];
    for (const lam of lambdas) {
      const m = equilibrium(lam, "m");
      const f = equilibrium(lam, "f");
      if (m && f) curve.push({ lambda: lam, fm: m.F, ff: f.F });
    }
    if (curve.length < 2) return null;

    // Interpolate λ* at the sign change of (F_m − F_f); if the crossing lies
    // outside the swept range, fall back to the λ of closest approach.
    let lamStar = null;
    for (let i = 0; i < curve.length - 1; i++) {
      const g0 = curve[i].fm - curve[i].ff;
      const g1 = curve[i + 1].fm - curve[i + 1].ff;
      if (g0 === 0) { lamStar = curve[i].lambda; break; }
      if (g0 * g1 < 0) {
        const t = g0 / (g0 - g1);
        lamStar = curve[i].lambda + t * (curve[i + 1].lambda - curve[i].lambda);
        break;
      }
    }
    let crossed = lamStar !== null;
    if (lamStar === null) {
      let bestGap = Infinity;
      for (const pt of curve) {
        const gap = Math.abs(pt.fm - pt.ff);
        if (gap < bestGap) { bestGap = gap; lamStar = pt.lambda; }
      }
    }
    if (lamStar === null) return null;

    const sol = equilibrium(lamStar, "m");
    const solF = equilibrium(lamStar, "f");
    if (!sol || !solF) return null;
    return {
      fos: 0.5 * (sol.F + solF.F),
      lambda: lamStar,
      fm: sol.F,
      ff: solF.F,
      residual: Math.abs(sol.F - solF.F),
      crossed,
      curve
    };
  }

  // Evaluate one explicit circle by the named method. Returns an object with
  // {fos, slices, xc, yc, R, ...method extras} or null.
  function evalCircle(p, prof, xc, yc, R, method, nSlices) {
    const built = buildSlices(p, prof, xc, yc, R, nSlices);
    if (!built) return null;
    const slices = built.slices;
    const c = p.c, phi = p.phi * Math.PI / 180;
    if (method === "fellenius") {
      const fos = felleniusFoS(slices, c, phi);
      return fos != null ? { fos, slices, xc, yc, R } : null;
    }
    if (method === "spencer") {
      const sp = spencerSolve(slices, c, phi);
      return sp ? { fos: sp.fos, slices, xc, yc, R, lambda: sp.lambda, curve: sp.curve, fm: sp.fm, ff: sp.ff, residual: sp.residual } : null;
    }
    const fos = bishopFoS(slices, c, phi); // default Bishop
    return fos != null ? { fos, slices, xc, yc, R } : null;
  }

  // Back-compatible single-circle factor of safety (used by benchmarks).
  function circleFoS(p, prof, xc, yc, R, method, nSlices) {
    return evalCircle(p, prof, xc, yc, R, method, nSlices);
  }

  // Centre of the circle of radius R through two surface points E, X, placed
  // above the chord so the lower arc dips into the slope. Returns {xc, yc}.
  function circleThrough(E, X, R) {
    const mx = (E.x + X.x) / 2, my = (E.y + X.y) / 2;
    const dx = X.x - E.x, dy = X.y - E.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6 || R < d / 2) return null;
    const off = Math.sqrt(R * R - (d / 2) * (d / 2));
    // Upward unit perpendicular to the chord.
    let px = -dy / d, py = dx / d;
    if (py < 0) { px = -px; py = -py; }
    return { xc: mx + off * px, yc: my + off * py };
  }

  // Choose the critical circle from a set of ranked candidates. For Bishop and
  // Fellenius the most-critical candidate is evaluated directly. Spencer can be
  // ill-conditioned on deep high-uplift circles (negative base normals), so we
  // walk candidates in order of criticality and report Spencer on the most
  // critical circle where it genuinely converges.
  function pickCritical(candidates, p, prof, method, nSlices) {
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.fos - b.fos);
    if (method === "spencer") {
      const lim = Math.min(candidates.length, 60);
      for (let i = 0; i < lim; i++) {
        const c = candidates[i];
        const res = evalCircle(p, prof, c.xc, c.yc, c.R, "spencer", nSlices);
        if (res) return res;
      }
      return null; // no circle in the search set has a valid Spencer solution
    }
    const c = candidates[0];
    return evalCircle(p, prof, c.xc, c.yc, c.R, method, nSlices);
  }

  // Entry-and-exit slip-surface search. entry/exit are {x0, x1, n}; nR radius
  // increments span each chord. Returns {best, trials, prof}.
  function entryExitSearch(p, opts) {
    const prof = groundProfile(p);
    const method = p.method, nSlices = p.nslices;
    const e = opts.entry, x = opts.exit, nR = Math.max(3, opts.nR | 0 || 10);
    const ne = Math.max(2, e.n | 0 || 5), nx = Math.max(2, x.n | 0 || 5);
    const Hspan = prof[0].y;
    const rankMethod = method === "spencer" ? "bishop" : method; // rank cheaply
    const trials = [];
    for (let i = 0; i < ne; i++) {
      const ex = e.x0 + (e.x1 - e.x0) * (ne === 1 ? 0 : i / (ne - 1));
      const E = { x: ex, y: surfaceY(prof, ex) };
      for (let j = 0; j < nx; j++) {
        const xx = x.x0 + (x.x1 - x.x0) * (nx === 1 ? 0 : j / (nx - 1));
        if (xx <= ex + 1) continue;
        const X = { x: xx, y: surfaceY(prof, xx) };
        const chord = Math.hypot(X.x - E.x, X.y - E.y);
        const rMin = chord / 2 * 1.02, rMax = chord / 2 + 3 * Hspan;
        for (let k = 0; k < nR; k++) {
          const R = rMin + (rMax - rMin) * k / (nR - 1);
          const cen = circleThrough(E, X, R);
          if (!cen) continue;
          const res = evalCircle(p, prof, cen.xc, cen.yc, R, rankMethod, nSlices);
          if (res && isFinite(res.fos) && res.fos > 0.1 && res.fos < 20) {
            trials.push({ xc: cen.xc, yc: cen.yc, R, fos: res.fos });
          }
        }
      }
    }
    const best = pickCritical(trials, p, prof, method, nSlices);
    return { best, trials, prof, toeX: prof[2].x };
  }

  // Grid search for the critical (minimum FoS) circle.
  function gridSearch(p) {
    const prof = groundProfile(p);
    const toeX = prof[2].x;
    const method = p.method, nSlices = p.nslices, g = p.grid;
    const rankMethod = method === "spencer" ? "bishop" : method;

    const cx0 = p.crest * 0.3, cx1 = toeX + p.toe * 0.3;
    const cy0 = p.H * 1.0, cy1 = p.H * 2.6;

    const candidates = [];
    for (let i = 0; i < g; i++) {
      for (let j = 0; j < g; j++) {
        const xc = cx0 + (cx1 - cx0) * i / (g - 1);
        const yc = cy0 + (cy1 - cy0) * j / (g - 1);
        const rMin = yc - p.H * 0.9, rMax = yc + p.H * 0.4, nR = 10;
        for (let k = 0; k < nR; k++) {
          const R = rMin + (rMax - rMin) * k / (nR - 1);
          if (R <= 1) continue;
          const res = evalCircle(p, prof, xc, yc, R, rankMethod, nSlices);
          if (res && isFinite(res.fos) && res.fos > 0.1 && res.fos < 20) {
            candidates.push({ xc, yc, R, fos: res.fos });
          }
        }
      }
    }
    const best = pickCritical(candidates, p, prof, method, nSlices);
    return { prof, best, toeX };
  }

  // Top-level dispatch: entry/exit when requested & configured, else grid.
  function analyze(p) {
    if (p.search === "entryexit" && p.entry && p.exit) {
      return entryExitSearch(p, { entry: p.entry, exit: p.exit, nR: p.nR });
    }
    return gridSearch(p);
  }

  // ---- Fixed-circle evaluation and analytical reference cases ----

  function foSForCircle(p, xc, yc, R, nSlices) {
    const prof = groundProfile(p);
    const n = nSlices || p.nslices || 30;
    const fel = evalCircle(p, prof, xc, yc, R, "fellenius", n);
    const bis = evalCircle(p, prof, xc, yc, R, "bishop", n);
    return {
      fellenius: fel ? fel.fos : null,
      bishop: bis ? bis.fos : null,
      slices: fel ? fel.slices : (bis ? bis.slices : null)
    };
  }

  // Spencer factor of safety and λ for one explicit circle (benchmarks/UI).
  function spencerForCircle(p, xc, yc, R, nSlices) {
    const prof = groundProfile(p);
    const n = nSlices || p.nslices || 30;
    const built = buildSlices(p, prof, xc, yc, R, n);
    if (!built) return null;
    return spencerSolve(built.slices, p.c, p.phi * Math.PI / 180);
  }

  // Bishop FoS at a given F-independent check against Spencer's moment eq at
  // λ = 0 (they must coincide for a circular surface — a verification hook).
  function bishopForCircle(p, xc, yc, R, nSlices) {
    const prof = groundProfile(p);
    const n = nSlices || p.nslices || 30;
    const built = buildSlices(p, prof, xc, yc, R, n);
    if (!built) return null;
    return bishopFoS(built.slices, p.c, p.phi * Math.PI / 180);
  }

  // Ordinary (Fellenius) factor of safety for an infinite (planar) slope,
  // computed with the general method-of-slices summation on a surface parallel
  // to the slope face. For identical slices this equals the closed form
  //   F = (c' + (γ·z·cos²β − u)·tanφ') / (γ·z·sinβ·cosβ).
  function planarFellenius(c, phiDeg, gamma, z, betaDeg, ru, n) {
    const phi = phiDeg * Math.PI / 180, beta = betaDeg * Math.PI / 180;
    const b = 1, N = n || 10;
    let num = 0, den = 0;
    for (let i = 0; i < N; i++) {
      const alpha = beta, h = z;
      const W = gamma * h * b, u = ru * gamma * h, dl = b / Math.cos(alpha);
      num += c * dl + Math.max(0, W * Math.cos(alpha) - u * dl) * Math.tan(phi);
      den += W * Math.sin(alpha);
    }
    return num / den;
  }

  function infiniteSlopeClosedForm(c, phiDeg, gamma, z, betaDeg, ru) {
    const phi = phiDeg * Math.PI / 180, beta = betaDeg * Math.PI / 180;
    const u = ru * gamma * z;
    return (c + (gamma * z * Math.cos(beta) * Math.cos(beta) - u) * Math.tan(phi)) /
           (gamma * z * Math.sin(beta) * Math.cos(beta));
  }

  global.Slope = {
    analyze, groundProfile, surfaceY, piezoY,
    foSForCircle, spencerForCircle, bishopForCircle,
    entryExitSearch, circleThrough,
    planarFellenius, infiniteSlopeClosedForm
  };
})(typeof window !== "undefined" ? window : globalThis);
