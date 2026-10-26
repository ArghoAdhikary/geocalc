/* app.js — UI wiring, canvas rendering, and the action applier used by the AI bar. */
(function () {
  "use strict";
  const $ = id => document.getElementById(id);
  const num = id => parseFloat($(id).value);

  // ---------------- Analysis switching (ribbon tabs + project tree) ----------------
  let current = "slope";
  const TITLE = { slope: "Slope stability", seep: "Seepage", sigma: "Stress–deformation", materials: "Materials library" };
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
  function readSlope() {
    return {
      H: num("s_H"), beta: num("s_beta"), crest: num("s_crest"), toe: num("s_toe"),
      gamma: num("s_gamma"), c: num("s_c"), phi: num("s_phi"), ru: num("s_ru"),
      method: $("s_method").value, nslices: num("s_nslices"), grid: num("s_grid")
    };
  }
  function runSlope() {
    const p = readSlope();
    const out = window.Slope.analyze(p);
    last.slope = { p, out };
    const r = $("s_result");
    if (!out.best) { r.innerHTML = '<span class="muted">No valid slip surface found — adjust geometry.</span>'; setStatus("slope", "Slope stability — no valid slip surface"); draw.slope(last.slope); return; }
    const fos = out.best.fos;
    const cls = fos >= 1.5 ? "fos-good" : fos >= 1.2 ? "fos-warn" : "fos-bad";
    const verdict = fos >= 1.5 ? "Stable" : fos >= 1.2 ? "Marginal" : "Unsafe";
    setStatus("slope", `Slope stability — FoS = ${fos.toFixed(3)} (${verdict})`, p.method === "bishop" ? "Bishop simplified" : "Fellenius");
    r.innerHTML =
      `<div class="big ${cls}">FoS = ${fos.toFixed(3)}</div>
       <div class="muted">${verdict} · ${p.method === "bishop" ? "Bishop simplified" : "Fellenius"} · critical circle</div>
       <table>
        <tr><td>Centre</td><td>(${out.best.xc.toFixed(1)}, ${out.best.yc.toFixed(1)}) m</td></tr>
        <tr><td>Radius</td><td>${out.best.R.toFixed(1)} m</td></tr>
        <tr><td>Slices used</td><td>${out.best.slices.length}</td></tr>
       </table>`;
    disclaim("slope", "s_result");
    draw.slope(last.slope);
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

  // ---------------- Run buttons ----------------
  const RUN = { slope: runSlope, seep: runSeep, sigma: runSigma };
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
    if (mod === "slope") return $("s_method").value === "fellenius" ? "slope.fellenius" : "slope.bishop";
    if (mod === "seep") return "seep.steady";
    if (mod === "sigma") return "sigma.elastic";
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
    if (mod === "materials") { compute.disabled = true; compute.style.opacity = .4; }
    else { compute.disabled = false; compute.style.opacity = 1; setBadge(mod); }
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
    slope: { materialId: ["s_mat", "str"], H: "s_H", beta: "s_beta", crest: "s_crest", toe: "s_toe", ru: "s_ru", method: ["s_method", "str"], nslices: "s_nslices", grid: "s_grid" },
    seep:  { materialId: ["p_mat", "str"], W: "p_W", D: "p_D", nx: "p_nx", hu: "p_hu", hd: "p_hd", k: "p_k", wall_on: ["p_wall_on", "bool"], wall_x: "p_wall_x", wall_d: "p_wall_d" },
    sigma: { materialId: ["g_mat", "str"], W: "g_W", H: "g_H", nx: "g_nx", E: "g_E", nu: "g_nu", gamma: "g_gamma", q: "g_q", qw: "g_qw", field: ["g_field", "str"] }
  };
  function readField(spec) { const [id, t] = Array.isArray(spec) ? spec : [spec, "num"]; const el = $(id); if (!el) return undefined; return t === "bool" ? el.checked : t === "str" ? el.value : parseFloat(el.value); }
  function writeField(spec, val) { const [id, t] = Array.isArray(spec) ? spec : [spec, "num"]; const el = $(id); if (!el || val == null) return; if (t === "bool") el.checked = !!val; else el.value = val; }
  function syncDomToProject() { for (const mod in DOM_MAP) for (const k in DOM_MAP[mod]) { const v = readField(DOM_MAP[mod][k]); if (v !== undefined) project.analyses[mod][k] = v; } }
  function applyProjectToDom() {
    for (const mod in DOM_MAP) { populateMatSelectors(); for (const k in DOM_MAP[mod]) writeField(DOM_MAP[mod][k], project.analyses[mod][k]); }
    $("tree_name").textContent = project.name || "Untitled project";
    renderMaterials(); populateMatSelectors();
  }
  function recomputeAll() { runSeep(); runSigma(); runSlope(); if (current !== "materials") switchTo(current); }
  function note(msg) { $("status_right").textContent = msg; }

  function pickFile() { return new Promise(res => { const i = document.createElement("input"); i.type = "file"; i.accept = ".gcp,application/json"; i.onchange = () => res(i.files[0] || null); i.click(); }); }
  function downloadFile(name, content) { const b = new Blob([content], { type: "application/json" }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 2000); }

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
    $("btn_new").addEventListener("click", doNew);
    $("btn_open").addEventListener("click", doOpen);
    $("btn_save").addEventListener("click", () => doSave(false));
    if (window.gcDesktop && gcDesktop.onMenu) gcDesktop.onMenu(a => { const m = { new: doNew, open: doOpen, save: () => doSave(false), saveAs: () => doSave(true) }; if (m[a]) m[a](); });
    $("tree_name").textContent = project.name;
  }

  // ---------------- First run ----------------
  window.addEventListener("resize", () => { if (last[current]) draw[current](last[current]); });
  setupProjectUI();
  runSeep(); runSigma(); runSlope();   // slope last so the status bar reflects the default view
  switchTo("slope");
})();
