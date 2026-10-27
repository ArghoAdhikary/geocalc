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
test("unverified result carries a demonstration disclaimer", () => {
  assert.match(C.resultDisclaimer("sigma.elastic"), /not verified for design/i);
});
test("verified result states its envelope and that review is pending", () => {
  assert.match(C.resultDisclaimer("slope.bishop"), /Verified against analytical benchmarks/i);
  assert.match(C.resultDisclaimer("slope.bishop"), /review .*pending/i);
});
test("maturity scale is ordered", () => {
  assert.ok(C.MATURITY.released.rank > C.MATURITY.verified.rank);
  assert.ok(C.MATURITY.verified.rank > C.MATURITY.implemented.rank);
  assert.ok(C.MATURITY.implemented.rank > C.MATURITY.conceptual.rank);
});
test("every verified method carries benchmark evidence", () => {
  const verified = C.REGISTRY.filter(c => C.maturityInfo(c.maturity).rank >= C.MATURITY.verified.rank);
  assert.ok(verified.length > 0, "Phase B should have verified methods");
  for (const c of verified) assert.ok(Array.isArray(c.evidence) && c.evidence.length > 0, `${c.id} must cite evidence`);
});
test("nothing is marked Released before independent review (AC-09)", () => {
  const released = C.REGISTRY.filter(c => C.maturityInfo(c.maturity).rank >= C.MATURITY.released.rank);
  assert.strictEqual(released.length, 0, "Released requires an independent reviewer sign-off");
});
