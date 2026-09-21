import test from "node:test";
import assert from "node:assert/strict";
import { readStore, saveStore, adoptRevision, rollback, activePlan, parseBackup, reviewPlan, adjustmentFrozen, STORE_KEY } from "../src/planStore.js";
import { assessEvidence, weeklyBudget } from "../src/learningModel.js";
import { localPolicy, requestAdaptation } from "../src/adaptation.js";
import * as learning from "../src/learningModel.js";
test("method guidance uses an explicit skill, not free-text diagnosis, and fits the budget", () => {
  assert.equal(typeof learning.methodGuidance, "function");
  const unknown = learning.methodGuidance({ summary: "听力很差" }, weeklyBudget(3));
  assert.equal(unknown.guideId, null);
  const listening = learning.methodGuidance({ measurement: { skill: "listening" } }, weeklyBudget(3));
  assert.equal(listening.guideId, "listening");
  assert.ok(listening.minutes > 0 && listening.minutes <= 36);
  assert.ok(listening.steps.length > 1 && listening.retest.length > 0);
  assert.equal(learning.methodGuidance({ measurement: { skill: "reading" } }, weeklyBudget(0)).minutes, 0);
  assert.equal(learning.methodGuidance({ focusSkill: "writing", availableHours: 0 }).minutes, 0);
  for (const skill of ["reading", "writing", "speaking", "vocabulary"]) {
    assert.equal(learning.methodGuidance({ focusSkill: skill }).guideId, skill);
  }
});
test("not attempted reviews survive backup and do not count as ineffective methods", () => {
  let store = readStore(memory());
  for (const id of ["not-a", "not-b"]) {
    store.revisions.push(entry(id)); store = adoptRevision(store, id, new Date("2026-09-01"));
    store = reviewPlan(store, store.activeId, "not_attempted", "考试周，没有执行", new Date("2026-09-02"));
  }
  assert.equal(adjustmentFrozen(store, entry().input), false);
  assert.equal(parseBackup(JSON.stringify(store)).versions[0].reviews[0].outcome, "not_attempted");
});
const memory = () => { const data = new Map(); return { getItem: (k) => data.get(k) ?? null, setItem: (k,v) => data.set(k,v) }; };
function entry(id = "r1") { return { id, createdAt: "2026-09-12T00:00:00Z", status: "待确认", input: { summary: "本周事情太多", eventType: "schedule", pattern: "less_time", availableHours: 3 }, suggestion: { title: "建议", rationale: "原因", changes: ["模型不能写入的内容"] } }; }
test("adoption persists rule-owned tasks; rollback restores previous snapshot", () => {
  const storage = memory(); let store = readStore(storage); store.revisions = [entry()];
  store = adoptRevision(store, "r1"); const first = activePlan(store);
  assert.ok(first.tasks.length); assert.ok(!JSON.stringify(first).includes("模型不能写入"));
  store.revisions.push(entry("r2")); store = adoptRevision(store, "r2");
  saveStore(store, storage); assert.equal(readStore(storage).versions.length, 2);
  store = rollback(readStore(storage)); assert.deepEqual(activePlan(store), first);
  assert.equal(store.revisions[1].status, "已撤销");
  assert.equal(activePlan(rollback(store)), null);
});
test("legacy and corrupt data are preserved", () => {
  const storage = memory(); storage.setItem("ielts-revisions", JSON.stringify([entry()]));
  assert.equal(readStore(storage).revisions.length, 1);
  storage.setItem(STORE_KEY, "broken"); assert.throws(() => readStore(storage));
  assert.equal(storage.getItem(STORE_KEY), "broken");
});
test("backup round trip; invalid references and duplicate IDs rejected", () => {
  const store = readStore(memory()); store.revisions = [entry()]; const adopted = adoptRevision(store, "r1");
  assert.deepEqual(parseBackup(JSON.stringify(adopted)), adopted);
  assert.throws(() => parseBackup(JSON.stringify({ ...adopted, activeId: "missing" })));
  assert.throws(() => parseBackup(JSON.stringify({ ...store, revisions: [entry(), entry()] })));
});
test("storage failures are reported", () => {
  assert.throws(() => saveStore(readStore(memory()), { setItem() { throw new Error("quota"); } }), /保存失败/);
});
test("reliable evidence requires complete explicit measurement conditions", () => {
  assert.equal(assessEvidence({ evidence: "reliable" }).level, "subjective");
  const measurement = { material: "剑7 T4", skill: "reading", raw: "30", minutes: "60", first: "yes", timed: "yes", complete: "yes", aided: "no", normal: "yes" };
  assert.equal(assessEvidence({ measurement }).level, "reliable");
  assert.equal(assessEvidence({ measurement: { ...measurement, aided: "yes" } }).level, "partial");
  assert.equal(assessEvidence({ measurement: { ...measurement, raw: "41" } }).level, "partial");
});
test("weekly budgets fit available time including recovery", () => {
  for (const hours of [0, 1, 3, 8, 30]) for (const capacity of ["standard", "minimum", "recovery"]) {
    const budget = weeklyBudget(hours, capacity);
    assert.equal(budget.items.reduce((s,i) => s+i.minutes, 0) + budget.reserve, hours*60);
    assert.ok(budget.reserve >= 0);
  }
});
test("observation-only records cannot change the plan", () => {
  const store = readStore(memory()); const record = entry(); record.input = { summary: "一次表现", eventType: "performance", evidence: "partial" }; store.revisions = [record];
  assert.throws(() => adoptRevision(store, record.id), /不适合/);
});
test("reviews persist; two ineffective attempts freeze the same adjustment", () => {
  let store = readStore(memory());
  for (const id of ["a", "b"]) {
    store.revisions.push(entry(id)); store = adoptRevision(store, id, new Date("2026-09-01"));
    store = reviewPlan(store, store.activeId, "ineffective", "按计划执行仍无法完成", new Date("2026-09-09"));
  }
  store.revisions.push(entry("c")); assert.ok(adjustmentFrozen(store, entry().input));
  assert.throws(() => adoptRevision(store, "c"), /连续两次无效/);
  assert.equal(parseBackup(JSON.stringify(store)).versions[0].reviews.length, 1);
  assert.equal(activePlan(store).budget.total, 180);
});
test("early success claims and blank review notes are rejected", () => {
  let store = readStore(memory()); store.revisions.push(entry()); store = adoptRevision(store, "r1", new Date("2026-09-01"));
  assert.throws(() => reviewPlan(store, store.activeId, "effective", "感觉不错", new Date("2026-09-02")), /观察期/);
  assert.throws(() => reviewPlan(store, store.activeId, "uncertain", " "), /依据/);
});
test("repeated materials and overtime reading cannot establish a fresh baseline", () => {
  const measurement = { material: "剑7 T4", skill: "reading", raw: 30, minutes: 60, first: "yes", timed: "yes", complete: "yes", aided: "no", normal: "yes" };
  assert.equal(assessEvidence({ measurement }, [{input:{measurement}}]).level, "partial");
  assert.equal(assessEvidence({measurement:{...measurement, minutes:61}}).level, "partial");
});
test("v2 trends do not trust unverified historical records or duration alone", () => {
  const input = { eventType: "performance", pattern: "drop", evidenceVersion: 2, evidence: "reliable", duration: "month_plus", availableHours: 8 };
  assert.notEqual(localPolicy(input).title, "连续下降需要拆分原因，不直接降低目标");
  assert.notEqual(localPolicy({ ...input, history: [{ eventType: "performance", pattern: "drop" }, { eventType: "performance", pattern: "drop" }] }).title, "连续下降需要拆分原因，不直接降低目标");
  assert.match(localPolicy({ ...input, history: [1,2].map(() => ({ eventType: "performance", pattern: "drop", evidence: "reliable" })) }).title, /连续下降/);
});
test("unconfigured API stays entirely local", async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error("network"); };
  try { assert.equal((await requestAdaptation(entry().input)).mode, "rules"); assert.equal(calls, 0); }
  finally { globalThis.fetch = original; }
});
