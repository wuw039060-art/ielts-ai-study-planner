import { monthlyPlan, phases } from "./data.js";

export function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7).replace("-", ".");
}

export function currentPhase(date = new Date()) {
  const today = localDateKey(date);
  return phases.find((phase) => today >= phase.start && today <= phase.end)
    || (today < phases[0].start ? phases[0] : phases.at(-1));
}

function buildMonthlyReference(month, monthKey) {
  if (!month) return null;
  const [year, numericMonth] = monthKey.split(".");
  const displayMonth = Number(numericMonth);
  return {
    eyebrow: `${year} 年 ${displayMonth} 月计划 · 按当前日期自动更新`,
    title: month.title,
    summary: `${month.context} ${month.rhythm}`,
    actionLabel: "核对本月进度并更新实际情况",
    actions: month.actions,
    acceptance: month.acceptance,
    recovery: month.recovery,
    constraints: [
      { title: "本月材料与产出", detail: month.books },
      { title: "本月执行节奏", detail: month.rhythm },
      { title: "落后时怎么调整", detail: month.recovery },
    ],
  };
}

export function getCalendarContext(date = new Date()) {
  const dateKey = localDateKey(date);
  const monthKey = localMonthKey(date);
  const month = monthlyPlan.find((item) => item.month === monthKey) || null;
  return {
    dateKey,
    monthKey,
    phase: currentPhase(date),
    month,
    reference: buildMonthlyReference(month, monthKey),
  };
}
