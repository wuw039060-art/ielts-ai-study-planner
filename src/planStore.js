import { localPolicy } from "./adaptation.js";
import { weeklyBudget } from "./learningModel.js";

export const STORE_KEY = "ielts-handbook-v2";
const legacyKey = "ielts-revisions";
const empty = () => ({ schema: 2, revisions: [], versions: [], activeId: null });
const text = (value) => typeof value === "string" && value.length <= 20000;
const date = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
export function validateStore(value) {
  if (!value || value.schema !== 2 || !Array.isArray(value.revisions) || !Array.isArray(value.versions)) throw new Error("备份格式或版本不受支持。");
  const ids = new Set();
  for (const entry of value.revisions) {
    if (!entry || !text(entry.id) || ids.has(entry.id) || !date(entry.createdAt) || !text(entry.input?.summary)
      || !text(entry.suggestion?.title) || !text(entry.suggestion?.rationale)
      || !Array.isArray(entry.suggestion.changes) || entry.suggestion.changes.length > 3 || !entry.suggestion.changes.every(text)
      || !["待确认", "已采用", "未采用", "已撤销"].includes(entry.status)) throw new Error("学习记录不完整或重复，未覆盖现有数据。");
    ids.add(entry.id);
  }
  const versions = new Set();
  for (const version of value.versions) {
    if (!version || !text(version.id) || versions.has(version.id) || !ids.has(version.revisionId)
      || !date(version.createdAt) || !date(version.reviewAt) || version.goal !== 8
      || !text(version.title) || !text(version.reason) || !text(version.success)
      || !Array.isArray(version.tasks) || version.tasks.length < 1 || version.tasks.length > 3
      || !version.tasks.every((task) => text(task.id) && text(task.action))
      || (version.parentId !== null && !versions.has(version.parentId))) throw new Error("计划版本不完整，未覆盖现有数据。");
    versions.add(version.id);
    if (version.budget && (!Number.isFinite(version.budget.total) || version.budget.total < 0 || version.budget.total > 1800
      || !Number.isFinite(version.budget.reserve) || version.budget.reserve < 0 || !Array.isArray(version.budget.items)
      || !version.budget.items.every((i) => text(i.skill) && text(i.output) && Number.isFinite(i.minutes) && i.minutes >= 0)
      || version.budget.items.reduce((n, i) => n + i.minutes, version.budget.reserve) !== version.budget.total)) throw new Error("计划时间预算无效。");
    if (version.reviews && (!Array.isArray(version.reviews) || !version.reviews.every((r) => date(r.at)
      && ["effective", "ineffective", "uncertain", "not_attempted"].includes(r.outcome) && text(r.note) && r.note.trim()))) throw new Error("复查记录无效。");
  }
  if (value.activeId !== null && !versions.has(value.activeId)) throw new Error("当前计划引用无效。");
  return value;
}
export function readStore(storage = localStorage) {
  try {
    const saved = storage.getItem(STORE_KEY);
    if (saved !== null) return validateStore(JSON.parse(saved));
    const old = storage.getItem(legacyKey);
    return validateStore({ ...empty(), revisions: old ? JSON.parse(old) : [] });
  } catch (error) {
    throw new Error(`无法读取学习记录，原数据已保留。请先导出原始数据再恢复。${error.message}`);
  }
}
export function saveStore(value, storage = localStorage) {
  validateStore(value);
  try { storage.setItem(STORE_KEY, JSON.stringify(value)); }
  catch { throw new Error("保存失败：浏览器存储不可用或空间不足。输入仍保留，请导出已有记录后重试。"); }
}
export function activePlan(store) { return store.versions.find((v) => v.id === store.activeId) || null; }
export function adjustmentFrozen(store, input) {
  const matching = store.versions.filter((v) => {
    const record = store.revisions.find((r) => r.id === v.revisionId);
    return record?.input.eventType === input.eventType && record?.input.pattern === input.pattern;
  }).slice(-2);
  return matching.length === 2 && matching.every((v) => v.reviews?.at(-1)?.outcome === "ineffective");
}
export function reviewPlan(store, id, outcome, note, now = new Date()) {
  const version = store.versions.find((v) => v.id === id);
  if (!version || !["effective", "ineffective", "uncertain", "not_attempted"].includes(outcome) || !text(note) || !note.trim()) throw new Error("请填写复查结论和具体依据。");
  if (outcome === "effective" && now.getTime() < Date.parse(version.reviewAt)) throw new Error("观察期尚未结束，可先记录证据不足或提前发现的问题。");
  return validateStore({ ...store, versions: store.versions.map((v) => v.id === id
    ? { ...v, reviews: [...(v.reviews || []), { at: now.toISOString(), outcome, note: note.trim() }] } : v) });
}
export function adoptRevision(store, id, now = new Date()) {
  const entry = store.revisions.find((r) => r.id === id);
  if (!entry || entry.status !== "待确认") throw new Error("这条建议已处理，请刷新记录。");
  if (adjustmentFrozen(store, entry.input)) throw new Error("同类调整连续两次无效，已暂停继续采用。请先复查历史、实际耗时和错因；可撤销安排，或补充证据后修正原复查结论。");
  const suggestion = localPolicy(entry.input);
  if (!["micro", "weekly"].includes(suggestion.scope)) throw new Error("这条记录不适合直接调整近期安排，请保留为观察或另行确认重要决定。");
  const versionId = `plan-${store.versions.length + 1}-${now.getTime()}`;
  const version = {
    id: versionId, parentId: store.activeId, revisionId: id, createdAt: now.toISOString(),
    reviewAt: new Date(now.getTime() + 7 * 86400000).toISOString(), goal: 8,
    budget: weeklyBudget(entry.input.availableHours, entry.input.capacity), reviews: [],
    title: suggestion.title, reason: suggestion.rationale,
    success: "七天后检查这些安排是否可执行、主要困难是否改善；能力变化只用未见材料或外部反馈判断。未改善时撤销或重新更新情况。",
    tasks: suggestion.changes.map((action, index) => ({ id: `${versionId}-${index}`, action })),
  };
  return validateStore({ ...store, activeId: versionId, versions: [...store.versions, version],
    revisions: store.revisions.map((r) => r.id === id ? { ...r, status: "已采用" } : r) });
}
export function rollback(store) {
  const current = activePlan(store);
  if (!current) throw new Error("没有可撤销的安排。");
  return { ...store, activeId: current.parentId,
    revisions: store.revisions.map((r) => r.id === current.revisionId ? { ...r, status: "已撤销" } : r) };
}
export function parseBackup(raw) {
  if (raw.length > 10 * 1024 * 1024) throw new Error("备份超过 10MB，请拆分后处理。");
  return validateStore(JSON.parse(raw));
}
