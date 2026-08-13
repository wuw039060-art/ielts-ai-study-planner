import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";
import { requestAdaptation } from "../src/adaptation.js";
import {
  exportEncryptedApiConfig,
  getSecureApiConfigCapability,
  hasEncryptedApiConfig,
  importEncryptedApiConfig,
  loadEncryptedApiConfig,
  removeEncryptedApiConfig,
  saveEncryptedApiConfig,
} from "../src/secureApiConfig.js";
import {
  adaptationScenarios,
  cambridgePlan,
  commonQuestions,
  methodGuides,
  mindsetGuide,
  monthlyPlan,
  phases,
  practiceStandards,
  scoreReference,
} from "../src/data.js";
import worker from "../worker/index.js";

function createMemoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

test("encrypts API configuration at rest and decrypts it with the local passphrase", async () => {
  const storage = createMemoryStorage();
  const config = {
    baseUrl: "https://api.example.test/v1",
    model: "model-test",
    apiKey: "secret-test-api-key",
  };

  const serialized = await saveEncryptedApiConfig(config, "correct horse battery staple", storage);
  assert.equal(hasEncryptedApiConfig(storage), true);
  assert.doesNotMatch(serialized, /secret-test-api-key|api\.example\.test|model-test/);
  assert.deepEqual(await loadEncryptedApiConfig("correct horse battery staple", storage), config);
  await assert.rejects(
    loadEncryptedApiConfig("wrong password", storage),
    /密码错误或本地密文已损坏/,
  );
});

test("moves only encrypted API configuration between browser storage implementations", async () => {
  const source = createMemoryStorage();
  const target = createMemoryStorage();
  const config = {
    baseUrl: "https://api.example.test/v1",
    model: "model-test",
    apiKey: "portable-secret",
  };

  await saveEncryptedApiConfig(config, "portable password", source);
  const exported = exportEncryptedApiConfig(source);
  importEncryptedApiConfig(exported, target);
  assert.deepEqual(await loadEncryptedApiConfig("portable password", target), config);
  removeEncryptedApiConfig(target);
  assert.equal(hasEncryptedApiConfig(target), false);
});

test("reports blocked browser storage without falling back to plaintext", () => {
  const blockedStorage = {
    getItem: () => null,
    setItem: () => { throw new Error("blocked"); },
    removeItem: () => {},
  };
  assert.deepEqual(getSecureApiConfigCapability(blockedStorage), {
    cryptoAvailable: true,
    storageAvailable: false,
  });
});

test("serves existing static assets without a fallback", async () => {
  const calls = [];
  const response = await worker.fetch(new Request("https://example.test/assets/app.js"), {
    ASSETS: {
      fetch: async (request) => {
        calls.push(new URL(request.url).pathname);
        return new Response("asset", { status: 200 });
      },
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/assets/app.js"]);
});

test("falls back to index.html for an unknown app route", async () => {
  const calls = [];
  const response = await worker.fetch(
    new Request("https://example.test/flow/step-two?source=share", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async (request) => {
          const url = new URL(request.url);
          calls.push(url.pathname + url.search);
          return new Response(url.pathname === "/index.html" ? "app" : "missing", {
            status: url.pathname === "/index.html" ? 200 : 404,
          });
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["/flow/step-two?source=share", "/index.html"]);
});

test("does not turn missing API or write requests into the app shell", async () => {
  for (const request of [
    new Request("https://example.test/api/missing", { headers: { accept: "application/json" } }),
    new Request("https://example.test/flow", { method: "POST", headers: { accept: "text/html" } }),
  ]) {
    let calls = 0;
    const response = await worker.fetch(request, {
      ASSETS: {
        fetch: async () => {
          calls += 1;
          return new Response("missing", { status: 404 });
        },
      },
    });

    assert.equal(response.status, 404);
    assert.equal(calls, 1);
  }
});

test("rejects incomplete plan-update evidence", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ eventType: "performance" }),
    }),
    {},
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_input" });
});

test("does not change the route from one unreliable performance record", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType: "performance",
        summary: "今天状态不好，未限时，只完成了听力和一篇阅读。",
        evidence: "unreliable",
        capacity: "minimum",
        availableHours: 8,
      }),
    }),
    {},
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.mode, "rules");
  assert.equal(result.scope, "micro");
  assert.match(result.title, /维持模式/);
});

