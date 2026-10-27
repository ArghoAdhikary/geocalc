const test = require("node:test");
const assert = require("node:assert");
const P = require("../js/core/project.js");

test("new project is valid and branded", () => {
  const pr = P.newProject("Test");
  assert.ok(P.validate(pr));
  assert.strictEqual(pr.app, "GeoCalc Pro");
  assert.strictEqual(pr.name, "Test");
});
test("serialize -> deserialize round trips losslessly", () => {
  const pr = P.newProject("Round trip");
  const pr2 = P.deserialize(P.serialize(pr));
  assert.deepStrictEqual(pr2, pr);
});
test("bumpRevision increments revision", () => {
  const pr = P.newProject();
  const r = pr.revision;
  P.bumpRevision(pr);
  assert.strictEqual(pr.revision, r + 1);
});
test("deserialize rejects a foreign file", () => {
  assert.throws(() => P.deserialize('{"app":"SomethingElse","schemaVersion":1}'));
});
test("deserialize rejects invalid JSON", () => {
  assert.throws(() => P.deserialize("{not json"));
});
test("deserialize rejects a newer schema version", () => {
  const pr = P.newProject();
  pr.schemaVersion = 99;
  assert.throws(() => P.deserialize(P.serialize(pr)));
});
test("materialById finds a seeded material", () => {
  const pr = P.newProject();
  assert.ok(P.materialById(pr, "mat_fill"));
  assert.strictEqual(P.materialById(pr, "nope"), null);
});
test("new project carries a geometry model at the current schema version", () => {
  const pr = P.newProject();
  assert.strictEqual(pr.schemaVersion, 2);
  assert.ok(pr.geometry && Array.isArray(pr.geometry.regions));
});
test("v1 project (no geometry) migrates to v2 with an empty geometry", () => {
  const v1 = P.newProject("Legacy");
  delete v1.geometry; v1.schemaVersion = 1;
  const up = P.deserialize(JSON.stringify(v1));
  assert.strictEqual(up.schemaVersion, 2);
  assert.ok(up.geometry && Array.isArray(up.geometry.regions) && up.geometry.regions.length === 0);
});
test("a project with geometry round-trips losslessly", () => {
  const pr = P.newProject("Has geometry");
  pr.geometry.regions.push({ id: "rgn_x", name: "Fill", materialId: "mat_fill",
    verts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }] });
  const pr2 = P.deserialize(P.serialize(pr));
  assert.deepStrictEqual(pr2.geometry, pr.geometry);
});
