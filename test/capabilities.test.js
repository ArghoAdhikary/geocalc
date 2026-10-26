const test = require("node:test");
const assert = require("node:assert");
const C = require("../js/core/capabilities.js");

test("registry lookups work", () => {
  assert.ok(C.byId("slope.bishop"));
  assert.strictEqual(C.byId("does.not.exist"), null);
  assert.ok(C.forModule("slope").length >= 2);
});
test("implemented methods are runnable", () => {
  assert.strictEqual(C.isRunnable("slope.bishop"), true);
  assert.strictEqual(C.isRunnable("seep.steady"), true);
});
test("conceptual methods are not runnable", () => {
  assert.strictEqual(C.isRunnable("slope.morgenstern"), false);
  assert.strictEqual(C.isRunnable("model3d"), false);
});
test("implemented result carries an unverified disclaimer", () => {
  assert.match(C.resultDisclaimer("slope.bishop"), /not verified for design/i);
});
test("maturity scale is ordered", () => {
  assert.ok(C.MATURITY.released.rank > C.MATURITY.verified.rank);
  assert.ok(C.MATURITY.verified.rank > C.MATURITY.implemented.rank);
  assert.ok(C.MATURITY.implemented.rank > C.MATURITY.conceptual.rank);
});
test("nothing is prematurely marked verified or released", () => {
  const over = C.REGISTRY.filter(c => C.maturityInfo(c.maturity).rank >= C.MATURITY.verified.rank);
  assert.strictEqual(over.length, 0, "no method should claim verified/released before Phase B benchmarks");
});