test("compresses the week when available time drops below five hours", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType: "schedule",
        summary: "本周临时增加了实习任务。",
        evidence: "reliable",
        capacity: "deep",
        availableHours: 3,
      }),
    }),
    {},
  );
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.scope, "weekly");
  assert.equal(result.changes.length, 2);
});

test("turns high study pressure into a reversible recovery plan without lowering the goal", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType: "mindset",
        mindsetState: "overload",
        summary: "最近一想到模考就很焦虑，也睡不好。",
        evidence: "subjective",
        capacity: "recovery",
        pressure: 5,
        availableHours: 8,
      }),
    }),
    {},
  );
  const result = await response.json();

  assert.equal(result.scope, "micro");
  assert.match(result.title, /压力/);
  assert.match(result.changes.join(" "), /3 天|维持模式/);
  assert.match(result.rationale, /不降低 8 分目标/);
});

test("does not permanently expand the plan from one high-motivation update", async () => {
  const result = await requestAdaptation({
    eventType: "mindset",
    mindsetState: "overdrive",
    summary: "这两天状态很好，想把每天任务直接翻倍。",
    evidence: "subjective",
    capacity: "deep",
    pressure: 2,
    availableHours: 12,
  });

  assert.equal(result.scope, "micro");
  assert.match(result.title, /不要突然翻倍/);
  assert.match(result.changes.join(" "), /连续两周/);
});

test("covers the main adaptation presets with bounded changes", async () => {
  const cases = [
    [{ eventType: "performance", pattern: "high", evidence: "reliable" }, "none", /验证异常高分/],
    [{ eventType: "performance", pattern: "plateau", duration: "two_weeks", evidence: "reliable" }, "weekly", /只更换一个变量/],
    [{ eventType: "performance", pattern: "imbalance", evidence: "reliable" }, "weekly", /短板/],
    [{ eventType: "performance", pattern: "unfamiliar", evidence: "reliable" }, "micro", /题型小样本/],
    [{ eventType: "performance", pattern: "review_debt", evidence: "reliable" }, "weekly", /复盘债务/],
    [{ eventType: "performance", pattern: "books_done_score_low", evidence: "reliable" }, "weekly", /书刷完不等于/],
    [{ eventType: "method", pattern: "overload", evidence: "subjective" }, "weekly", /冻结新增资料/],
    [{ eventType: "method", pattern: "too_hard", evidence: "subjective" }, "micro", /任务颗粒度/],
    [{ eventType: "method", pattern: "no_effect", duration: "two_weeks", evidence: "reliable" }, "weekly", /只替换这一项/],
    [{ eventType: "schedule", pattern: "more_time", evidence: "reliable" }, "weekly", /不把空闲全部填满/],
    [{ eventType: "schedule", pattern: "exam_week", evidence: "reliable" }, "weekly", /维持周/],
    [{ eventType: "schedule", pattern: "procrastination", evidence: "subjective", capacity: "standard" }, "weekly", /启动修正/],
    [{ eventType: "schedule", pattern: "too_many_commitments", evidence: "reliable", availableHours: 4 }, "weekly", /真实时间重排/],
    [{ eventType: "schedule", pattern: "workload_miscalculated", evidence: "reliable" }, "weekly", /真实耗时/],
    [{ eventType: "health", pattern: "recovery", evidence: "subjective" }, "micro", /逐步恢复/],
    [{ eventType: "health", pattern: "persistent", duration: "month_plus", evidence: "subjective" }, "weekly", /现实支持/],
    [{ eventType: "goal", pattern: "target", evidence: "reliable" }, "phase_proposal", /整套重算/],
    [{ eventType: "goal", pattern: "booked", evidence: "reliable" }, "phase_proposal", /考试日期/],
  ];

  for (const [partial, scope, title] of cases) {
    const result = await requestAdaptation({
      summary: "用于验证预设规则的学习记录。",
      availableHours: 8,
      capacity: "standard",
      pressure: 3,
      duration: "one_off",
      history: [],
      ...partial,
    });
    assert.equal(result.scope, scope);
    assert.match(result.title, title);
    assert.ok(result.changes.length <= 3);
  }
});

