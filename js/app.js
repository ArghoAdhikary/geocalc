/* app.js — UI wiring, canvas rendering, and the action applier used by the AI bar. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value);

  // ---------------- Analysis switching (ribbon tabs + project tree) ----------------
  let current = "slope";
  const TITLE = { slope: "Slope stability", seep: "Seepage", sigma: "Stress–deformation", consolidation: "Consolidation", dynamics: "Dynamics / site response", thermal: "Thermal", flow3d: "3D flow", prob: "Probabilistic", materials: "Materials library", validation: "Validation" };
  const statusStore = {};
  function setStatus(mod, main, right) {
    statusStore[mod] = { main, right: right || "" };
    if (mod === current) { $("status_main").textContent = main; $("status_right").textContent = right || ""; }
  }
  function restoreStatus(mod) {
    const s = statusStore[mod];
    $("status_main").textContent = s ? s.main : TITLE[mod];
    $("status_right").textContent = s ? s.right : "";
  }
  function switchTo(mod) {
    current = mod;
    document.querySelectorAll(".rtab").forEach(t => t.classList.toggle("active", t.dataset.tab === mod));
    document.querySelectorAll(".tnode.child").forEach(t => t.classList.toggle("active", t.dataset.tab === mod));
    document.querySelectorAll(".propset").forEach(s => s.classList.toggle("active", s.id === "props-" + mod));
    document.querySelectorAll(".vp").forEach(v => v.classList.toggle("active", v.id === "vp-" + mod));
    restoreStatus(mod);
    if (typeof onViewChanged === "function") onViewChanged(mod);
    requestAnimationFrame(() => { if (last[mod]) draw[mod](last[mod]); });
  }
  document.querySelectorAll(".rtab, .tnode.child").forEach(t => t.addEventListener("click", () => switchTo(t.dataset.tab)));

  // ---------------- Canvas helpers ----------------
  function fitCanvas(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  }
  // Blue -> cyan -> yellow -> red colour ramp, t in [0,1].
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    const stops = [[46,109,202], [55,201,154], [224,179,65], [229,96,77]];
    const seg = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(seg));
    const f = seg - i;
    const a = stops[i], b = stops[i + 1];
    return `rgb(${Math.round(a[0]+(b[0]-a[0])*f)},${Math.round(a[1]+(b[1]-a[1])*f)},${Math.round(a[2]+(b[2]-a[2])*f)})`;
  }

  const last = {};   // last result per module
  const draw = {};   // draw function per module

  // ---------------- SLOPE ----------------
  function parsePiezo(text) {
    return (text || "").split(/\n+/).map(line => {
      const m = line.split(/[,\s]+/).map(Number).filter(v => !Number.isNaN(v));
      return m.length >= 2 ? { x: m[0], y: m[1] } : null;
    }).filter(Boolean).sort((a, b) => a.x - b.x);
  }
  function readSlope() {
    return {
      H: num("s_H"), beta: num("s_beta"), crest: num("s_crest"), toe: num("s_toe"),
      gamma: num("s_gamma"), c: num("s_c"), phi: num("s_phi"), ru: num("s_ru"),
      method: $("s_method").value, nslices: num("s_nslices"), grid: num("s_grid"),
      search: $("s_search").value,
      entry: { x0: num("s_e0"), x1: num("s_e1"), n: num("s_een") },
      exit: { x0: num("s_x0"), x1: num("s_x1"), n: num("s_een") },
      nR: num("s_enr"),
      porePressureMode: $("s_pp").value, wt: num("s_wt"),
      piezo: parsePiezo($("s_piezo").value), gammaW: 9.81
    };
  }
  const SLOPE_METHOD_LABEL = { bishop: "Bishop simplified", fellenius: "Fellenius (ordinary)", spencer: "Spencer" };
  function slopeMethodLabel(p) {
    const base = SLOPE_METHOD_LABEL[p.method] || p.method;
    return p.search === "entryexit" ? base + " · entry-and-exit" : base;
  }
  function runSlope() {
    const p = readSlope();
    const out = window.Slope.analyze(p);
    last.slope = { p, out };
    const r = $("s_result"), conv = $("s_conv");
    if (!out.best) {
      r.innerHTML = '<span class="muted">No valid slip surface found — adjust geometry or search ranges.</span>';
      conv.style.display = "none";
      setStatus("slope", "Slope stability — no valid slip surface"); draw.slope(last.slope); return;
    }
    const b = out.best, fos = b.fos;
    const cls = fos >= 1.5 ? "fos-good" : fos >= 1.2 ? "fos-warn" : "fos-bad";
    const verdict = fos >= 1.5 ? "Stable" : fos >= 1.2 ? "Marginal" : "Unsafe";
    const label = slopeMethodLabel(p);
    setStatus("slope", `Slope stability — FoS = ${fos.toFixed(3)} (${verdict})`, label);
    let extra = "";
    if (p.method === "spencer" && b.lambda != null) {
      extra = `<tr><td>Interslice λ*</td><td>${b.lambda.toFixed(3)}${b.crossed === false ? " (closest)" : ""}</td></tr>
               <tr><td>F (moment / force)</td><td>${b.fm.toFixed(3)} / ${b.ff.toFixed(3)}</td></tr>`;
    }
    r.innerHTML =
      `<div class="big ${cls}">FoS = ${fos.toFixed(3)}</div>
       <div class="muted">${verdict} · ${label} · critical circle</div>
       <table>
        <tr><td>Centre</td><td>(${b.xc.toFixed(1)}, ${b.yc.toFixed(1)}) m</td></tr>
        <tr><td>Radius</td><td>${b.R.toFixed(1)} m</td></tr>
        <tr><td>Slices used</td><td>${b.slices.length}</td></tr>
        ${extra}
       </table>`;
    disclaim("slope", "s_result");
    // Spencer convergence plot (moment vs force factor of safety against λ).
    if (p.method === "spencer" && b.curve && b.curve.length > 1) {
      conv.style.display = "";
      conv.innerHTML = `<div class="muted" style="margin-bottom:4px">Convergence — factor of safety vs interslice-force ratio λ</div>` + convergenceSVG(b.curve, b.lambda, b.fos);
    } else { conv.style.display = "none"; }
    draw.slope(last.slope);
  }
  // Inline SVG of the Spencer F_m and F_f curves vs λ, with the solution marked.
  function convergenceSVG(curve, lamStar, fStar) {
    const W = 260, H = 150, pl = 36, pb = 22, pt = 8, pr = 8;
    const xs = curve.map(c => c.lambda);
    const ys = curve.map(c => c.fm).concat(curve.map(c => c.ff));
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    let y0 = Math.min(...ys), y1 = Math.max(...ys); const pad = (y1 - y0) * 0.1 || 0.1; y0 -= pad; y1 += pad;
    const sx = v => pl + (v - x0) / (x1 - x0 || 1) * (W - pl - pr);
    const sy = v => (H - pb) - (v - y0) / (y1 - y0 || 1) * (H - pt - pb);
    const path = key => curve.map((c, i) => (i ? "L" : "M") + sx(c.lambda).toFixed(1) + "," + sy(c[key]).toFixed(1)).join(" ");
    const ticksY = [y0, (y0 + y1) / 2, y1].map(v => `<text x="2" y="${(sy(v) + 3).toFixed(1)}" font-size="8" fill="var(--muted,#789)">${v.toFixed(2)}</text>`).join("");
    const zeroX = (x0 <= 0 && x1 >= 0) ? `<line x1="${sx(0)}" y1="${pt}" x2="${sx(0)}" y2="${H - pb}" stroke="var(--border,#345)" stroke-dasharray="2 2"/>` : "";
    const mark = (lamStar != null && fStar != null) ? `<circle cx="${sx(lamStar).toFixed(1)}" cy="${sy(fStar).toFixed(1)}" r="3.5" fill="#e5604d"/>` : "";
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:300px">
      <rect x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}" fill="none" stroke="var(--border,#345)"/>
      ${zeroX}
      <path d="${path('fm')}" fill="none" stroke="#8a5a2b" stroke-width="1.6"/>
      <path d="${path('ff')}" fill="none" stroke="#1f6fd0" stroke-width="1.6"/>
      ${mark}
      ${ticksY}
      <text x="${(pl + (W - pr)) / 2}" y="${H - 4}" font-size="8" text-anchor="middle" fill="var(--muted,#789)">λ</text>
      <text x="${W - pr - 2}" y="${pt + 10}" font-size="8" text-anchor="end" fill="#8a5a2b">moment</text>
      <text x="${W - pr - 2}" y="${pt + 20}" font-size="8" text-anchor="end" fill="#1f6fd0">force</text>
    </svg>`;
  }
  draw.slope = ({ p, out }) => {
    const { ctx, w, h } = fitCanvas($("s_canvas"));
    ctx.clearRect(0, 0, w, h);
    const prof = out.prof;
    const xMax = prof[prof.length - 1].x, yMax = p.H * 2.6;
    const pad = 40;
    const sx = x => pad + (x / xMax) * (w - 2 * pad);
    const sy = y => (h - pad) - (y / yMax) * (h - 2 * pad);

    // soil body
    ctx.fillStyle = "#e7dcc2";
    ctx.beginPath();
    ctx.moveTo(sx(prof[0].x), sy(0));
    prof.forEach(pt => ctx.lineTo(sx(pt.x), sy(pt.y)));
    ctx.lineTo(sx(prof[prof.length - 1].x), sy(0));
    ctx.closePath(); ctx.fill();
    // ground line
    ctx.strokeStyle = "#5b4a2e"; ctx.lineWidth = 2;
    ctx.beginPath(); prof.forEach((pt, i) => i ? ctx.lineTo(sx(pt.x), sy(pt.y)) : ctx.moveTo(sx(pt.x), sy(pt.y))); ctx.stroke();

    // trial-surface fan (entry-and-exit search): faint arcs below the ground.
    if (out.trials && out.trials.length) {
      ctx.strokeStyle = "rgba(31,111,208,.10)"; ctx.lineWidth = 1;
      const step = Math.max(1, Math.floor(out.trials.length / 300));
      for (let t = 0; t < out.trials.length; t += step) {
        const tr = out.trials[t];
        ctx.beginPath(); let st = false;
        for (let x = tr.xc - tr.R; x <= tr.xc + tr.R; x += (2 * tr.R) / 120) {
          const dx = x - tr.xc; if (Math.abs(dx) > tr.R) continue;
          const yy = tr.yc - Math.sqrt(tr.R * tr.R - dx * dx);
          if (yy > window.Slope.surfaceY(prof, x) + 0.01) { st = false; continue; }
          if (!st) { ctx.moveTo(sx(x), sy(yy)); st = true; } else ctx.lineTo(sx(x), sy(yy));
        }
        ctx.stroke();
      }
    }

    // water table / piezometric line (dashed blue).
    let waterLine = null;
    if (p.porePressureMode === "watertable") waterLine = [{ x: 0, y: p.wt }, { x: prof[prof.length - 1].x, y: p.wt }];
    else if (p.porePressureMode === "piezometric" && p.piezo && p.piezo.length >= 2) waterLine = p.piezo;
    if (waterLine) {
      ctx.save(); ctx.strokeStyle = "#1f6fd0"; ctx.lineWidth = 1.6; ctx.setLineDash([6, 4]);
      ctx.beginPath();
      waterLine.forEach((pt, i) => i ? ctx.lineTo(sx(pt.x), sy(pt.y)) : ctx.moveTo(sx(pt.x), sy(pt.y)));
      ctx.stroke(); ctx.restore();
    }

    if (out.best) {
      const b = out.best;
      // slice polygons
      ctx.strokeStyle = "rgba(31,111,208,.30)"; ctx.lineWidth = 1;
      for (const s of b.slices) {
        const xl = s.xm - s.b / 2, xr = s.xm + s.b / 2;
        const blY = l => b.yc - Math.sqrt(Math.max(0, b.R*b.R - (l-b.xc)*(l-b.xc)));
        ctx.beginPath();
        ctx.moveTo(sx(xl), sy(window.Slope.surfaceY(prof, xl)));
        ctx.lineTo(sx(xr), sy(window.Slope.surfaceY(prof, xr)));
        ctx.lineTo(sx(xr), sy(blY(xr)));
        ctx.lineTo(sx(xl), sy(blY(xl)));
        ctx.closePath(); ctx.stroke();
      }
      // critical circle arc
      ctx.strokeStyle = "#e5604d"; ctx.lineWidth = 2.5;
      ctx.beginPath();
      let started = false;
      for (let x = b.xc - b.R; x <= b.xc + b.R; x += (2 * b.R) / 240) {
        const dx = x - b.xc; if (Math.abs(dx) > b.R) continue;
        const yy = b.yc - Math.sqrt(b.R*b.R - dx*dx);
        if (yy > window.Slope.surfaceY(prof, x) + 0.01) { started = false; continue; }
        if (!started) { ctx.moveTo(sx(x), sy(yy)); started = true; } else ctx.lineTo(sx(x), sy(yy));
      }
      ctx.stroke();
      // centre marker
      ctx.fillStyle = "#e0b341";
      ctx.beginPath(); ctx.arc(sx(b.xc), sy(b.yc), 4, 0, 7); ctx.fill();
    }
  };

  // ---------------- SEEP ----------------
  function readSeep() {
    return {
      W: num("p_W"), D: num("p_D"), nx: num("p_nx"),
      hu: num("p_hu"), hd: num("p_hd"), k: num("p_k"),
      wall_on: $("p_wall_on").checked, wall_x: num("p_wall_x"), wall_d: num("p_wall_d")
    };
  }
  function runSeep() {
    const p = readSeep();
    if ($("p_transient") && $("p_transient").checked) { runSeepTransient(p); return; }
    const s = window.Seep.solve(p);
    last.seep = { p, s };
    $("p_result").innerHTML =
      `<div class="big">${(s.q).toFixed(3)} <span class="muted" style="font-size:14px">m³/day/m</span></div>
       <div class="muted">Seepage flow through the section</div>
       <table>
        <tr><td>Head drop</td><td>${(p.hu - p.hd).toFixed(1)} m</td></tr>
        <tr><td>Max gradient</td><td>${s.maxGrad.toFixed(3)}</td></tr>
        <tr><td>Exit gradient</td><td>${s.exitGrad.toFixed(3)}</td></tr>
        <tr><td>Grid</td><td>${s.nx}×${s.ny}</td></tr>
       </table>`;
    setStatus("seep", `Seepage — flow q = ${s.q.toFixed(3)} m³/day/m`, `exit gradient ${s.exitGrad.toFixed(3)}`);
    disclaim("seep", "p_result");
    draw.seep(last.seep);
  }
  draw.seep = ({ p, s }) => {
    const { ctx, w, h } = fitCanvas($("p_canvas"));
    ctx.clearRect(0, 0, w, h);
    const pad = 36;
    const cw = (w - 2 * pad) / s.nx, ch = (h - 2 * pad) / s.ny;
    const span = (s.hMax - s.hMin) || 1;
    // head field cells
    for (let j = 0; j < s.ny; j++) {
      for (let i = 0; i < s.nx; i++) {
        const vals = [j*s.NX+i, j*s.NX+i+1, (j+1)*s.NX+i, (j+1)*s.NX+i+1];
        if (vals.some(n => !s.active[n])) { ctx.fillStyle = "#39414c"; }
        else {
          const hv = (s.h[vals[0]] + s.h[vals[1]] + s.h[vals[2]] + s.h[vals[3]]) / 4;
          ctx.fillStyle = ramp((hv - s.hMin) / span);
        }
        const px = pad + i * cw, py = pad + (s.ny - 1 - j) * ch;
        ctx.fillRect(px, py, cw + 0.6, ch + 0.6);
      }
    }
    // equipotential contours
    ctx.strokeStyle = "rgba(255,255,255,.28)"; ctx.lineWidth = 1;
    const levels = 12;
    for (let L = 1; L < levels; L++) {
      const target = s.hMin + span * L / levels;
      for (let j = 0; j < s.ny; j++) for (let i = 0; i < s.nx; i++) {
        const n = j*s.NX+i, nr = j*s.NX+i+1;
        if (!s.active[n] || !s.active[nr]) continue;
        const a = s.h[n], b = s.h[nr];
        if ((a - target) * (b - target) < 0) {
          const f = (target - a) / (b - a);
          const px = pad + (i + f) * cw, py = pad + (s.ny - 1 - j) * ch;
          ctx.fillStyle = "rgba(255,255,255,.3)";
          ctx.fillRect(px, py, 1.2, ch);
        }
      }
    }
    // cutoff wall
    if (p.wall_on) {
      ctx.fillStyle = "#0a0e13"; ctx.strokeStyle = "#8b9bab";
      const wx = pad + s.wallI * cw;
      const wy = pad, wh = s.wallRows * ch;
      ctx.fillRect(wx - 2, wy, 4, wh); ctx.strokeRect(wx - 2, wy, 4, wh);
    }
    legend($("p_canvas").parentElement, "Total head", `${s.hMin.toFixed(1)} m`, `${s.hMax.toFixed(1)} m`);
  };

  // ---------------- SIGMA ----------------
  function readSigma() {
    return {
      W: num("g_W"), H: num("g_H"), nx: num("g_nx"),
      E: num("g_E"), nu: num("g_nu"), gamma: num("g_gamma"),
      q: num("g_q"), qw: num("g_qw"), field: $("g_field").value
    };
  }
  function runSigma() {
    const p = readSigma();
    const m = window.Sigma.run(p);
    last.sigma = { p, m };
    const field = p.field === "uy" ? m.uy : p.field === "sy" ? m.sy : m.sx;
    let lo = Infinity, hi = -Infinity;
    for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v; }
    $("g_result").innerHTML =
      `<div class="big">${(m.maxSettle * 1000).toFixed(1)} <span class="muted" style="font-size:14px">mm</span></div>
       <div class="muted">Maximum settlement</div>
       <table>
        <tr><td>Max σ<sub>y</sub></td><td>${Math.min(...m.sy).toFixed(0)} kPa</td></tr>
        <tr><td>Nodes / elements</td><td>${m.NX*m.NY} / ${m.tris.length}</td></tr>
       </table>`;
    setStatus("sigma", `Stress–deformation — max settlement ${(m.maxSettle*1000).toFixed(1)} mm`, `${m.tris.length} elements`);
    disclaim("sigma", "g_result");
    draw.sigma(last.sigma);
  }
  draw.sigma = ({ p, m }) => {
    const { ctx, w, h } = fitCanvas($("g_canvas"));
    ctx.clearRect(0, 0, w, h);
    const pad = 44;
    const sx0 = x => pad + (x / m.W) * (w - 2 * pad);
    const sy0 = y => (h - pad) - (y / m.H) * (h - 2 * pad);
    // For settlement, colour by downward magnitude (-uy) so the most-settled
    // zone reads warm and the fixed base reads cool. Stresses stay signed.
    const raw = p.field === "uy" ? m.uy : p.field === "sy" ? m.sy : m.sx;
    const field = p.field === "uy" ? raw.map(v => -v) : raw;
    let lo = Infinity, hi = -Infinity;
    for (const v of field) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = (hi - lo) || 1;
    // deformation scale so the largest displacement is visible
    const scale = m.maxSettle > 1e-9 ? (0.12 * m.H / m.maxSettle) : 0;
    const dx = n => m.X[n] + m.ux[n] * scale;
    const dy = n => m.Y[n] + m.uy[n] * scale;

    for (const t of m.tris) {
      const [a, b, c] = t;
      const v = (field[a] + field[b] + field[c]) / 3;
      ctx.fillStyle = ramp((v - lo) / span);
      ctx.beginPath();
      ctx.moveTo(sx0(dx(a)), sy0(dy(a)));
      ctx.lineTo(sx0(dx(b)), sy0(dy(b)));
      ctx.lineTo(sx0(dx(c)), sy0(dy(c)));
      ctx.closePath(); ctx.fill();
    }
    // mesh lines
    ctx.strokeStyle = "rgba(0,0,0,.18)"; ctx.lineWidth = 0.5;
    for (const t of m.tris) {
      const [a, b, c] = t;
      ctx.beginPath();
      ctx.moveTo(sx0(dx(a)), sy0(dy(a)));
      ctx.lineTo(sx0(dx(b)), sy0(dy(b)));
      ctx.lineTo(sx0(dx(c)), sy0(dy(c)));
      ctx.closePath(); ctx.stroke();
    }
    // surcharge arrows
    if (p.q > 0 && p.qw > 0) {
      ctx.fillStyle = "#e5604d"; ctx.strokeStyle = "#e5604d"; ctx.lineWidth = 2;
      const x0 = (m.W - p.qw) / 2, x1 = (m.W + p.qw) / 2;
      for (let x = x0; x <= x1 + 1e-6; x += p.qw / 6) {
        const px = sx0(x), py = sy0(m.H) - 18;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + 12); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(px - 3, py + 7); ctx.lineTo(px, py + 13); ctx.lineTo(px + 3, py + 7); ctx.fill();
      }
    }
    const label = p.field === "uy" ? "Settlement" : p.field === "sy" ? "σy (kPa)" : "σx (kPa)";
    legend($("g_canvas").parentElement, label,
      p.field === "uy" ? `${(lo*1000).toFixed(1)} mm` : `${lo.toFixed(0)}`,
      p.field === "uy" ? `${(hi*1000).toFixed(1)} mm` : `${hi.toFixed(0)}`);
  };

  // shared legend box
  function legend(container, title, loLabel, hiLabel) {
    let box = container.querySelector(".legend-box");
    if (!box) { box = document.createElement("div"); box.className = "legend-box"; container.appendChild(box); }
    const grad = "linear-gradient(to right,rgb(46,109,202),rgb(55,201,154),rgb(224,179,65),rgb(229,96,77))";
    box.innerHTML = `<div>${title}</div><div class="bar" style="background:${grad}"></div>
      <div class="row"><span>${loLabel}</span><span>${hiLabel}</span></div>`;
  }

  // ---------------- CONSOLIDATION (Phase C) ----------------
  function readConsol() {
    return { H: num("c_H"), cv: num("c_cv"), u0: num("c_u0"), drainage: $("c_drain").value, tEnd: num("c_tEnd"), nz: num("c_nz") };
  }
  function runConsolidation() {
    const p = readConsol();
    const Co = window.Consolidation;
    const Hdr = p.drainage === "single" ? p.H : p.H / 2;
    const N = 24, series = [];
    for (let i = 1; i <= N; i++) {
      const t = p.tEnd * i / N;
      const r = Co.solve1D({ H: p.H, cv: p.cv, u0: p.u0, nz: p.nz, drainage: p.drainage, tEnd: t, dt: t / 120 });
      series.push({ t, Tv: r.Tv, U: r.U });
    }
    const final = series[series.length - 1];
    last.consolidation = { p, series, final };
    $("c_result").innerHTML =
      `<div class="big">${(final.U * 100).toFixed(1)}% <span class="muted" style="font-size:14px">consolidation</span></div>
       <div class="muted">at t = ${p.tEnd} yr · T<sub>v</sub> = ${final.Tv.toFixed(3)}</div>
       <table>
        <tr><td>Drainage path H<sub>dr</sub></td><td>${Hdr.toFixed(2)} m</td></tr>
        <tr><td>Terzaghi U(T<sub>v</sub>)</td><td>${(Co.terzaghiU(final.Tv) * 100).toFixed(1)}%</td></tr>
       </table>`;
    setStatus("consolidation", `Consolidation — U = ${(final.U * 100).toFixed(1)}% at t = ${p.tEnd} yr`, `Tv = ${final.Tv.toFixed(3)}`);
    disclaim("consolidation", "c_result");
    draw.consolidation(last.consolidation);
  }
  draw.consolidation = ({ series }) => {
    const { ctx, w, h } = fitCanvas($("c_canvas"));
    ctx.clearRect(0, 0, w, h);
    const pad = 54, TvMax = Math.max(0.05, ...series.map(s => s.Tv));
    const sx = tv => pad + (tv / TvMax) * (w - 2 * pad);
    const sy = U => (h - pad) - U * (h - 2 * pad);
    ctx.strokeStyle = "#c9d3de"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(pad, pad - 6); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
    // Terzaghi analytical curve
    ctx.strokeStyle = "#1f6fd0"; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= 120; i++) { const tv = TvMax * i / 120, U = window.Consolidation.terzaghiU(tv); i ? ctx.lineTo(sx(tv), sy(U)) : ctx.moveTo(sx(tv), sy(U)); }
    ctx.stroke();
    // numeric points
    ctx.fillStyle = "#e5604d";
    for (const s of series) { ctx.beginPath(); ctx.arc(sx(s.Tv), sy(s.U), 3.5, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#5f6d80"; ctx.font = "12px -apple-system,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Degree of consolidation — line: Terzaghi analytical · dots: numeric solver", pad, pad - 18);
    ctx.fillText("Tᵥ (time factor)", w - pad - 90, h - pad + 24);
    ctx.textAlign = "right";
    for (const U of [0, 0.25, 0.5, 0.75, 1]) { ctx.fillText((U * 100) + "%", pad - 8, sy(U) + 4); }
  };

  // ---------------- DYNAMICS / SITE RESPONSE (Phase D) ----------------
  function readDyn() { return { vs: num("d_vs"), H: num("d_H"), zeta: num("d_zeta") }; }
  function runDynamics() {
    const p = readDyn(), D = window.Dynamics;
    const r = D.sitePeakFrequency(p.vs, p.H, p.zeta);
    const curve = [], fmax = 4 * r.fundamental;
    for (let i = 0; i <= 200; i++) { const f = fmax * i / 200; curve.push({ f, amp: D.siteAmplification(f, p.vs, p.H, p.zeta) }); }
    last.dynamics = { p, curve, r };
    $("d_result").innerHTML =
      `<div class="big">${r.fundamental.toFixed(2)} <span class="muted" style="font-size:14px">Hz (f₁)</span></div>
       <div class="muted">Fundamental frequency V<sub>s</sub>/4H</div>
       <table><tr><td>Peak amplification</td><td>${r.peakAmplification.toFixed(1)}×</td></tr>
       <tr><td>Natural period</td><td>${(1 / r.fundamental).toFixed(2)} s</td></tr></table>`;
    setStatus("dynamics", `Site response — f₁ = ${r.fundamental.toFixed(2)} Hz`, `peak ${r.peakAmplification.toFixed(1)}×`);
    disclaim("dynamics", "d_result");
    draw.dynamics(last.dynamics);
  }
  draw.dynamics = ({ curve, r }) => {
    const { ctx, w, h } = fitCanvas($("d_canvas")); ctx.clearRect(0, 0, w, h);
    const pad = 54, fmax = Math.max(...curve.map(c => c.f)), ampMax = Math.max(...curve.map(c => c.amp)) * 1.1;
    const sx = f => pad + (f / fmax) * (w - 2 * pad), sy = a => (h - pad) - (a / ampMax) * (h - 2 * pad);
    ctx.strokeStyle = "#c9d3de"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, pad - 6); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
    ctx.strokeStyle = "#1f6fd0"; ctx.lineWidth = 2.5; ctx.beginPath();
    curve.forEach((c, i) => i ? ctx.lineTo(sx(c.f), sy(c.amp)) : ctx.moveTo(sx(c.f), sy(c.amp))); ctx.stroke();
    ctx.strokeStyle = "#e5604d"; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(sx(r.fundamental), pad - 6); ctx.lineTo(sx(r.fundamental), h - pad); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#5f6d80"; ctx.font = "12px -apple-system,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Site amplification |F| vs frequency — dashed: fundamental f₁ = Vs/4H", pad, pad - 18);
    ctx.fillText("frequency (Hz)", w - pad - 80, h - pad + 24);
  };

  // ---------------- THERMAL (Phase D) ----------------
  function readThermal() { return { L: num("t_L"), alpha: num("t_alpha"), Ti: num("t_Ti"), Ts: num("t_Ts"), tEnd: num("t_tEnd"), n: num("t_n") }; }
  function runThermal() {
    const p = readThermal(), Th = window.Thermal;
    const r = Th.transient1D(p);
    const analytic = []; for (let i = 0; i <= r.n; i++) analytic.push(Th.transientSeries(i * r.dz, p.tEnd, p.L, p.Ti, p.Ts, p.alpha));
    last.thermal = { p, r, analytic };
    const iMid = Math.round(r.n / 2);
    $("t_result").innerHTML =
      `<div class="big">${r.tempAt(iMid).toFixed(1)} <span class="muted" style="font-size:14px">°C mid-slab</span></div>
       <div class="muted">at t = ${p.tEnd} days</div>
       <table><tr><td>Analytical mid</td><td>${analytic[iMid].toFixed(1)} °C</td></tr>
       <tr><td>Cells</td><td>${r.n}</td></tr></table>`;
    setStatus("thermal", `Thermal — mid-slab ${r.tempAt(iMid).toFixed(1)} °C at t = ${p.tEnd} d`, `${r.n} cells`);
    disclaim("thermal", "t_result");
    draw.thermal(last.thermal);
  }
  draw.thermal = ({ p, r, analytic }) => {
    const { ctx, w, h } = fitCanvas($("t_canvas")); ctx.clearRect(0, 0, w, h);
    const pad = 54, Tmax = Math.max(p.Ti, p.Ts), Tmin = Math.min(p.Ti, p.Ts), span = (Tmax - Tmin) || 1;
    const sx = x => pad + (x / p.L) * (w - 2 * pad), sy = T => (h - pad) - ((T - Tmin) / span) * (h - 2 * pad);
    ctx.strokeStyle = "#c9d3de"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, pad - 6); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
    ctx.strokeStyle = "#1f6fd0"; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i <= r.n; i++) { const x = i * r.dz; i ? ctx.lineTo(sx(x), sy(analytic[i])) : ctx.moveTo(sx(x), sy(analytic[i])); } ctx.stroke();
    ctx.fillStyle = "#e5604d"; const stp = Math.max(1, Math.round(r.n / 30));
    for (let i = 0; i <= r.n; i += stp) { const x = i * r.dz; ctx.beginPath(); ctx.arc(sx(x), sy(r.tempAt(i)), 3, 0, 7); ctx.fill(); }
    ctx.fillStyle = "#5f6d80"; ctx.font = "12px -apple-system,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Temperature profile — line: analytical series · dots: numeric solver", pad, pad - 18);
    ctx.fillText("depth x (m)", w - pad - 70, h - pad + 24);
  };

  // ---------------- 3D FLOW (Phase E) ----------------
  function readFlow3d() { return { W: num("f3_W"), D: num("f3_D"), T: num("f3_T"), nx: num("f3_nx"), hu: num("f3_hu"), hd: num("f3_hd"), k: num("f3_k") }; }
  function runFlow3d() {
    const p = readFlow3d(), M = window.Mesh3D;
    const r = M.solveFlow3D(p), m = r.mesh;
    const kmid = Math.round(m.nz / 2), slice = r.sliceZ(kmid);
    last.flow3d = { p, r, slice, kmid };
    $("f3_result").innerHTML =
      `<div class="big">${(r.balanceError * 100).toFixed(3)}% <span class="muted" style="font-size:14px">balance error</span></div>
       <div class="muted">Mid-depth slice (z-plane ${kmid})</div>
       <table>
        <tr><td>Nodes / elements</td><td>${m.nNodes.toLocaleString()} / ${m.nElems.toLocaleString()}</td></tr>
        <tr><td>Grid</td><td>${m.nx}×${m.ny}×${m.nz}</td></tr>
        <tr><td>Head range</td><td>${r.hMin.toFixed(1)}–${r.hMax.toFixed(1)} m</td></tr>
       </table>`;
    setStatus("flow3d", `3D flow — balance error ${(r.balanceError * 100).toFixed(3)}%`, `${m.nNodes.toLocaleString()} nodes`);
    disclaim("flow3d", "f3_result");
    draw.flow3d(last.flow3d);
  }
  draw.flow3d = ({ r, slice }) => {
    const { ctx, w, h } = fitCanvas($("f3_canvas")); ctx.clearRect(0, 0, w, h);
    const m = r.mesh, pad = 36, cw = (w - 2 * pad) / m.nx, ch = (h - 2 * pad) / m.ny, span = (r.hMax - r.hMin) || 1;
    for (let j = 0; j < m.ny; j++) for (let i = 0; i < m.nx; i++) {
      const hv = (slice[j * m.NX + i] + slice[j * m.NX + i + 1] + slice[(j + 1) * m.NX + i] + slice[(j + 1) * m.NX + i + 1]) / 4;
      ctx.fillStyle = ramp((hv - r.hMin) / span);
      ctx.fillRect(pad + i * cw, pad + (m.ny - 1 - j) * ch, cw + 0.6, ch + 0.6);
    }
    ctx.fillStyle = "#5f6d80"; ctx.font = "12px -apple-system,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("3D head field — horizontal mid-depth slice", pad, pad - 14);
    legend($("f3_canvas").parentElement, "Total head", `${r.hMin.toFixed(1)} m`, `${r.hMax.toFixed(1)} m`);
  };

  // ---------------- PROBABILISTIC (Phase F) ----------------
  function readProb() { return { cStd: num("pr_cStd"), phiStd: num("pr_phiStd"), N: num("pr_N"), seed: num("pr_seed") }; }
  function runProb() {
    const sp = readSlope(), pr = readProb(), P = window.Probabilistic;
    const r = P.monteCarloSlope(sp, { cMean: sp.c, cStd: pr.cStd, phiMean: sp.phi, phiStd: pr.phiStd }, pr.N | 0, pr.seed | 0);
    if (!r) { $("pr_result").innerHTML = '<span class="muted">No valid critical surface for the mean parameters.</span>'; setStatus("prob", "Probabilistic — no surface"); return; }
    last.prob = { sp, pr, r };
    const cls = r.pf < 0.01 ? "fos-good" : r.pf < 0.05 ? "fos-warn" : "fos-bad";
    $("pr_result").innerHTML =
      `<div class="big ${cls}">${(r.pf * 100).toFixed(1)}% <span class="muted" style="font-size:14px">P(failure)</span></div>
       <div class="muted">P(FoS &lt; 1) · ${r.n} samples · seed ${pr.seed}</div>
       <table>
        <tr><td>Mean FoS</td><td>${r.mean.toFixed(3)}</td></tr>
        <tr><td>Std. dev.</td><td>${r.std.toFixed(3)}</td></tr>
        <tr><td>Reliability index β</td><td>${isFinite(r.beta) ? r.beta.toFixed(2) : "—"}</td></tr>
       </table>`;
    setStatus("prob", `Probabilistic — P(failure) = ${(r.pf * 100).toFixed(1)}%`, `β = ${isFinite(r.beta) ? r.beta.toFixed(2) : "—"}`);
    disclaim("prob", "pr_result");
    draw.prob(last.prob);
  }
  draw.prob = ({ r }) => {
    const { ctx, w, h } = fitCanvas($("pr_canvas")); ctx.clearRect(0, 0, w, h);
    const pad = 54, nb = 30, lo = Math.min(r.min, 0.6), hi = Math.max(r.max, 1.4), bw = (hi - lo) / nb;
    const bins = new Array(nb).fill(0);
    for (const f of r.fos) { let b = Math.floor((f - lo) / bw); b = Math.max(0, Math.min(nb - 1, b)); bins[b]++; }
    const maxB = Math.max.apply(null, bins) || 1;
    const sx = v => pad + ((v - lo) / (hi - lo)) * (w - 2 * pad), sy = c => (h - pad) - (c / maxB) * (h - 2 * pad);
    ctx.strokeStyle = "#c9d3de"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(pad, pad - 6); ctx.lineTo(pad, h - pad); ctx.lineTo(w - pad, h - pad); ctx.stroke();
    for (let i = 0; i < nb; i++) {
      const x0 = sx(lo + i * bw), x1 = sx(lo + (i + 1) * bw), fmid = lo + (i + 0.5) * bw;
      ctx.fillStyle = fmid < 1 ? "rgba(229,96,77,.78)" : "rgba(31,111,208,.65)";
      ctx.fillRect(x0, sy(bins[i]), Math.max(1, x1 - x0 - 1), (h - pad) - sy(bins[i]));
    }
    ctx.strokeStyle = "#e5604d"; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(sx(1), pad - 6); ctx.lineTo(sx(1), h - pad); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = "#5f6d80"; ctx.font = "12px -apple-system,sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Factor-of-safety distribution — red: FoS < 1 (failure) · dashed: FoS = 1", pad, pad - 18);
    ctx.fillText("Factor of safety", w - pad - 90, h - pad + 24);
  };

  // ---------------- Run buttons ----------------
  const RUN = { slope: runSlope, seep: runSeep, sigma: runSigma, consolidation: runConsolidation, dynamics: runDynamics, thermal: runThermal, flow3d: runFlow3d, prob: runProb };
  $("btn_compute").addEventListener("click", () => RUN[current]());
  $("btn_chat").addEventListener("click", () => document.body.classList.toggle("chat-hidden"));
  $("g_field").addEventListener("change", () => { if (last.sigma) draw.sigma(last.sigma); });

  // ---------------- Action applier (used by AI bar) ----------------
  window.GeoApp = {
    switchTo,
    getModule: () => current,
    apply(actions) {
      let ranModule = null;
      for (const a of actions) {
        if (a.kind === "switch") switchTo(a.module);
        else if (a.kind === "set") {
          const el = document.getElementById(a.id);
          if (!el) continue;
          if (el.type === "checkbox") el.checked = !!a.value;
          else el.value = a.value;
          el.dispatchEvent(new Event("change"));
        } else if (a.kind === "run") ranModule = a.module;
      }
      if (ranModule && RUN[ranModule]) { switchTo(ranModule); RUN[ranModule](); }
    }
  };

  // ---------------- Chat panel ----------------
  const log = $("chat_log"), cmd = $("chat_cmd");
  const PROV_NAME = { offline: "Offline", claude: "Claude", openai: "OpenAI", gemini: "Gemini", custom: "Custom" };

  function showEmptyState() {
    log.innerHTML = `<div class="chat-empty">
      <b>Tell me what to do</b>
      “set slope angle to 40, cohesion 5 and run”<br>
      “seepage: upstream head 18, add a 10 m cutoff wall, solve”<br>
      “sigma — surcharge 80 kPa over 8 m, show vertical stress”</div>`;
  }
  function addMsg(role, text, actions) {
    const empty = log.querySelector(".chat-empty"); if (empty) empty.remove();
    const el = document.createElement("div");
    el.className = "msg " + role;
    el.textContent = text;
    if (actions && actions.length) {
      const did = document.createElement("div"); did.className = "did";
      did.textContent = actions.map(summarize).filter(Boolean).join(" · ");
      if (did.textContent) el.appendChild(did);
    }
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  }
  function summarize(a) {
    const F = window.GeoAI.FIELDS;
    if (a.kind === "switch") return "→ " + a.module;
    if (a.kind === "run") return "ran " + a.module;
    if (a.kind === "set") return (F[a.id] ? F[a.id].names[0] : a.id) + " = " + a.value;
    return "";
  }

  let busy = false;
  async function sendCommand() {
    const text = cmd.value.trim();
    if (!text || busy) return;
    busy = true;
    addMsg("user", text);
    cmd.value = ""; cmd.style.height = "auto";
    const typing = document.createElement("div");
    typing.className = "typing"; typing.textContent = "…"; log.appendChild(typing);
    log.scrollTop = log.scrollHeight;
    try {
      const { actions, reply } = await window.GeoAI.interpret(text, current);
      window.GeoApp.apply(actions);
      typing.remove();
      addMsg("bot", reply, actions);
    } catch (e) {
      typing.remove();
      addMsg("bot err", "Error: " + e.message);
    } finally { busy = false; cmd.focus(); }
  }
  $("chat_send").addEventListener("click", sendCommand);
  cmd.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendCommand(); }
  });
  cmd.addEventListener("input", () => { cmd.style.height = "auto"; cmd.style.height = Math.min(120, cmd.scrollHeight) + "px"; });

  // collapse / reopen
  $("chat_collapse").addEventListener("click", () => document.body.classList.add("chat-hidden"));
  $("chat_launch").addEventListener("click", () => { document.body.classList.remove("chat-hidden"); cmd.focus(); });

  // provider label
  function refreshProvLabel() {
    const s = window.GeoAI.settings();
    const name = PROV_NAME[s.provider] || "Offline";
    $("chat_prov").textContent = (s.provider !== "offline" && !s.key) ? name + " (no key)" : name;
  }

  // ---------------- Settings dialog ----------------
  const dlg = $("ai_dialog");
  function syncRows() {
    const prov = $("ai_provider").value;
    $("row_key").style.display = prov === "offline" ? "none" : "flex";
    $("row_model").style.display = prov === "offline" ? "none" : "flex";
    $("row_base").style.display = prov === "custom" ? "flex" : "none";
    const notes = {
      offline: "No key needed. Understands common structured commands.",
      claude: "Get a key at console.anthropic.com. Default model: claude-opus-5-5 (or claude-haiku-5-5 for speed).",
      openai: "Get a key at platform.openai.com. Default model: gpt-4o-mini.",
      gemini: "Get a key at aistudio.google.com. Default model: gemini-2.0-flash.",
      custom: "Any OpenAI-compatible server (e.g. a local LLM). Give its base URL and model."
    };
    $("prov_note").textContent = notes[prov] || "";
    $("ai_model").placeholder = window.GeoAI.DEFAULT_MODEL[prov] || "model name";
  }
  $("chat_settings").addEventListener("click", () => {
    const s = window.GeoAI.settings();
    $("ai_provider").value = s.provider; $("ai_key").value = s.key;
    $("ai_model").value = s.model; $("ai_baseurl").value = s.baseUrl;
    syncRows(); dlg.showModal();
  });
  $("ai_provider").addEventListener("change", syncRows);
  $("ai_save").addEventListener("click", e => {
    e.preventDefault();
    window.GeoAI.saveSettings({
      provider: $("ai_provider").value,
      key: $("ai_key").value.trim(),
      model: $("ai_model").value.trim(),
      baseUrl: $("ai_baseurl").value.trim()
    });
    dlg.close();
    refreshProvLabel();
    const prov = $("ai_provider").value;
    addMsg("bot", prov === "offline" ? "Offline mode ready." : `${PROV_NAME[prov]} connected. Ask me anything in plain language.`);
  });

  showEmptyState();
  refreshProvLabel();

  // ================= Phase A: project, materials, capability maturity =================
  let project = window.Project ? Project.newProject() : null;
  let currentPath = null;

  function methodIdFor(mod) {
    if (mod === "slope") { const m = $("s_method").value; return m === "fellenius" ? "slope.fellenius" : m === "spencer" ? "slope.spencer" : "slope.bishop"; }
    if (mod === "seep") return ($("p_transient") && $("p_transient").checked) ? "seep.transient" : "seep.steady";
    if (mod === "sigma") return "sigma.elastic";
    if (mod === "consolidation") return "consolidation.terzaghi1d";
    if (mod === "dynamics") return "dynamic.site1d";
    if (mod === "thermal") return "thermal.transient";
    if (mod === "flow3d") return "flow3d.steady";
    if (mod === "prob") return "probabilistic.montecarlo";
    return null;
  }
  function setBadge(mod) {
    const el = document.getElementById("badge-" + mod);
    if (!el || !window.Capabilities) return;
    const c = Capabilities.byId(methodIdFor(mod));
    if (!c) { el.textContent = ""; return; }
    const m = Capabilities.maturityInfo(c.maturity);
    el.textContent = m.label; el.style.background = m.color;
  }
  function disclaim(mod, resultId) {
    const el = $(resultId); if (!el || !window.Capabilities) return;
    const old = el.querySelector(".disclaimer"); if (old) old.remove();
    const text = Capabilities.resultDisclaimer(methodIdFor(mod));
    if (text) { const d = document.createElement("div"); d.className = "disclaimer"; d.textContent = text; el.appendChild(d); }
  }
  function onViewChanged(mod) {
    const compute = $("btn_compute");
    if (mod === "materials" || mod === "validation") { compute.disabled = true; compute.style.opacity = .4; }
    else { compute.disabled = false; compute.style.opacity = 1; setBadge(mod); }
  }
  function syncSlopeRows() {
    if (!$("s_pp")) return;
    const mode = $("s_pp").value;
    $("s_ru_row").style.display = mode === "ru" ? "flex" : "none";
    $("s_wt_row").style.display = mode === "watertable" ? "flex" : "none";
    $("s_piezo_row").style.display = mode === "piezometric" ? "flex" : "none";
    const ee = $("s_search") && $("s_search").value === "entryexit";
    if ($("s_ee_rows")) $("s_ee_rows").style.display = ee ? "block" : "none";
    if ($("s_grid_row")) $("s_grid_row").style.display = ee ? "none" : "flex";
  }

  // ---- Materials library ----
  function matField(label, f, val) { return `<label>${label}<input type="number" data-f="${f}" value="${val}" step="any"></label>`; }
  function renderMaterials() {
    if (!project) return;
    const host = $("mat_table"); host.innerHTML = "";
    project.materials.forEach((mat, i) => {
      const row = document.createElement("div"); row.className = "mat-row";
      row.innerHTML =
        `<div class="mat-head"><input data-f="name" value="${mat.name}"><button class="mat-del" title="Delete">✕</button></div>
         <div class="mat-grid">
           ${matField("γ (kN/m³)", "gamma", mat.gamma)}${matField("c′ (kPa)", "c", mat.c)}
           ${matField("φ′ (°)", "phi", mat.phi)}${matField("E (MPa)", "E", mat.E)}
           ${matField("ν", "nu", mat.nu)}${matField("k (m/day)", "k", mat.k)}
         </div>`;
      row.querySelectorAll("input[data-f]").forEach(inp => inp.addEventListener("change", () => {
        const f = inp.dataset.f; mat[f] = f === "name" ? inp.value : parseFloat(inp.value);
        Project.bumpRevision(project); populateMatSelectors();
      }));
      row.querySelector(".mat-del").addEventListener("click", () => {
        if (project.materials.length <= 1) return;
        project.materials.splice(i, 1); Project.bumpRevision(project); renderMaterials(); populateMatSelectors();
      });
      host.appendChild(row);
    });
  }
  function populateMatSelectors() {
    if (!project) return;
    [["s_mat", "slope"], ["p_mat", "seep"], ["g_mat", "sigma"]].forEach(([id, mod]) => {
      const sel = $(id); if (!sel) return;
      const cur = project.analyses[mod].materialId || (project.materials[0] && project.materials[0].id);
      sel.innerHTML = project.materials.map(m => `<option value="${m.id}">${m.name}</option>`).join("");
      if (cur) sel.value = cur;
    });
  }
  function applyMaterialToAnalysis(mod, matId) {
    const mat = Project.materialById(project, matId); if (!mat) return;
    project.analyses[mod].materialId = matId;
    if (mod === "slope") { $("s_gamma").value = mat.gamma; $("s_c").value = mat.c; $("s_phi").value = mat.phi; }
    if (mod === "seep") { $("p_k").value = mat.k; }
    if (mod === "sigma") { $("g_gamma").value = mat.gamma; $("g_E").value = mat.E; $("g_nu").value = mat.nu; }
    Project.bumpRevision(project);
  }

  // ---- Project <-> DOM sync and file operations ----
  const DOM_MAP = {
    slope: { materialId: ["s_mat", "str"], H: "s_H", beta: "s_beta", crest: "s_crest", toe: "s_toe", gamma: "s_gamma", c: "s_c", phi: "s_phi", ru: "s_ru", method: ["s_method", "str"], search: ["s_search", "str"], nslices: "s_nslices", grid: "s_grid", porePressureMode: ["s_pp", "str"], wt: "s_wt", piezoText: ["s_piezo", "str"], e0: "s_e0", e1: "s_e1", x0: "s_x0", x1: "s_x1", een: "s_een", enr: "s_enr" },
    seep:  { materialId: ["p_mat", "str"], W: "p_W", D: "p_D", nx: "p_nx", hu: "p_hu", hd: "p_hd", k: "p_k", wall_on: ["p_wall_on", "bool"], wall_x: "p_wall_x", wall_d: "p_wall_d" },
    sigma: { materialId: ["g_mat", "str"], W: "g_W", H: "g_H", nx: "g_nx", E: "g_E", nu: "g_nu", gamma: "g_gamma", q: "g_q", qw: "g_qw", field: ["g_field", "str"] },
    consolidation: { H: "c_H", cv: "c_cv", u0: "c_u0", drainage: ["c_drain", "str"], tEnd: "c_tEnd", nz: "c_nz" },
    dynamics: { vs: "d_vs", H: "d_H", zeta: "d_zeta" },
    thermal: { L: "t_L", alpha: "t_alpha", Ti: "t_Ti", Ts: "t_Ts", tEnd: "t_tEnd", n: "t_n" },
    flow3d: { W: "f3_W", D: "f3_D", T: "f3_T", nx: "f3_nx", hu: "f3_hu", hd: "f3_hd", k: "f3_k" },
    prob: { cStd: "pr_cStd", phiStd: "pr_phiStd", N: "pr_N", seed: "pr_seed" }
  };
  function readField(spec) { const [id, t] = Array.isArray(spec) ? spec : [spec, "num"]; const el = $(id); if (!el) return undefined; return t === "bool" ? el.checked : t === "str" ? el.value : parseFloat(el.value); }
  function writeField(spec, val) { const [id, t] = Array.isArray(spec) ? spec : [spec, "num"]; const el = $(id); if (!el || val == null) return; if (t === "bool") el.checked = !!val; else el.value = val; }
  function syncDomToProject() { for (const mod in DOM_MAP) for (const k in DOM_MAP[mod]) { const v = readField(DOM_MAP[mod][k]); if (v !== undefined) project.analyses[mod][k] = v; } }
  function applyProjectToDom() {
    for (const mod in DOM_MAP) { populateMatSelectors(); for (const k in DOM_MAP[mod]) writeField(DOM_MAP[mod][k], project.analyses[mod][k]); }
    $("tree_name").textContent = project.name || "Untitled project";
    renderMaterials(); populateMatSelectors(); syncSlopeRows();
  }
  function recomputeAll() { runSeep(); runSigma(); runConsolidation(); runDynamics(); runThermal(); runFlow3d(); runSlope(); runProb(); if (current !== "materials" && current !== "validation") switchTo(current); }
  function note(msg) { $("status_right").textContent = msg; }

  function pickFile() { return new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = ".gcp,application/json"; i.onchange = () => res(i.files[0] || null); i.click(); }); }
  function downloadFile(name, content, type) { const b = new Blob([content], { type: type || "application/octet-stream" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

  // ---- Phase B: transient seepage, validation view, reports & exports ----
  function runSeepTransient(basep) {
    const tp = Object.assign({}, basep, { S: num("p_S"), h0: num("p_h0"), tEnd: num("p_tEnd"), dt: num("p_dt") });
    const t = window.Seep.solveTransient(tp);
    const s = computeSeepDisplay(t);
    last.seep = { p: tp, s, transient: t };
    $("p_result").innerHTML =
      `<div class="big">${(t.balanceError * 100).toFixed(2)}% <span class="muted" style="font-size:14px">balance error</span></div>
       <div class="muted">Transient run · ${t.nSteps} steps to t = ${t.tEnd} d</div>
       <table>
        <tr><td>Storage change</td><td>${t.storage.toFixed(3)} m³/m</td></tr>
        <tr><td>Net inflow</td><td>${t.netInflow.toFixed(3)} m³/m</td></tr>
        <tr><td>Grid</td><td>${t.nx}×${t.ny}</td></tr>
       </table>`;
    setStatus("seep", `Seepage (transient) — balance error ${(t.balanceError * 100).toFixed(2)}%`, `${t.nSteps} steps`);
    disclaim("seep", "p_result");
    draw.seep(last.seep);
  }
  function computeSeepDisplay(t) {
    const { NX, NY, nx, ny, dx, dy, h, active } = t;
    const idx = (i, j) => j * NX + i;
    let hMin = Infinity, hMax = -Infinity;
    for (let n = 0; n < h.length; n++) { if (!active[n]) continue; if (h[n] < hMin) hMin = h[n]; if (h[n] > hMax) hMax = h[n]; }
    const grad = new Float64Array(h.length); let maxGrad = 0, exitGrad = 0;
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const n = idx(i, j); if (!active[n]) { grad[n] = 0; continue; }
      const iL = active[idx(Math.max(0, i - 1), j)] ? idx(Math.max(0, i - 1), j) : n;
      const iR = active[idx(Math.min(nx, i + 1), j)] ? idx(Math.min(nx, i + 1), j) : n;
      const jU = (j < ny && active[idx(i, j + 1)]) ? idx(i, j + 1) : n;
      const jD = (j > 0 && active[idx(i, j - 1)]) ? idx(i, j - 1) : n;
      const g = Math.hypot((h[iL] - h[iR]) / (2 * dx), (h[jD] - h[jU]) / (2 * dy));
      grad[n] = g; if (g > maxGrad) maxGrad = g; if (j === ny) exitGrad = Math.max(exitGrad, g);
    }
    return { NX, NY, nx, ny, dx, dy, h, active, grad, hMin, hMax, maxGrad, exitGrad, q: 0, k: t.k, wallI: t.wallI, wallRows: t.wallRows };
  }

  function renderBench() {
    const host = $("bench_table"); if (!host || !window.Benchmarks) return;
    host.innerHTML = '<div class="bench-summary">Running…</div>';
    requestAnimationFrame(() => {
      const results = window.Benchmarks.run();
      const pass = results.filter(r => r.pass).length;
      let html = `<div class="bench-summary">${pass}/${results.length} benchmarks passing</div>`;
      for (const r of results) {
        const errStr = r.error_message ? r.error_message : (typeof r.error === "number" ? r.error.toExponential(2) : r.error);
        html += `<div class="bench-row">
          <div class="bh"><span class="bstat ${r.pass ? "pass" : "fail"}">${r.pass ? "PASS" : "FAIL"}</span><span class="bttl">${r.title}</span></div>
          <div class="bmeta">${r.metric}: ${errStr} (tol ${r.tol}) · ${r.method}</div>
          <div class="bsrc">${r.source}</div>
        </div>`;
      }
      host.innerHTML = html;
    });
  }

  function activeAnalysis() { return (current === "materials" || current === "validation") ? "slope" : current; }
  function inputsTable(mod) {
    const a = project.analyses[mod]; let rows = "";
    for (const k in a) rows += `<tr><td>${k}</td><td>${a[k]}</td></tr>`;
    return `<table><tr><th>Parameter</th><th>Value</th></tr>${rows}</table>`;
  }
  function summarizeResult(mod) {
    if (mod === "slope" && last.slope && last.slope.out.best) { const b = last.slope.out.best; return { fos: b.fos, centre: [b.xc, b.yc], radius: b.R, slices: b.slices.length }; }
    if (mod === "seep" && last.seep) { return last.seep.transient ? { balanceError: last.seep.transient.balanceError, storage: last.seep.transient.storage, netInflow: last.seep.transient.netInflow } : { q: last.seep.s.q, maxGrad: last.seep.s.maxGrad, exitGrad: last.seep.s.exitGrad }; }
    if (mod === "sigma" && last.sigma) { const m = last.sigma.m; return { maxSettle: m.maxSettle, elements: m.tris.length }; }
    return null;
  }
  function buildReportHTML() {
    syncDomToProject();
    const mod = activeAnalysis();
    const methodId = methodIdFor(mod);
    const C = window.Capabilities, cap = C.byId(methodId), mat = C.maturityInfo(cap.maturity);
    const resultHTML = $(mod === "slope" ? "s_result" : mod === "seep" ? "p_result" : "g_result").innerHTML;
    const now = new Date().toISOString();
    const bench = window.Benchmarks ? window.Benchmarks.run().filter(b => b.method === methodId) : [];
    const benchRows = bench.map(b => `<tr><td>${b.pass ? "PASS" : "FAIL"}</td><td>${b.title}</td><td>${typeof b.error === "number" ? b.error.toExponential(2) : b.error}</td><td>${b.tol}</td></tr>`).join("");
    const disc = mat.rank < C.MATURITY.released.rank ? C.resultDisclaimer(methodId) : "";
    return `<!doctype html><html><head><meta charset="utf-8"><title>GeoCalc Pro report — ${TITLE[mod]}</title>
<style>body{font:14px/1.55 -apple-system,Segoe UI,Roboto,sans-serif;color:#1c2733;max-width:820px;margin:32px auto;padding:0 20px}
h1{font-size:22px}h2{font-size:16px;border-bottom:1px solid #ccc;padding-bottom:4px;margin-top:26px}
table{border-collapse:collapse;width:100%;margin:8px 0}td,th{border:1px solid #ddd;padding:6px 9px;text-align:left;font-size:13px}
.badge{display:inline-block;padding:2px 9px;border-radius:20px;color:#fff;font-size:12px;font-weight:700;background:${mat.color}}
.warn{background:#fff6e2;border:1px solid #f0d79a;padding:10px;border-radius:7px;color:#9a6a00;margin:10px 0}
.muted{color:#667}.big{font-size:22px;font-weight:800}</style></head><body>
<h1>GeoCalc Pro — ${TITLE[mod]} report</h1>
<p class="muted">Project: <b>${project.name}</b> · revision ${project.revision} · generated ${now} · app v${window.GC_VERSION}</p>
<h2>Method and maturity</h2>
<p>${cap.method} <span class="badge">${mat.label}</span></p>
<p class="muted">${cap.notes || ""}</p>
${cap.envelope ? `<p><b>Validated envelope:</b> ${cap.envelope}</p>` : ""}
<p class="muted">References: ${(cap.references || []).join("; ") || "—"}</p>
${disc ? `<div class="warn">${disc}</div>` : ""}
<h2>Inputs (supplied)</h2>
${inputsTable(mod)}
<h2>Result (calculated)</h2>
<div>${resultHTML}</div>
${benchRows ? `<h2>Numerical validation evidence</h2><table><tr><th>Status</th><th>Benchmark</th><th>Error</th><th>Tolerance</th></tr>${benchRows}</table>` : ""}
<h2>Limitations and provenance</h2>
<ul>
<li>Independently implemented from public methods; applicable only within the validated envelope stated above.</li>
<li>This report distinguishes supplied inputs from calculated results; demonstration or unverified status is not removable.</li>
<li>Provenance: project revision ${project.revision}, app v${window.GC_VERSION}, generated ${now}.</li>
</ul></body></html>`;
  }
  function exportReport() {
    const mod = activeAnalysis();
    downloadFile((project.name || "report") + "-" + mod + "-report.html", buildReportHTML(), "text/html");
    note("Report exported");
  }
  function exportData() {
    const mod = activeAnalysis(); syncDomToProject();
    const payload = { app: "GeoCalc Pro", version: window.GC_VERSION, generated: new Date().toISOString(),
      project: { name: project.name, revision: project.revision }, module: mod,
      method: methodIdFor(mod), inputs: project.analyses[mod], result: summarizeResult(mod) };
    downloadFile((project.name || "data") + "-" + mod + ".json", JSON.stringify(payload, null, 2), "application/json");
    note("Data exported");
  }

  function doNew() { project = Project.newProject(); currentPath = null; applyProjectToDom(); recomputeAll(); note("New project"); }
  async function doOpen() {
    try {
      let content;
      if (window.gcDesktop && gcDesktop.isDesktop) { const r = await gcDesktop.openProject(); if (!r) return; content = r.content; currentPath = r.path; }
      else { const f = await pickFile(); if (!f) return; content = await f.text(); currentPath = null; }
      project = Project.deserialize(content); applyProjectToDom(); recomputeAll(); note("Opened " + (project.name || "project"));
    } catch (e) { alert("Open failed: " + e.message); }
  }
  async function doSave(as) {
    syncDomToProject(); const content = Project.serialize(project);
    try {
      if (window.gcDesktop && gcDesktop.isDesktop) {
        if (!as && currentPath) { await gcDesktop.saveProject(content, currentPath); note("Saved"); }
        else { const r = await gcDesktop.saveProjectAs(content, project.name); if (r && r.path) { currentPath = r.path; note("Saved"); } }
      } else { downloadFile((project.name || "project") + ".gcp", content); note("Downloaded .gcp"); }
    } catch (e) { alert("Save failed: " + e.message); }
  }

  function setupProjectUI() {
    if (!project) return;
    renderMaterials(); populateMatSelectors();
    $("mat_add").addEventListener("click", () => {
      project.materials.push({ id: Project.uid("mat"), name: "New material", gamma: 18, c: 5, phi: 28, E: 30, nu: 0.3, k: 1.0 });
      Project.bumpRevision(project); renderMaterials(); populateMatSelectors();
    });
    $("s_mat").addEventListener("change", () => applyMaterialToAnalysis("slope", $("s_mat").value));
    $("p_mat").addEventListener("change", () => applyMaterialToAnalysis("seep", $("p_mat").value));
    $("g_mat").addEventListener("change", () => applyMaterialToAnalysis("sigma", $("g_mat").value));
    $("s_method").addEventListener("change", () => setBadge("slope"));
    $("s_pp").addEventListener("change", syncSlopeRows);
    $("s_search").addEventListener("change", syncSlopeRows);
    syncSlopeRows();
    $("btn_new").addEventListener("click", doNew);
    $("btn_open").addEventListener("click", doOpen);
    $("btn_save").addEventListener("click", () => doSave(false));
    $("btn_report").addEventListener("click", exportReport);
    $("btn_export").addEventListener("click", exportData);
    $("bench_run").addEventListener("click", renderBench);
    $("p_transient").addEventListener("change", () => setBadge("seep"));
    if (window.gcDesktop && gcDesktop.onMenu) gcDesktop.onMenu(a => { const m = { new: doNew, open: doOpen, save: () => doSave(false), saveAs: () => doSave(true) }; if (m[a]) m[a](); });
    $("tree_name").textContent = project.name;
  }

  // ---------------- First run ----------------
  window.addEventListener("resize", () => { if (last[current]) draw[current](last[current]); });
  setupProjectUI();
  runSeep(); runSigma(); runConsolidation(); runDynamics(); runThermal(); runFlow3d(); runSlope(); runProb();   // slope's status restored on switchTo below
  switchTo("slope");
})();
