/* ai.js — natural-language command handling for GeoCalc.
 *
 * Providers:
 *   offline — built-in rule-based interpreter (no network, no key).
 *   claude  — Anthropic Messages API.
 *   openai  — OpenAI (or any OpenAI-compatible) Chat Completions API.
 *   gemini  — Google Generative Language API.
 *   custom  — an OpenAI-compatible endpoint at a base URL you supply.
 *
 * Every provider returns the same action list, which app.js applies to the UI.
 * API keys live only in this browser's localStorage and are sent directly to
 * the provider you choose — never anywhere else.
 */
(function (global) {
  "use strict";

  // Field catalogue: input id -> module + natural-language names.
  const FIELDS = {
    s_H:      { module: "slope", type: "num", names: ["slope height", "height", "h"] },
    s_beta:   { module: "slope", type: "num", names: ["slope angle", "angle", "beta", "β"] },
    s_crest:  { module: "slope", type: "num", names: ["crest length", "crest"] },
    s_toe:    { module: "slope", type: "num", names: ["toe length", "toe"] },
    s_gamma:  { module: "slope", type: "num", names: ["unit weight", "gamma", "γ", "density"] },
    s_c:      { module: "slope", type: "num", names: ["cohesion", "c", "c'"] },
    s_phi:    { module: "slope", type: "num", names: ["friction angle", "friction", "phi", "φ"] },
    s_ru:     { module: "slope", type: "num", names: ["pore pressure ratio", "ru"] },
    s_method: { module: "slope", type: "enum", names: ["method"], map: { bishop: "bishop", fellenius: "fellenius", ordinary: "fellenius", spencer: "spencer" } },
    s_pp:     { module: "slope", type: "enum", names: ["pore pressure model", "pore water", "water condition"],
                map: { "rapid drawdown": "drawdown", "drawdown": "drawdown", "water table": "watertable", "watertable": "watertable", "phreatic": "watertable", "piezometric": "piezometric" } },
    s_gammaSat:{ module: "slope", type: "num", names: ["saturated unit weight", "gamma sat", "γsat", "saturated density"] },
    s_wt:     { module: "slope", type: "num", names: ["water table elevation", "water table", "water level"] },
    s_wtHigh: { module: "slope", type: "num", names: ["high pool", "pre-drawdown pool", "initial pool", "reservoir level", "full pool"] },
    s_wtLow:  { module: "slope", type: "num", names: ["low pool", "final pool", "drawn-down level", "drawdown level"] },
    s_ddSteps:{ module: "slope", type: "num", names: ["drawdown steps"] },
    s_search: { module: "slope", type: "enum", names: ["search"], map: { grid: "grid", "entry and exit": "entryexit", "entry-exit": "entryexit", entryexit: "entryexit" } },
    s_nslices:{ module: "slope", type: "num", names: ["slices", "number of slices"] },
    s_grid:   { module: "slope", type: "num", names: ["search grid", "grid"] },
    p_W:      { module: "seep", type: "num", names: ["domain width", "width"] },
    p_D:      { module: "seep", type: "num", names: ["depth", "domain depth"] },
    p_nx:     { module: "seep", type: "num", names: ["grid cells", "cells", "resolution"] },
    p_hu:     { module: "seep", type: "num", names: ["upstream head", "upstream", "head upstream"] },
    p_hd:     { module: "seep", type: "num", names: ["downstream head", "downstream", "head downstream"] },
    p_k:      { module: "seep", type: "num", names: ["permeability", "k", "hydraulic conductivity"] },
    p_wall_on:{ module: "seep", type: "bool", names: ["wall", "cutoff wall", "cutoff", "include wall"] },
    p_wall_x: { module: "seep", type: "num", names: ["wall position", "wall x"] },
    p_wall_d: { module: "seep", type: "num", names: ["wall depth", "cutoff depth"] },
    g_W:      { module: "sigma", type: "num", names: ["sigma width"] },
    g_H:      { module: "sigma", type: "num", names: ["sigma height"] },
    g_nx:     { module: "sigma", type: "num", names: ["mesh", "mesh density"] },
    g_E:      { module: "sigma", type: "num", names: ["young's modulus", "youngs modulus", "modulus", "e", "stiffness"] },
    g_nu:     { module: "sigma", type: "num", names: ["poisson's ratio", "poisson", "nu", "ν"] },
    g_gamma:  { module: "sigma", type: "num", names: ["sigma unit weight"] },
    g_q:      { module: "sigma", type: "num", names: ["surcharge", "pressure", "load"] },
    g_qw:     { module: "sigma", type: "num", names: ["load width", "surcharge width"] },
    g_field:  { module: "sigma", type: "enum", names: ["show", "result", "field"],
                map: { settlement: "uy", "vertical settlement": "uy", "vertical stress": "sy",
                       "sy": "sy", "horizontal stress": "sx", "sx": "sx" } }
  };

  // Clickable action buttons the assistant may trigger.
  const BUTTONS = {
    s_dd_run: { module: "slope", desc: "run the rapid-drawdown study (FoS vs drawdown)" }
  };

  const MODULE_WORDS = {
    slope: ["slope", "stability", "factor of safety", "fos", "slip", "drawdown"],
    seep:  ["seep", "seepage", "flow", "head", "water flow", "permeab"],
    sigma: ["sigma", "stress", "deform", "settle", "fem", "elastic"]
  };

  const DEFAULT_MODEL = {
    claude: "claude-opus-5-5",
    openai: "gpt-4o-mini",
    gemini: "gemini-2.0-flash",
    custom: ""
  };

  function settings() {
    return {
      provider: localStorage.getItem("gc_ai_provider") || "offline",
      key: localStorage.getItem("gc_ai_key") || "",
      model: localStorage.getItem("gc_ai_model") || "",
      baseUrl: localStorage.getItem("gc_ai_baseurl") || ""
    };
  }
  function saveSettings(s) {
    localStorage.setItem("gc_ai_provider", s.provider);
    localStorage.setItem("gc_ai_key", s.key);
    localStorage.setItem("gc_ai_model", s.model);
    localStorage.setItem("gc_ai_baseurl", s.baseUrl);
  }

  // ---------- Offline rule-based interpreter ----------
  function parseOffline(text, currentModule) {
    const t = " " + text.toLowerCase().trim() + " ";
    const actions = [];

    let targetModule = null;
    for (const [m, words] of Object.entries(MODULE_WORDS))
      if (words.some(w => t.includes(w))) { targetModule = m; break; }
    const mod = targetModule || currentModule;
    if (targetModule) actions.push({ kind: "switch", module: targetModule });

    for (const [id, f] of Object.entries(FIELDS)) {
      if (f.module !== mod) continue;
      for (const name of f.names) {
        const nameRe = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (f.type === "num") {
          const re = new RegExp("\\b" + nameRe + "\\b[^0-9+\\-]{0,12}(-?\\d+(?:\\.\\d+)?)");
          const m = t.match(re);
          if (m) { actions.push({ kind: "set", id, value: parseFloat(m[1]) }); break; }
        } else if (f.type === "enum") {
          for (const [kw, val] of Object.entries(f.map))
            if (t.includes(kw)) { actions.push({ kind: "set", id, value: val }); break; }
        } else if (f.type === "bool") {
          if (new RegExp("\\b(no|without|remove|disable)\\b[^.]{0,20}" + nameRe).test(t))
            actions.push({ kind: "set", id, value: false });
          else if (t.includes(name)) actions.push({ kind: "set", id, value: true });
          break;
        }
      }
    }
    if (mod === "slope") {
      if (t.includes("spencer")) actions.push({ kind: "set", id: "s_method", value: "spencer" });
      else if (t.includes("bishop")) actions.push({ kind: "set", id: "s_method", value: "bishop" });
      else if (t.includes("fellenius") || t.includes("ordinary")) actions.push({ kind: "set", id: "s_method", value: "fellenius" });
    }
    const wantsRun = /\b(run|compute|calculate|solve|analyse|analyze|go|do it|study|build|make|create)\b/.test(t);
    const isDrawdown = mod === "slope" && (t.includes("drawdown") || actions.some(a => a.id === "s_pp" && a.value === "drawdown"));
    if (isDrawdown) {
      if (!actions.some(a => a.id === "s_pp")) actions.push({ kind: "set", id: "s_pp", value: "drawdown" });
      if (wantsRun) actions.push({ kind: "click", id: "s_dd_run" });
    } else if (wantsRun) {
      actions.push({ kind: "run", module: mod });
    }

    const seen = {}, cleaned = [];
    for (let i = actions.length - 1; i >= 0; i--) {
      const a = actions[i];
      const key = a.kind + (a.id || a.module || "");
      if (seen[key]) continue; seen[key] = true; cleaned.unshift(a);
    }
    const sets = cleaned.filter(a => a.kind === "set").length;
    let reply;
    if (cleaned.length === 0) reply = "I couldn't match that offline. Try e.g. \"set slope angle to 40 and run\", or add an AI key in settings for free-form chat.";
    else reply = `Applied ${sets} setting${sets === 1 ? "" : "s"}` +
      (cleaned.some(a => a.kind === "run") ? " and ran the analysis." : ".");
    return { actions: cleaned, reply };
  }

  // ---------- Shared prompt + validation ----------
  function catalogForPrompt() {
    const lines = [];
    for (const [id, f] of Object.entries(FIELDS)) {
      let d = `${id} (${f.module}): ${f.names[0]}`;
      if (f.type === "enum") d += ` — one of: ${[...new Set(Object.values(f.map))].join(", ")}`;
      if (f.type === "bool") d += ` — true/false`;
      lines.push(d);
    }
    return lines.join("\n");
  }
  function buttonsForPrompt() {
    return Object.entries(BUTTONS).map(([id, b]) => `${id} (${b.module}): ${b.desc}`).join("\n");
  }
  function systemPrompt(currentModule) {
    return `You translate a user's request into actions for GeoCalc, a geotechnical app with
three modules: slope (slope stability), seep (seepage), sigma (stress/FEM).
The current module is "${currentModule}".

Available settings (field id, module, meaning):
${catalogForPrompt()}

Buttons you may click (id, module, what it does):
${buttonsForPrompt()}

Return ONLY a JSON object, no prose, no markdown fences, of the form:
{"actions":[ {"kind":"switch","module":"slope|seep|sigma"},
             {"kind":"set","id":"<field id>","value":<number|string|boolean>},
             {"kind":"click","id":"<button id>"},
             {"kind":"run","module":"slope|seep|sigma"} ],
 "reply":"one or two short sentences describing exactly what you set and did"}
Rules: switch module first if the request targets a different module. Use exact
field ids and, for enum fields, the listed values. To build a rapid-drawdown
slope: switch slope, set the geometry/strength fields, set s_pp to "drawdown",
set s_gammaSat, s_wtHigh and s_wtLow, then click s_dd_run (do NOT use a run
action for the drawdown study). Otherwise include a run action only if the user
asked to run/compute/solve. If the user only asks a question, return an empty
actions array and answer in reply.`;
  }
  function extractJSON(text) {
    const a = text.indexOf("{"), b = text.lastIndexOf("}");
    if (a < 0 || b < 0) throw new Error("No JSON in model reply");
    return JSON.parse(text.slice(a, b + 1));
  }
  function validate(parsed) {
    const actions = (parsed.actions || []).filter(a => {
      if (a.kind === "switch" || a.kind === "run") return ["slope", "seep", "sigma"].includes(a.module);
      if (a.kind === "set") return Object.prototype.hasOwnProperty.call(FIELDS, a.id);
      if (a.kind === "click") return Object.prototype.hasOwnProperty.call(BUTTONS, a.id);
      return false;
    });
    return { actions, reply: parsed.reply || "Done." };
  }

  // Human-readable preview of an action list (for the manual action mode).
  function describeActions(actions) {
    return actions.map(a => {
      if (a.kind === "switch") return `Switch to the ${a.module} module`;
      if (a.kind === "run") return `Run the ${a.module} analysis`;
      if (a.kind === "click") return (BUTTONS[a.id] ? BUTTONS[a.id].desc : a.id).replace(/^./, c => c.toUpperCase());
      if (a.kind === "set") { const f = FIELDS[a.id]; return `Set ${f ? f.names[0] : a.id} = ${a.value}`; }
      return JSON.stringify(a);
    });
  }

  // ---------- Providers ----------
  async function callClaude(text, cur, s, model) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": s.key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model, max_tokens: 1024, output_config: { effort: "low" },
        system: systemPrompt(cur), messages: [{ role: "user", content: text }]
      })
    });
    if (!res.ok) throw new Error(await errMsg(res));
    const data = await res.json();
    const out = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("");
    return validate(extractJSON(out));
  }

  async function callOpenAI(text, cur, s, model, base) {
    const url = (base || "https://api.openai.com/v1").replace(/\/$/, "") + "/chat/completions";
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "authorization": "Bearer " + s.key },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemPrompt(cur) },
          { role: "user", content: text }
        ],
        response_format: { type: "json_object" }
      })
    });
    if (!res.ok) throw new Error(await errMsg(res));
    const data = await res.json();
    const out = data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "";
    return validate(extractJSON(out));
  }

  async function callGemini(text, cur, s, model) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(s.key)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt(cur) }] },
        contents: [{ role: "user", parts: [{ text }] }],
        generationConfig: { responseMimeType: "application/json" }
      })
    });
    if (!res.ok) throw new Error(await errMsg(res));
    const data = await res.json();
    const c = data.candidates && data.candidates[0];
    const out = c && c.content && c.content.parts ? c.content.parts.map(p => p.text || "").join("") : "";
    return validate(extractJSON(out));
  }

  async function errMsg(res) {
    let msg = `API error ${res.status}`;
    try { const e = await res.json(); msg = (e.error && (e.error.message || e.error)) || (e.message) || msg; } catch {}
    if (res.status === 401) msg += " (check your API key)";
    return typeof msg === "string" ? msg : JSON.stringify(msg);
  }

  async function interpret(text, currentModule) {
    const s = settings();
    // Fall back to the offline interpreter if no provider/key is configured.
    if (s.provider === "offline" || !s.key) return parseOffline(text, currentModule);
    const model = s.model || DEFAULT_MODEL[s.provider] || "";
    if (!model) return parseOffline(text, currentModule); // e.g. custom with no model named
    switch (s.provider) {
      case "claude": return callClaude(text, currentModule, s, model);
      case "openai": return callOpenAI(text, currentModule, s, model, "");
      case "custom": return callOpenAI(text, currentModule, s, model, s.baseUrl);
      case "gemini": return callGemini(text, currentModule, s, model);
      default: return parseOffline(text, currentModule);
    }
  }

  // ---------- Manual action mode (use your own subscription via copy/paste) ----------
  // Prompt the user pastes into their provider's web app to get an action list.
  function actionPrompt(currentModule, request) {
    return systemPrompt(currentModule) +
      `\n\nUSER REQUEST: ${request || "(describe what to build)"}\n\nReturn ONLY the JSON object.`;
  }
  // Parse a pasted model reply into a validated action list (throws on no JSON).
  function parseActions(text) { return validate(extractJSON(text)); }

  global.GeoAI = { interpret, settings, saveSettings, FIELDS, BUTTONS, DEFAULT_MODEL, actionPrompt, parseActions, describeActions };
})(window);