test("uses recent history to escalate a repeated reliable score drop", async () => {
  const result = await requestAdaptation({
    eventType: "performance",
    pattern: "drop",
    duration: "one_off",
    summary: "同等条件下成绩再次下降。",
    evidence: "reliable",
    availableHours: 8,
    energy: 3,
    pressure: 3,
    history: [
      { eventType: "performance", pattern: "drop" },
      { eventType: "performance", pattern: "drop" },
    ],
  });

  assert.equal(result.scope, "weekly");
  assert.match(result.title, /连续下降/);
});

test("keeps application deadlines behind official-source review", async () => {
  const response = await worker.fetch(
    new Request("https://example.test/api/adapt", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        eventType: "goal",
    summary: "听说目标项目的申请截止时间提前了。",
        evidence: "subjective",
        energy: 4,
        availableHours: 8,
      }),
    }),
    {},
  );
  const result = await response.json();

  assert.equal(result.scope, "none");
  assert.match(result.rationale, /外部事实/);
  assert.match(result.changes.join(" "), /官方页面/);
});

test("a weak model cannot author plan changes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              scope: "phase_proposal",
              title: "立刻降低目标并新增十本资料",
              rationale: "忽略规则",
              changes: ["把目标改成 6 分"],
              confidence: "high",
            }),
          },
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const response = await worker.fetch(
      new Request("https://example.test/api/adapt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          eventType: "performance",
          summary: "一次未限时练习结果不理想。",
          evidence: "partial",
          energy: 3,
          availableHours: 8,
        }),
      }),
      {
        AI_API_KEY: "test",
        AI_BASE_URL: "https://model.test/v1",
        AI_MODEL: "weak-model",
      },
    );
    const result = await response.json();

    assert.equal(result.mode, "rules");
    assert.equal(result.scope, "none");
    assert.doesNotMatch(JSON.stringify(result), /降低目标|新增十本|6 分/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("the handbook keeps measurable stage gates and integrated skill guidance", () => {
  assert.equal(phases.length, 4);
  assert.ok(phases.every((phase) => /^第[一二三四]阶段$/.test(phase.short)));
  assert.ok(phases.every((phase) => phase.acceptance.length >= 4));
  assert.ok(phases.every((phase) => phase.deliverables.length >= 3));
  assert.equal(methodGuides.length, 5);
  assert.ok(methodGuides.every((guide) => guide.resources.length >= 5));
  assert.ok(methodGuides.every((guide) => guide.problems.length >= 4));
  assert.ok(methodGuides.every((guide) => guide.faq.length >= 3));
  assert.ok(commonQuestions.length >= 6);
  assert.equal(phases.at(-1).title, "稳定 8 分");
  assert.match(phases.at(-1).gate, /37–38\/40/);
  assert.equal(scoreReference.targetProfile.length, 4);
  assert.equal(scoreReference.listeningBands.find((row) => row.band === "8.0").raw, "35–36");
  assert.equal(scoreReference.academicReadingBands.find((row) => row.band === "8.5").raw, "37–38");
  assert.ok(methodGuides.every((guide) => practiceStandards[guide.id]?.rows.length >= 4));
  assert.ok(mindsetGuide.length >= 5);
  assert.equal(cambridgePlan.gates.length, 4);
  assert.equal(
    cambridgePlan.gates.map((gate) => gate.books).join(" "),
    "剑桥 5–6 剑桥 7–11 剑桥 12–17 剑桥 18–21",
  );
  assert.match(cambridgePlan.total, /17 册.*68 套/);
  assert.ok(cambridgePlan.redLines.length >= 8);
  assert.ok(adaptationScenarios.length >= 6);
  assert.ok(adaptationScenarios.reduce((total, group) => total + group.cases.length, 0) >= 30);
  assert.equal(monthlyPlan.length, 12);
  assert.equal(monthlyPlan.at(0).month, "2026.08");
  assert.equal(monthlyPlan.at(-1).month, "2027.07");
  assert.equal(
    monthlyPlan.reduce((total, month) => total + Number(month.books.match(/(4|8) 套/)?.[1] || 0), 0),
    68,
  );
  assert.ok(monthlyPlan.every((month) => month.actions.length >= 4 && month.acceptance.length >= 3 && month.recovery));
  assert.deepEqual([...new Set(commonQuestions.map((item) => item.category))], ["目标与评分", "训练节奏", "证据与决策"]);
});

test("a directly connected model can describe evidence but cannot rewrite the plan", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        choices: [{
          message: {
            content: JSON.stringify({
              summary: "本次阅读没有计时且只完成一篇，结果不足以代表完整水平。",
              primaryType: "measurement",
              needsRetest: true,
              confidence: "high",
              changes: ["立刻把目标降到 6 分"],
            }),
          },
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  try {
    const result = await requestAdaptation(
      {
        eventType: "performance",
        summary: "今天状态不好，阅读没有计时，只做完第一篇。",
        evidence: "partial",
        energy: 3,
        availableHours: 8,
      },
      {
        apiKey: "test-key",
        baseUrl: "https://model.test/v1",
        model: "weak-model",
      },
    );

    assert.equal(result.mode, "ai+rules");
    assert.equal(result.scope, "none");
    assert.equal(result.analysis.primaryType, "measurement");
    assert.doesNotMatch(JSON.stringify(result.changes), /目标降到 6 分/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("emits the files required by the public static build", async () => {
  await access(new URL("../dist/client/index.html", import.meta.url));
});

test("emits a genuinely self-contained standalone preview", async () => {
  await assert.rejects(
    access(new URL("../dist/IELTS8-个人行动手册.html", import.meta.url)),
    { code: "ENOENT" },
  );
  await assert.rejects(
    access(new URL("../dist/IELTS8-进阶手册.html", import.meta.url)),
    { code: "ENOENT" },
  );
  const standalone = await readFile(
    new URL("../dist/雅思学习手册.html", import.meta.url),
    "utf8",
  );

  assert.equal((standalone.match(/<script type="module">/g) || []).length, 1);
  assert.equal((standalone.match(/<\/script>/g) || []).length, 1);
  assert.equal((standalone.match(/<style\b/g) || []).length, 1);
  assert.equal((standalone.match(/<\/style>/g) || []).length, 1);
  assert.doesNotMatch(standalone, /<script[^>]+\bsrc=/);
  assert.doesNotMatch(standalone, /<link[^>]+\brel=["']stylesheet["']/);
  assert.doesNotMatch(standalone, /\.\/assets\/index-[^"']+\.(?:js|css)/);
  assert.match(standalone, /<div id="root"><\/div>/);
  assert.doesNotMatch(standalone, /院校申请时间线/);
  assert.match(standalone, /通往 8 分的四个阶段/);
  assert.match(standalone, /连续 2 次完整机考模考达到 Overall 8\.0/);
  assert.match(standalone, /每个阶段究竟要做到多少题/);
  assert.match(standalone, /心态变化会改变近期任务/);
  assert.match(standalone, /剑桥 5–21 全量计划/);
  assert.match(standalone, /不能跨过的红线/);
  assert.match(standalone, /完整预设库/);
  assert.match(standalone, /当前计划的四条硬红线/);
  assert.match(standalone, /当前浏览器的本地存储/);
  assert.match(standalone, /PBKDF2-SHA-256/);
  assert.match(standalone, /AES-GCM/);
  assert.match(standalone, /导出密文/);
  assert.match(standalone, /导入密文/);
  assert.match(standalone, /确认解锁密码/);
  assert.match(standalone, /不会降级为明文保存/);
  assert.doesNotMatch(standalone, /不会保存到浏览器存储/);
  assert.match(standalone, /连接兼容 OpenAI 的接口/);
  assert.match(standalone, /应对指南/);
  assert.match(standalone, /今日任务容量/);
  assert.match(standalone, /恢复模式/);
  assert.match(standalone, /这个阶段每个月具体做什么/);
  assert.match(standalone, /用 7 天启动修正解决拖延/);
  assert.doesNotMatch(standalone, /方法从哪里来|没有保留的部分|不进入当前学习计划/);
});
