/* Geometry model and algorithm tests (Phase H, FR-GEO-*). Pure, headless. */
const test = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const G = require(path.join(__dirname, "..", "js", "geometry.js"));

test("area and centroid of a rectangle", () => {
  const r = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  assert.strictEqual(G.area(r), 12);
  const c = G.centroid(r);
  assert.ok(Math.abs(c.x - 2) < 1e-9 && Math.abs(c.y - 1.5) < 1e-9);
});

test("point-in-polygon interior vs exterior", () => {
  const r = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }];
  assert.ok(G.pointInPolygon({ x: 2, y: 1 }, r));
  assert.ok(!G.pointInPolygon({ x: 5, y: 1 }, r));
});

test("self-intersection: bow-tie is caught, simple quad is not", () => {
  assert.ok(G.isSelfIntersecting([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 }]));
  assert.ok(!G.isSelfIntersecting([{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]));
});

test("validateRegion flags degenerate polygons with clear issues", () => {
  assert.ok(G.validateRegion(G.newRegion("ok", null, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }])).ok);
  const line = G.validateRegion(G.newRegion("line", null, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]));
  assert.ok(!line.ok && line.issues.some(s => /zero area/.test(s)));
  const few = G.validateRegion(G.newRegion("few", null, [{ x: 0, y: 0 }, { x: 1, y: 1 }]));
  assert.ok(!few.ok && few.issues.some(s => /at least 3/.test(s)));
  const bow = G.validateRegion(G.newRegion("bow", null, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 0, y: 3 }, { x: 4, y: 3 }]));
  assert.ok(!bow.ok && bow.issues.some(s => /cross/.test(s)));
});

test("overlap heuristic: stacked layers OK, crossing squares flagged", () => {
  const ex = G.exampleTwoLayer(["m1", "m2"]);
  assert.ok(G.validate(ex).ok, "two-layer example should be valid and non-overlapping");
  const a = G.newRegion("a", null, [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }]);
  const b = G.newRegion("b", null, [{ x: 2, y: 2 }, { x: 6, y: 2 }, { x: 6, y: 6 }, { x: 2, y: 6 }]);
  assert.ok(G.regionsOverlap(a, b));
});

test("slope template is a valid closed region", () => {
  const r = G.slopeTemplate({ H: 10, beta: 34, crest: 12, toe: 14 });
  assert.ok(G.validateRegion(r).ok);
  assert.ok(G.area(r.verts) > 0);
});

test("ground profile is the left-to-right upper envelope", () => {
  const r = G.slopeTemplate({ H: 10, beta: 34, crest: 12, toe: 14 });
  const prof = G.groundProfile({ regions: [r] });
  assert.ok(prof.length >= 2);
  for (let i = 1; i < prof.length; i++) assert.ok(prof[i].x >= prof[i - 1].x - 1e-9, "x must be non-decreasing");
  // crest region (x in 0..12) is at elevation 10
  assert.ok(prof.filter(p => p.x < 11.9).every(p => Math.abs(p.y - 10) < 1e-6));
});

test("clone is a deep copy", () => {
  const g = { regions: [G.newRegion("r", "m", [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])] };
  const c = G.clone(g);
  c.regions[0].verts[0].x = 99;
  assert.strictEqual(g.regions[0].verts[0].x, 0, "original must be untouched");
});
