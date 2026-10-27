/* geometry.js — shared 2D geometry data model and algorithms (Phase H).
 *
 * A single geometry model feeds rendering, computation, persistence and
 * reports (FR-GEO-*). A geometry holds regions: ordered, implicitly-closed
 * polygons of world-coordinate vertices, each assigned a material. World
 * coordinates are independent of screen pixels; the editor owns the transform.
 *
 * Everything here is pure (no DOM), so it is unit-testable and runs headless.
 * Exact checks (area, self-intersection, vertex count) are reported as such;
 * the inter-region overlap test is an explicitly-labelled heuristic.
 *
 * Dual-mode (browser global window.Geometry + CommonJS).
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.Geometry = api;
})(this, function () {
  "use strict";

  const EPS = 1e-9;

  function uid(prefix) { return (prefix || "r") + "_" + Math.random().toString(36).slice(2, 9); }

  function create() { return { regions: [] }; }

  function newRegion(name, materialId, verts) {
    return { id: uid("rgn"), name: name || "Region", materialId: materialId || null, verts: (verts || []).map(v => ({ x: +v.x, y: +v.y })) };
  }

  // Signed area (shoelace); positive for counter-clockwise order.
  function signedArea(verts) {
    let a = 0;
    for (let i = 0, n = verts.length; i < n; i++) {
      const p = verts[i], q = verts[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }
  function area(verts) { return Math.abs(signedArea(verts)); }

  function centroid(verts) {
    const n = verts.length;
    if (n === 0) return { x: 0, y: 0 };
    const a2 = signedArea(verts) * 2;
    if (Math.abs(a2) < EPS) { // degenerate: average of vertices
      let sx = 0, sy = 0; for (const v of verts) { sx += v.x; sy += v.y; } return { x: sx / n, y: sy / n };
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) {
      const p = verts[i], q = verts[(i + 1) % n];
      const cross = p.x * q.y - q.x * p.y;
      cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross;
    }
    return { x: cx / (3 * a2), y: cy / (3 * a2) };
  }

  function bboxOf(verts) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const v of verts) { if (v.x < x0) x0 = v.x; if (v.y < y0) y0 = v.y; if (v.x > x1) x1 = v.x; if (v.y > y1) y1 = v.y; }
    return { x0, y0, x1, y1 };
  }
  function bbox(geometry) {
    const all = [];
    for (const r of geometry.regions) for (const v of r.verts) all.push(v);
    if (!all.length) return { x0: 0, y0: 0, x1: 40, y1: 20 };
    return bboxOf(all);
  }

  // Orientation of ordered triplet: >0 ccw, <0 cw, 0 collinear.
  function orient(a, b, c) { return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x); }
  function onSeg(a, b, c) { // c collinear with ab — is it on the segment?
    return Math.min(a.x, b.x) - EPS <= c.x && c.x <= Math.max(a.x, b.x) + EPS &&
           Math.min(a.y, b.y) - EPS <= c.y && c.y <= Math.max(a.y, b.y) + EPS;
  }
  // Proper or improper intersection of segments ab and cd.
  function segmentsIntersect(a, b, c, d) {
    const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
    if (((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
        ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))) return true;
    if (Math.abs(o1) <= EPS && onSeg(a, b, c)) return true;
    if (Math.abs(o2) <= EPS && onSeg(a, b, d)) return true;
    if (Math.abs(o3) <= EPS && onSeg(c, d, a)) return true;
    if (Math.abs(o4) <= EPS && onSeg(c, d, b)) return true;
    return false;
  }

  // Does the closed polygon cross itself? (ignores adjacent, shared-vertex edges)
  function isSelfIntersecting(verts) {
    const n = verts.length;
    if (n < 4) return false;
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      for (let j = i + 1; j < n; j++) {
        if (j === i) continue;
        const adjacent = (j === (i + 1) % n) || ((j + 1) % n === i);
        if (adjacent) continue;
        const c = verts[j], d = verts[(j + 1) % n];
        if (segmentsIntersect(a, b, c, d)) return true;
      }
    }
    return false;
  }

  // Ray-casting point-in-polygon (interior, excludes boundary within EPS).
  function pointInPolygon(pt, verts) {
    let inside = false;
    for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
      const vi = verts[i], vj = verts[j];
      const intersect = ((vi.y > pt.y) !== (vj.y > pt.y)) &&
        (pt.x < (vj.x - vi.x) * (pt.y - vi.y) / ((vj.y - vi.y) || EPS) + vi.x);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function hasDuplicateConsecutive(verts) {
    const n = verts.length;
    for (let i = 0; i < n; i++) {
      const p = verts[i], q = verts[(i + 1) % n];
      if (Math.abs(p.x - q.x) < 1e-7 && Math.abs(p.y - q.y) < 1e-7) return true;
    }
    return false;
  }

  // Exact per-region validity. Returns { ok, issues:[...] }.
  function validateRegion(region) {
    const v = region.verts || [];
    const issues = [];
    if (v.length < 3) issues.push("needs at least 3 vertices");
    else {
      if (hasDuplicateConsecutive(v)) issues.push("has a duplicate / repeated point");
      if (isSelfIntersecting(v)) issues.push("edges cross (self-intersecting)");
      else if (area(v) < 1e-6) issues.push("zero area (vertices are collinear)");
    }
    return { ok: issues.length === 0, issues };
  }

  // Heuristic interior-overlap test: a region's centroid or an inward-nudged
  // vertex falling inside another region's interior. Shared boundaries between
  // stacked layers do NOT trigger it. Labelled heuristic — not a proof of
  // non-overlap for every pathological case.
  function regionsOverlap(r1, r2) {
    if (validateRegion(r1).issues.length || validateRegion(r2).issues.length) return false;
    const probes = (r, other) => {
      const c = centroid(r.verts);
      if (pointInPolygon(c, other.verts)) return true;
      // nudge each vertex slightly toward the centroid and test
      for (const vtx of r.verts) {
        const p = { x: vtx.x + (c.x - vtx.x) * 0.02, y: vtx.y + (c.y - vtx.y) * 0.02 };
        if (pointInPolygon(p, other.verts)) return true;
      }
      return false;
    };
    return probes(r1, r2) || probes(r2, r1);
  }

  // Whole-geometry validation: per-region issues plus overlap pairs.
  function validate(geometry) {
    const regionIssues = {};
    let ok = true;
    for (const r of geometry.regions) {
      const res = validateRegion(r);
      regionIssues[r.id] = res.issues;
      if (!res.ok) ok = false;
    }
    const overlaps = [];
    const rs = geometry.regions;
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++)
        if (regionsOverlap(rs[i], rs[j])) { overlaps.push([rs[i].id, rs[j].id]); ok = false; }
    return { ok, regionIssues, overlaps };
  }

  // Upper-envelope ground surface as a left→right polyline of {x, y}. At each
  // sampled x the surface is the highest point on any region boundary spanning
  // x. Suitable as a slope-analysis ground profile (surfaceY interpolates it).
  function groundProfile(geometry, samples) {
    const edges = [];
    for (const r of geometry.regions) {
      const v = r.verts; const n = v.length;
      for (let i = 0; i < n; i++) edges.push([v[i], v[(i + 1) % n]]);
    }
    if (!edges.length) return [];
    const bb = bbox(geometry);
    const N = samples || 200;
    const pts = [];
    let lastY = null;
    for (let s = 0; s <= N; s++) {
      const x = bb.x0 + (bb.x1 - bb.x0) * s / N;
      let top = -Infinity;
      for (const [a, b] of edges) {
        const lo = Math.min(a.x, b.x), hi = Math.max(a.x, b.x);
        if (x < lo - EPS || x > hi + EPS) continue;
        const dx = b.x - a.x;
        const y = Math.abs(dx) < EPS ? Math.max(a.y, b.y) : a.y + (b.y - a.y) * (x - a.x) / dx;
        if (y > top) top = y;
      }
      if (top > -Infinity) {
        // keep endpoints and points where slope changes meaningfully
        if (lastY === null || Math.abs(top - lastY) > 1e-6 || s === N) pts.push({ x, y: top });
        lastY = top;
      }
    }
    return pts;
  }

  // ---- Templates ----

  // Closed polygon for a simple slope embankment, consistent with the
  // parametric slope solver's groundProfile (crest at elevation H, toe at 0).
  function slopeTemplate(p) {
    const H = p.H, crest = p.crest, toe = p.toe, beta = p.beta;
    const toeX = crest + H / Math.tan(beta * Math.PI / 180);
    // Bottom boundary sits a foundation depth below the toe so the region is a
    // proper closed polygon (never a zero-height sliver along the toe bench).
    const depth = p.depth != null ? p.depth : -Math.max(2, 0.4 * H);
    const right = toeX + toe;
    return newRegion(p.name || "Slope body", p.materialId || null, [
      { x: 0, y: depth }, { x: 0, y: H }, { x: crest, y: H },
      { x: toeX, y: 0 }, { x: right, y: 0 }, { x: right, y: depth }
    ]);
  }

  // A two-layer worked example (fill embankment over foundation clay). The
  // embankment's base shares the clay's upper boundary without overlapping.
  function exampleTwoLayer(mats) {
    const top = newRegion("Fill embankment", (mats && mats[0]) || null, [
      { x: 0, y: 4 }, { x: 0, y: 10 }, { x: 12, y: 10 }, { x: 24, y: 4 }
    ]);
    const bot = newRegion("Foundation clay", (mats && mats[1]) || null, [
      { x: 0, y: 0 }, { x: 0, y: 4 }, { x: 40, y: 4 }, { x: 40, y: 0 }
    ]);
    return { regions: [top, bot] };
  }

  // Deep-copy for undo snapshots / safe round-trips.
  function clone(geometry) {
    return { regions: (geometry.regions || []).map(r => ({ id: r.id, name: r.name, materialId: r.materialId, verts: r.verts.map(v => ({ x: v.x, y: v.y })) })) };
  }

  return {
    EPS, uid, create, newRegion, clone,
    signedArea, area, centroid, bbox, bboxOf,
    orient, segmentsIntersect, isSelfIntersecting, pointInPolygon,
    validateRegion, regionsOverlap, validate,
    groundProfile, slopeTemplate, exampleTwoLayer
  };
});
