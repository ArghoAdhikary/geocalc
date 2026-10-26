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
