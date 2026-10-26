const test = require("node:test");
const assert = require("node:assert");
const U = require("../js/core/units.js");

test("degrees to radians", () => {
  assert.ok(Math.abs(U.convert(180, "deg", "rad") - Math.PI) < 1e-9);
});
test("kPa to Pa", () => {
  assert.strictEqual(U.convert(5, "kPa", "Pa"), 5000);
});
test("m/day to m/s", () => {
  assert.ok(Math.abs(U.convert(86400, "m/day", "m/s") - 1) < 1e-9);
});
test("SI round trip for feet", () => {
  const si = U.toSI(10, "ft");
  assert.ok(Math.abs(U.fromSI(si, "ft") - 10) < 1e-12);
});
test("incompatible dimensions throw", () => {
  assert.throws(() => U.convert(1, "m", "kPa"));
});
test("unknown unit throws", () => {
  assert.throws(() => U.convert(1, "furlong", "m"));
});
