import assert from "node:assert/strict";
import test from "node:test";

async function loadSchedule() {
  return import("../src/schedule.js").catch(() => ({}));
}

test("September dashboard uses the September plan instead of the July baseline", async () => {
  const { getCalendarContext } = await loadSchedule();

  assert.equal(typeof getCalendarContext, "function");
  const context = getCalendarContext(new Date(2026, 8, 20, 12));

  assert.equal(context.dateKey, "2026-09-20");
  assert.equal(context.monthKey, "2026.09");
  assert.equal(context.phase.id, "foundation");
  assert.equal(context.month.month, "2026.09");
  assert.equal(context.month.title, "把流程带回学校");
  assert.ok(context.reference);
  assert.equal(context.reference.eyebrow, "2026 年 9 月计划 · 按当前日期自动更新");
  assert.equal(context.reference.title, "把流程带回学校");
  assert.match(context.reference.summary, /真实周容量/);
  assert.equal(context.reference.actions.length, 4);
  assert.equal(context.reference.constraints[0].title, "本月材料与产出");
});
