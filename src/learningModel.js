// Measurements are optional. Missing conditions never become a verified score.
export function assessEvidence(input, records = []) {
  const e = input.measurement;
  if (!e) return { level: "subjective", reason: "未提供阶段测量条件；用于理解情况，不推算能力。" };
  if (!e.material?.trim() || !["listening", "reading"].includes(e.skill)
    || e.raw === "" || !Number.isInteger(Number(e.raw)) || Number(e.raw) < 0 || Number(e.raw) > 40
    || !Number.isFinite(Number(e.minutes)) || Number(e.minutes) <= 0) {
    return { level: "partial", reason: "材料、科目、原始分或用时不完整。" };
  }
  if (e.first !== "yes" || e.timed !== "yes" || e.complete !== "yes" || e.aided !== "no" || e.normal !== "yes") {
    return { level: "partial", reason: "熟题、辅助作答、未完成、状态异常或条件待确认，只用于局部诊断。" };
  }
  if (e.skill === "reading" && Number(e.minutes) > 60) return { level: "partial", reason: "阅读超过 60 分钟，可用于复盘，不作为标准计时成绩。" };
  const material = e.material.trim().toLowerCase().replace(/\s+/g, "");
  if (records.some((r) => r.input?.measurement?.skill === e.skill && r.input.measurement.material?.trim().toLowerCase().replace(/\s+/g, "") === material)) {
    return { level: "partial", reason: "这份材料已有同科目记录，按重复接触处理，不计为独立复测。" };
  }
  return { level: "reliable", reason: "已确认未见、完整、计时、无查词回放且状态正常；仍需独立复测。" };
}

export function weeklyBudget(hours = 8, capacity = "standard") {
  const value = Number(hours);
  const total = Math.floor(Math.max(0, Math.min(30, Number.isFinite(value) ? value : 8)) * 60);
  const factor = capacity === "recovery" ? 0.3 : capacity === "minimum" ? 0.6 : 0.8;
  const work = Math.floor(total * factor);
  const items = [
    ["听力", 0.25, "一次短测，找出主要漏听原因，隔天无稿检查"],
    ["阅读", 0.2, "一篇或一组题，留下定位证据与同义改写"],
    ["写作", 0.2, "完成一个可反馈的段落或初稿，并重写关键段"],
    ["口语", 0.15, "保留首答录音，纠正一个问题后重新表达"],
    ["词汇与周复盘", 0.2, "到期复习优先，检查本周最重要的问题是否改善"],
  ].map(([skill, ratio, output]) => ({ skill, minutes: Math.floor(work * ratio), output }));
  return { total, reserve: total - items.reduce((sum, i) => sum + i.minutes, 0), items };
}

// Local, diagnostic guidance only: selecting a skill is not a diagnosis.
export function methodGuidance(input = {}, budget = weeklyBudget(input.availableHours, input.capacity)) {
  const routes = {
    listening: ["听力", ["选一处漏听，先不看稿重听，再看稿区分生词、声音识别或干扰项。", "只处理这一处：生词保留音义；认识却听不出时，对照原音短句跟读；选错时写出证据。"], "隔天无稿检查原片段；随后在未见同类片段检查同一问题。熟片段听懂仅代表修复，不代表分数提高。"],
    reading: ["阅读", ["选一道错题，保留原答案、定位句和题干改写。", "区分未定位、句意误解和选项误判；用原文说明正确答案及排除理由。"], "在未见同题型小组上检查能否独立定位并解释答案，记录用时；局部练习不换算整套分数。"],
    writing: ["写作", ["保留一段初稿，借助已有反馈只选一个问题：回应题目、论证或语言。", "重写该段，明确哪一句发生改变及原因；没有反馈时先按方法手册自查，不自行估分。"], "换一个题目写新段，检查同类问题是否复发；能力判断仍需独立外部反馈。"],
    speaking: ["口语", ["保留一次首答录音，回听后只选一个影响表达的问题。", "用关键词重新组织并重说，不背整段答案；对照首答记录具体变化。"], "换一道未准备的问题再录音，检查能否自然表达；熟题重说更顺不等于口语分数提高。"],
    vocabulary: ["词汇与周复盘", ["从实际失分或表达缺口选一个词块，保留原句、声音和使用场景。", "先主动提取再核对，只维护已有词库，不另开新词表。"], "七天后不看答案提取，再在新语境识别或使用；认识卡片不等于能够迁移。"],
  };
  const key = input.focusSkill || input.measurement?.skill;
  const route = routes[key];
  const minutes = Math.min(20, budget.items.find((i) => i.skill === (route?.[0] || "词汇与周复盘"))?.minutes || 0);
  return {
    guideId: route ? key : null,
    title: route ? `${route[0]}：先验证一个问题` : "先明确问题，不猜测薄弱项",
    minutes,
    steps: minutes < 10 ? ["本周该项预算不足 10 分钟，暂不新增练习；保留问题，下一次有完整空档时再处理。"] : route ? route[1] : ["回看一份已有练习或作品，指出具体卡住的地方。", "在更新情况中选择相关科目；若只是时间或状态变化，先检查安排能否执行，不判断能力。"],
    retest: route ? route[2] : "下次复查先说明是否执行、阻力是否减轻；没有可比作品或测量时保留能力判断。",
  };
}
