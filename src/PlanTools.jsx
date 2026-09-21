import { useState } from "react";
import { activePlan, readStore, saveStore, rollback, parseBackup, reviewPlan, STORE_KEY } from "./planStore.js";
import { weeklyBudget, methodGuidance } from "./learningModel.js";

const reviewLabels = { effective: "执行后已有改善", ineffective: "执行后无改善或更差", uncertain: "证据不足", not_attempted: "尚未执行，不评价方法效果" };

export function MethodNextStep({ input, budget, onNavigate }) {
  const guidance = methodGuidance(input, budget);
  return <details><summary>{guidance.title}</summary>
    <p>本次只处理一个问题。最多使用现有预算中的 {guidance.minutes} 分钟，包含检查与复盘，不额外加量；后续复测也占相应周预算。这里只是排查入口，不是错因诊断。</p>
    <ol>{guidance.steps.map((step) => <li key={step}>{step}</li>)}</ol>
    <p>完成标准与复测：{guidance.retest}</p>
    <button type="button" onClick={() => onNavigate("methods", guidance.guideId || undefined)}>{guidance.guideId ? "查看对应方法的完整步骤" : "打开方法手册选择科目"}</button>
  </details>;
}

function download(raw, name) {
  const url = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
  const link = document.createElement("a"); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function PlanPanel({ reference, onSaved, onNavigate }) {
  const [, redraw] = useState(0);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState("uncertain");
  const [note, setNote] = useState("");
  let store;
  try { store = readStore(); } catch (e) { return <p role="alert">{e.message}</p>; }
  const plan = activePlan(store);
  const source = store.revisions.find((r) => r.id === plan?.revisionId);
  const budget = plan?.budget || weeklyBudget(source?.input.availableHours, source?.input.capacity);
  const due = plan && Date.now() >= Date.parse(plan.reviewAt);
  const parent = store.versions.find((v) => v.id === plan?.parentId);
  function undo() {
    try { saveStore(rollback(readStore())); redraw((v) => v + 1); onSaved?.(); }
    catch (e) { setError(e.message); }
  }
  function review() {
    try { saveStore(reviewPlan(readStore(), plan.id, outcome, note)); setNote(""); setError(""); redraw((v) => v + 1); onSaved?.(); }
    catch (e) { setError(e.message); }
  }
  return <section className="plan-tools">
    <p className="eyebrow">{plan ? `近期安排 · 版本 ${store.versions.indexOf(plan) + 1}` : reference?.eyebrow || "本周安排 · 基础参考"}</p>
    <h2>{plan?.title || reference?.title || "先建立可持续的一周"}</h2>
    <p>{plan?.reason || reference?.summary || "尚未收到新的情况确认。以下按每周 8 小时估算；请在更新情况中填写真实时间，采用建议后这里会更新。"}</p>
    {!plan && reference && <>
      <h3>本月优先动作</h3>
      <ol>{reference.actions.map((action) => <li key={action}>{action}</li>)}</ol>
      <p><strong>本月验收：</strong>{reference.acceptance.join("；")}</p>
      <p><strong>落后处理：</strong>{reference.recovery}</p>
    </>}
    {plan && <>
      <p>依据：{source?.input.summary}</p>
      <p>取代：{parent?.title || "初始参考安排"}。年度目标仍为 8 分；阶段验收不因此通过。</p>
      <ol>{plan.tasks.map((task) => <li key={task.id}>{task.action}</li>)}</ol>
      <MethodNextStep input={source?.input} budget={budget} onNavigate={onNavigate} />
      <p><strong>{due ? "已到复查时间" : "复查日期"}：{new Date(plan.reviewAt).toLocaleDateString("zh-CN")}</strong>。{plan.success}</p>
      <button type="button" onClick={undo}>撤销这次安排，恢复上一版本</button>
      <details><summary>记录这次调整的效果</summary>
        <p>区分安排更容易执行和能力真正提高。请写实际完成情况、主要困难变化，以及支持判断的复测或作品反馈。</p>
        <label>复查结论<select value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          {Object.entries(reviewLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {outcome === "not_attempted" && <p>先说明没有执行的阻力，下次更新情况时优先减小任务或调整时段；本次不计入方法连续无效。</p>}
        <label>复查依据<textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={20000} /></label>
        <button type="button" disabled={!note.trim()} onClick={review}>保存复查</button>
        {(plan.reviews || []).map((r, i) => <p key={i}>{new Date(r.at).toLocaleDateString("zh-CN")} · {reviewLabels[r.outcome]}：{r.note}</p>)}
      </details>
    </>}
    <h3>本周时间怎么分</h3>
    <p>总可用 {budget.total} 分钟，其中 {budget.reserve} 分钟留作缓冲。下表包含复盘时间；上面的调整在这份预算内执行，不另行叠加。时间不足时拆小任务，整册完成日期允许顺延。</p>
    <ul>{budget.items.map((item) => <li key={item.skill}><strong>{item.skill} · {item.minutes} 分钟</strong>：{item.output}</li>)}</ul>
    <p>这是通用起点，尚未根据四科有效成绩计算个人优先级。先保留四科接触，再用可靠反馈确定本周唯一重点。</p>
    {error && <p role="alert">{error}</p>}
    <details><summary>查看历次安排与复查</summary>{store.versions.length === 0 ? <p>尚未采用过近期安排。</p> : store.versions.map((v, index) => <article key={v.id}>
      <h3>版本 {index + 1} · {v.title}{v.id === store.activeId ? "（当前）" : ""}</h3>
      <p>{v.reason}</p><ul>{v.tasks.map((t) => <li key={t.id}>{t.action}</li>)}</ul>
      {(v.reviews || []).map((r, i) => <p key={i}>{new Date(r.at).toLocaleDateString("zh-CN")} · {reviewLabels[r.outcome]}：{r.note}</p>)}
    </article>)}</details>
  </section>;
}

export function DataTools({ onSaved }) {
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(null);
  let problem = "";
  try { readStore(); } catch (e) { problem = e.message; }
  function exportData(raw = false) {
    try {
      const data = raw ? JSON.stringify({ current: localStorage.getItem(STORE_KEY), legacy: localStorage.getItem("ielts-revisions"), beforeRestore: localStorage.getItem("ielts-before-restore") }) : JSON.stringify(readStore(), null, 2);
      download(data, raw ? "雅思记录-原始恢复材料.json" : "雅思学习记录备份.json");
      setMessage("已发起下载。学习备份含你的描述和计划，不含 API 配置；请妥善保存。");
    } catch (e) { setMessage(e.message); }
  }
  async function choose(event) {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) throw new Error("文件超过 10MB。");
      setPending(parseBackup(await file.text())); setMessage("");
    } catch (e) { setPending(null); setMessage(`导入未执行：${e.message}`); }
  }
  function restore() {
    try {
      // Keep the exact previous bytes for recovery before the single atomic write.
      localStorage.setItem("ielts-before-restore", JSON.stringify({ current: localStorage.getItem(STORE_KEY), legacy: localStorage.getItem("ielts-revisions") }));
      saveStore(pending); setPending(null); setMessage("备份已恢复，恢复前的数据副本仍保留在当前浏览器。"); onSaved();
    } catch (e) { setMessage(e.message); }
  }
  return <aside className="data-tools">
    {problem && <p role="alert">{problem}</p>}
    <details><summary>学习记录与备份</summary>
      <p>记录和计划只保存在当前浏览器。换设备前导出备份；API 密钥请在智能分析里单独导出密文。</p>
      <button type="button" onClick={() => exportData()}>导出学习备份</button>{" "}
      <button type="button" onClick={() => exportData(true)}>导出原始恢复材料</button>{" "}
      <label>选择学习备份 <input type="file" accept=".json,application/json" onChange={choose} /></label>
      {pending && <div><p>备份包含 {pending.revisions.length} 条记录、{pending.versions.length} 个计划版本。恢复会替换当前学习记录，先导出当前备份可保留两份。</p>
        <button type="button" onClick={restore}>确认恢复这份备份</button>{" "}<button type="button" onClick={() => setPending(null)}>取消</button></div>}
      {message && <p role="status">{message}</p>}
    </details>
  </aside>;
}
