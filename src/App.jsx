import { useEffect, useMemo, useState } from "react";
import {
  ArrowBendDownLeft,
  ArrowBendDownRight,
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarBlank,
  CaretDown,
  CaretRight,
  CheckCircle,
  Clock,
  Crosshair,
  FlagCheckered,
  Headphones,
  ListChecks,
  MapTrifold,
  Microphone,
  NotePencil,
  PencilLine,
  PlugsConnected,
  SlidersHorizontal,
  Sparkle,
  Target,
  TextAa,
  Wrench,
  ArrowsOutLineHorizontal,
  X,
} from "@phosphor-icons/react";
import {
  adaptationScenarios,
  cambridgePlan,
  commonQuestions,
  currentProtocols,
  learningGuide,
  mindsetGuide,
  methodGuides,
  monthlyPlan,
  personalEvidence,
  phases,
  practiceStandards,
  scoreReference,
} from "./data.js";
import { requestAdaptation } from "./adaptation.js";
import { readStore, saveStore, adoptRevision } from "./planStore.js";
import { PlanPanel, DataTools, MethodNextStep } from "./PlanTools.jsx";
import { assessEvidence } from "./learningModel.js";
import {
  createEncryptedApiConfig,
  exportEncryptedApiConfig,
  getSecureApiConfigCapability,
  hasEncryptedApiConfig,
  importEncryptedApiConfig,
  loadEncryptedApiConfig,
  loadEncryptedApiConfigFromSerialized,
  removeEncryptedApiConfig,
} from "./secureApiConfig.js";

const defaultAiConfig = {
  baseUrl: "https://api.openai.com/v1",
  model: "",
  apiKey: "",
};

const navigation = [
  { id: "plan", label: "当前计划", icon: ListChecks },
  { id: "roadmap", label: "路线图", icon: MapTrifold },
  { id: "methods", label: "方法手册", icon: BookOpen },
  { id: "responses", label: "应对指南", icon: Wrench },
  { id: "update", label: "更新情况", icon: CheckCircle },
  { id: "revisions", label: "修订记录", icon: NotePencil },
];

const skillIcons = {
  listening: Headphones,
  reading: BookOpen,
  writing: PencilLine,
  speaking: Microphone,
  vocabulary: TextAa,
};

const phaseIcons = [Crosshair, Wrench, ArrowsOutLineHorizontal, FlagCheckered];

const eventPatternOptions = {
  performance: [
    ["drop", "分数或正确率下降"],
    ["high", "分数突然明显升高"],
    ["plateau", "连续停滞"],
    ["imbalance", "单项差距扩大"],
    ["unfamiliar", "陌生题型影响发挥"],
    ["review_debt", "有多套真题尚未复盘"],
    ["books_done_score_low", "阶段书已完成，但分数未达标"],
    ["improving", "表现持续改善"],
  ],
  schedule: [
    ["less_time", "可用时间减少"],
    ["more_time", "可用时间增加"],
    ["exam_week", "校内考试周或课程高峰"],
    ["travel", "出差、旅行或家庭事务"],
    ["procrastination", "时间有，但一直拖延没有开始"],
    ["too_many_commitments", "课程、实习或其他事情太多"],
    ["workload_miscalculated", "已经开始，但任务量估算错误"],
    ["low_completion", "计划完成率持续偏低"],
  ],
  method: [
    ["no_effect", "认真执行但没有改善"],
    ["too_hard", "任务太难或经常做不完"],
    ["too_easy", "熟题很好，新题不动"],
    ["too_slow", "复盘或学习耗时过长"],
    ["overload", "资料和方法太多"],
    ["improving", "方法有效并能迁移"],
  ],
  health: [
    ["short_illness", "短期生病或疲劳"],
    ["sleep", "睡眠问题影响学习"],
    ["recovery", "状态正在恢复"],
    ["persistent", "持续影响日常生活"],
  ],
  goal: [
    ["requirement", "语言要求变化"],
    ["deadline", "申请日期变化"],
    ["target", "主动改变目标分数"],
    ["booked", "已经报名正式考试"],
    ["official_score", "已经取得正式成绩"],
  ],
};

const durationOptions = [
  ["one_off", "只出现这一次"],
  ["few_days", "持续几天"],
  ["two_weeks", "持续约两周"],
  ["month_plus", "持续一个月以上"],
];

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function localMonthKey(date = new Date()) {
  return localDateKey(date).slice(0, 7).replace("-", ".");
}

function currentPhaseId(date = new Date()) {
  const today = localDateKey(date);
  const matched = phases.find((phase) => today >= phase.start && today <= phase.end);
  if (matched) return matched.id;
  return today < phases[0].start ? phases[0].id : phases.at(-1).id;
}

function phaseCalendarStatus(phase, date = new Date()) {
  const today = localDateKey(date);
  if (today < phase.start) return "待进入";
  if (today > phase.end) return "待验收";
  return "当前周期";
}

function readRevisions() {
  try {
    return readStore().revisions;
  } catch {
    return [];
  }
}

function writeRevisions(entries) {
  saveStore({ ...readStore(), revisions: entries });
}

function makeRevisionId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  return `revision-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Nav({ active, onChange }) {
  return (
    <header className="topbar">
      <button className="brand" onClick={() => onChange("plan")} aria-label="返回当前计划">
        <span className="brand-mark">8</span>
          <span>雅思学习手册</span>
      </button>
      <nav className="nav" aria-label="主导航">
        {navigation.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              className={active === item.id ? "nav-item active" : "nav-item"}
              onClick={() => onChange(item.id)}
              aria-label={item.label}
            >
              <Icon size={18} weight={active === item.id ? "fill" : "regular"} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </header>
  );
}

function PhaseRoute({ expanded = false }) {
  const [selected, setSelected] = useState(() => currentPhaseId());
  const active = phases.find((phase) => phase.id === selected);

  return (
    <section className={expanded ? "phase-section expanded" : "phase-section"}>
      <div className="phase-track">
        {phases.map((phase, index) => (
          <button
            key={phase.id}
            className={selected === phase.id ? "phase active" : "phase"}
            onClick={() => setSelected(phase.id)}
            aria-pressed={selected === phase.id}
          >
            <span className="phase-number">{index + 1}</span>
            <span className="phase-line" />
            <strong>{phase.short} {phase.title}</strong>
            <span>{phase.range}</span>
            {phaseCalendarStatus(phase) === "当前周期" && <em>日历建议周期</em>}
          </button>
        ))}
      </div>
      {expanded && (
        <div className="phase-detail">
          <p className="eyebrow">阶段说明</p>
          <h2>{active.short} · {active.title}</h2>
          <p>{active.summary}</p>
          <div className="gate">
            <Target size={22} />
            <div>
              <strong>进入下一阶段的证据</strong>
              <span>{active.gate}</span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function BandTable({ title, rows }) {
  return (
    <div className="band-table-wrap">
      <h3>{title}</h3>
      <table className="score-table">
        <thead><tr><th>答对题数</th><th>估算 Band</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${title}-${row.raw}`}><td>{row.raw}/40</td><td>{row.band}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ScoreReference() {
  return (
    <section className="score-reference" aria-labelledby="score-reference-title">
      <div className="score-reference-heading">
        <div>
          <p className="eyebrow">8 分验收标尺</p>
          <h2 id="score-reference-title">每个阶段究竟要做到多少题</h2>
        </div>
        <p>总分是四科平均后按官方规则取整。路线采用听力 8.5、学术阅读 8.5、写作 7.5、口语 7.5 的稳定组合。</p>
      </div>

      <div className="target-profile">
        {scoreReference.targetProfile.map((item) => (
          <article key={item.skill}>
            <span>{item.skill}</span>
            <strong>{item.target}</strong>
            <small>{item.evidence}</small>
          </article>
        ))}
      </div>

      <div className="score-block">
        <h3>阶段分数阶梯</h3>
        <div className="wide-table-wrap">
          <table className="score-table stage-score-table">
            <thead>
              <tr><th>阶段</th><th>听力：题数 / Band</th><th>学术阅读：题数 / Band</th><th>写作与口语</th><th>Overall</th></tr>
            </thead>
            <tbody>
              {scoreReference.stageTargets.map((row) => (
                <tr key={row.stage}>
                  <td>{row.stage}</td><td>{row.listening}</td><td>{row.reading}</td><td>{row.output}</td><td>{row.overall}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overall-examples">
        {scoreReference.overallExamples.map((item) => (
          <article key={item.label}>
            <span>{item.label}</span><strong>{item.scores}</strong><em>{item.result}</em><p>{item.note}</p>
          </article>
        ))}
      </div>

      <div className="band-tables">
        <BandTable title="Listening" rows={scoreReference.listeningBands} />
        <BandTable title="Academic Reading" rows={scoreReference.academicReadingBands} />
      </div>
      <p className="score-note">{scoreReference.note}</p>
      <div className="score-sources">
        <strong>核对来源</strong>
        {scoreReference.sources.map((source) => (
          <a key={source.href} href={source.href} target="_blank" rel="noreferrer">{source.label}<ArrowRight size={14} /></a>
        ))}
      </div>
    </section>
  );
}

function CambridgeCoverage() {
  return (
    <section className="cambridge-coverage" aria-labelledby="cambridge-coverage-title">
      <div className="cambridge-heading">
        <div>
          <p className="eyebrow">剑桥 5–21 全量计划</p>
          <h2 id="cambridge-coverage-title">17 册全部完成，但只按阶段节点验收</h2>
        </div>
        <div><strong>{cambridgePlan.total}</strong><p>{cambridgePlan.principle}</p></div>
      </div>

      <div className="completion-definition">
        <h3>什么才算一册完成</h3>
        <ol>
          {cambridgePlan.completionDefinition.map((item) => <li key={item}>{item}</li>)}
        </ol>
      </div>

      <div className="wide-table-wrap">
        <table className="score-table cambridge-table">
          <thead><tr><th>验收节点</th><th>必须完成</th><th>累计 Test</th><th>这批材料的用途</th><th>同时必须达到的能力线</th></tr></thead>
          <tbody>
            {cambridgePlan.gates.map((gate) => (
              <tr key={gate.stage}>
                <td>{gate.stage}</td><td>{gate.books}</td><td>{gate.tests}</td><td>{gate.purpose}</td><td>{gate.score}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="red-lines">
        <div><p className="eyebrow">不能跨过的红线</p><h3>满足册数和分数两个条件，才能进入下一阶段</h3></div>
        <ul>{cambridgePlan.redLines.map((item) => <li key={item}><X size={16} />{item}</li>)}</ul>
      </div>
    </section>
  );
}

function CurrentPlan({ onNavigate, revisionSignal }) {
  const currentRedLines = [0, 2, 3, 5].map((index) => cambridgePlan.redLines[index]);

  return (
    <main className="page current-plan">
      <PhaseRoute />
      <p>日期只决定建议查看的周期，不代表已通过验收。未达上一阶段标准时，继续按上一阶段学习；新版近期安排显示在下方。</p>

      <section className="decision">
        <div className="section-heading">
          <span className="heading-icon"><Target size={24} weight="duotone" /></span>
          <div>
            <p className="eyebrow">初始示例判断 · 等待新证据复核</p>
            <h1>现在最重要的决定</h1>
          </div>
        </div>
        <p className="decision-copy">
          最近一次阅读练习不能作为有效基线：没有严格计时，并因状态不佳提前停止。
          在调整长期计划前，先安排一次状态充分、全程受控的验证，避免把一次糟糕体验误当成真实能力。
        </p>
        <button className="text-action" onClick={() => onNavigate("update")}>
          <span>行动建议：记录这次情况，恢复后再安排验证</span>
          <ArrowRight size={18} />
        </button>
      </section>

      <PlanPanel onSaved={() => onNavigate("plan")} onNavigate={onNavigate} />

      <section className="current-red-lines" aria-labelledby="current-red-lines-title">
        <div className="current-red-lines-heading">
          <span><FlagCheckered size={24} weight="fill" /></span>
          <div>
            <p className="eyebrow">违反任一条就先停</p>
            <h2 id="current-red-lines-title">当前计划的四条硬红线</h2>
          </div>
          <button type="button" onClick={() => onNavigate("roadmap")}>查看完整红线 <ArrowRight size={16} /></button>
        </div>
        <ul>
          {currentRedLines.map((line, index) => (
            <li key={line}><span>0{index + 1}</span><p>{line}</p></li>
          ))}
        </ul>
      </section>

      <div className="lower-grid">
        <section className="protocols">
          <div className="subheading">
            <BookOpen size={28} />
            <div>
              <p className="eyebrow">当前阶段</p>
              <h2>这一阶段怎么学</h2>
            </div>
          </div>
          <div className="protocol-list">
            {currentProtocols.map((protocol) => (
              <button key={protocol.id} onClick={() => onNavigate("methods", protocol.id)}>
                <span className="protocol-index">{protocol.index}</span>
                <span className="protocol-content">
                  <strong>{protocol.title}</strong>
                  <small>{protocol.summary}</small>
                </span>
                <ArrowRight size={20} />
              </button>
            ))}
          </div>
        </section>

        <aside className="constraints">
          <div className="subheading">
            <SlidersHorizontal size={28} />
            <div>
              <p className="eyebrow">计划容量</p>
              <h2>初始时间安排</h2>
            </div>
          </div>
          <ul>
            <li>
              <span className="constraint-icon"><Briefcase size={20} /></span>
              <div><strong>当前时间有限</strong><span>标准周 8–9 小时，不以熬夜补量。</span></div>
            </li>
            <li>
              <span className="constraint-icon"><Clock size={20} /></span>
              <div><strong>工作日时间碎片化</strong><span>每天 40–50 分钟；极累时执行 25 分钟最低版。</span></div>
            </li>
            <li>
              <span className="constraint-icon"><CalendarBlank size={20} /></span>
              <div><strong>周末承担深度学习</strong><span>一次考试能力训练，一次表达与整合。</span></div>
            </li>
          </ul>
        </aside>
      </div>

      <footer className="page-footer">
        <span>当前日期：{localDateKey()}</span>
        <span>目标：IELTS 8.0</span>
        <span>原则：用可靠结果调整计划，状态不好时先复测</span>
      </footer>
    </main>
  );
}

function Roadmap() {
  const [selected, setSelected] = useState(() => currentPhaseId());
  const active = phases.find((phase) => phase.id === selected) || phases[0];
  const activeMonth = localMonthKey();

  return (
    <main className="page inner-page roadmap-page">
      <div className="page-intro">
        <p className="eyebrow">2026.07 — 2027.07</p>
        <h1>通往 8 分的四个阶段</h1>
        <p>7 分是途中里程碑，不是终点。点开每一站，看清这一阶段要完成什么；达到验收标准后，再进入下一阶段。</p>
      </div>

      <section className="journey" aria-label="一年学习阶段">
        <div className="journey-path">
          {phases.map((phase, index) => {
            const PhaseIcon = phaseIcons[index];
            const isActive = selected === phase.id;
            return (
              <div className={`journey-step step-${index + 1}`} key={phase.id}>
                {index > 0 && (
                  <span className="journey-arrow" aria-hidden="true">
                    {index % 2 === 0
                      ? <ArrowBendDownRight size={36} weight="thin" />
                      : <ArrowBendDownLeft size={36} weight="thin" />}
                  </span>
                )}
                <button
                  className={isActive ? "journey-node active" : "journey-node"}
                  onClick={() => setSelected(phase.id)}
                  aria-pressed={isActive}
                >
                  <span className="node-icon"><PhaseIcon size={24} weight={isActive ? "fill" : "regular"} /></span>
                  <span className="node-copy">
                    <small>{phase.short} · {phase.range}</small>
                    <strong>{phase.title}</strong>
                    <em>{phaseCalendarStatus(phase)}</em>
                  </span>
                </button>
              </div>
            );
          })}
        </div>

        <article className="checkpoint-detail" aria-live="polite">
          <div className="checkpoint-heading">
            <div>
              <p className="eyebrow">{active.short} · {active.range}</p>
              <h2>{active.title}</h2>
              <p>{active.summary}</p>
            </div>
            <span className="checkpoint-count">{phases.findIndex((phase) => phase.id === active.id) + 1}/4</span>
          </div>
          <div className="checkpoint-columns">
            <section>
              <h3>完成这一阶段时，你应该做到</h3>
              <ul className="acceptance-list">
                {active.acceptance.map((item) => (
                  <li key={item}><CheckCircle size={20} weight="duotone" />{item}</li>
                ))}
              </ul>
            </section>
            <section>
              <h3>需要留下的成果</h3>
              <ol className="deliverable-list">
                {active.deliverables.map((item, index) => (
                  <li key={item}><span>0{index + 1}</span>{item}</li>
                ))}
              </ol>
              <div className="phase-gate">
                <Target size={20} />
                <p><strong>进入下一阶段前</strong>{active.gate}</p>
              </div>
            </section>
          </div>
          <section className="phase-month-plan" aria-label={`${active.title}月度安排`}>
            <div className="phase-month-heading">
              <div>
                <p className="eyebrow">按月执行</p>
                <h3>这个阶段每个月具体做什么</h3>
              </div>
              <p>月计划负责安排工作量；阶段闸门仍决定能否进入下一阶段。落后时允许顺延，不能删复盘或降低分数线。</p>
            </div>
            <div className="month-plan-list">
              {monthlyPlan.filter((month) => month.phase === active.id).map((month, monthIndex) => (
                <details className="month-plan-item" key={month.month} open={month.month === activeMonth || (monthIndex === 0 && !monthlyPlan.some((item) => item.month === activeMonth && item.phase === active.id))}>
                  <summary>
                    <span className="month-code">{month.month}</span>
                    <span className="month-title"><strong>{month.title}</strong><small>{month.books}</small></span>
                    <CaretDown size={18} />
                  </summary>
                  <div className="month-plan-body">
                    <p className="month-context">{month.context}</p>
                    <div className="month-rhythm"><Clock size={18} /><span><strong>推进节奏</strong>{month.rhythm}</span></div>
                    <div className="month-plan-columns">
                      <section>
                        <h4>本月具体任务</h4>
                        <ul>{month.actions.map((item) => <li key={item}>{item}</li>)}</ul>
                      </section>
                      <section>
                        <h4>月末验收</h4>
                        <ul>{month.acceptance.map((item) => <li key={item}>{item}</li>)}</ul>
                      </section>
                    </div>
                    <div className="month-recovery"><strong>进度落后时</strong><p>{month.recovery}</p></div>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </article>
      </section>

      <ScoreReference />

      <CambridgeCoverage />

      <section className="roadmap-rules">
        <div>
          <p className="eyebrow">怎么使用这张路线图</p>
          <h2>计划可以调整，但判断标准不能随心情改变</h2>
        </div>
        <dl>
          <div>
            <dt>一次训练结束后</dt>
            <dd>记录主要错误、修复方法和复测时间，不凭一次分数改年度计划。</dd>
          </div>
          <div>
            <dt>每周结束时</dt>
            <dd>只确定下周最需要解决的一个问题，其他科目保持最低训练量。</dd>
          </div>
          <div>
            <dt>每月或阶段结束时</dt>
            <dd>比较同等条件下的多次结果。只有连续证据才说明方法有效或阶段需要调整。</dd>
          </div>
          <div>
            <dt>遇到报班、首考等重要决定</dt>
            <dd>把模考、执行率和外部反馈放在一起判断，最后由你自己确认。</dd>
          </div>
        </dl>
      </section>
    </main>
  );
}

function FaqItem({ item, open, onToggle }) {
  return (
    <article className="faq-item">
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span>{item.question}</span>
        {open ? <CaretDown size={18} /> : <CaretRight size={18} />}
      </button>
      {open && <p>{item.answer}</p>}
    </article>
  );
}

function Methods({ requestedGuide }) {
  const [activeGuide, setActiveGuide] = useState(requestedGuide || "listening");
  const [openFaq, setOpenFaq] = useState(null);
  const guide = methodGuides.find((item) => item.id === activeGuide) || methodGuides[0];
  const practice = practiceStandards[guide.id];
  const Icon = skillIcons[guide.id];
  const commonQuestionGroups = commonQuestions.reduce((groups, item) => {
    const lastGroup = groups.at(-1);
    if (!lastGroup || lastGroup.category !== item.category) {
      groups.push({ category: item.category, items: [item] });
    } else {
      lastGroup.items.push(item);
    }
    return groups;
  }, []);

  useEffect(() => {
    if (requestedGuide) setActiveGuide(requestedGuide);
  }, [requestedGuide]);

  return (
    <main className="page inner-page methods-page">
      <div className="page-intro">
        <p className="eyebrow">这一年按同一套原则学习</p>
        <h1>学习方案与方法手册</h1>
        <p>先看总的学习规则，再进入听、读、写、说和词汇。每个模块都说明具体怎么练、遇到问题怎么办，以及怎样判断训练是否有效。</p>
      </div>

      <section className="manual-foundation">
        <div className="manual-lead">
          <p className="eyebrow">总学习指南</p>
          <h2>{learningGuide.premise}</h2>
        </div>
        <div className="hard-rules">
          {learningGuide.rules.map((rule, index) => (
            <article key={rule.title}>
              <span>0{index + 1}</span>
              <div><h3>{rule.title}</h3><p>{rule.detail}</p></div>
            </article>
          ))}
        </div>
        <div className="weekly-loop">
          <div>
            <p className="eyebrow">一个标准周</p>
            <h3>每周都重复这五步</h3>
          </div>
          <ol>
            {learningGuide.weeklyLoop.map((item) => <li key={item}>{item}</li>)}
          </ol>
        </div>
      </section>

      <div className="method-layout">
        <aside className="method-nav" aria-label="技能列表">
          {methodGuides.map((item) => {
            const ItemIcon = skillIcons[item.id];
            return (
              <button
                key={item.id}
                className={item.id === guide.id ? "active" : ""}
                onClick={() => setActiveGuide(item.id)}
              >
                <ItemIcon size={20} />
                {item.title}
              </button>
            );
          })}
        </aside>
        <article className="method-article">
          <div className="method-title">
            <span><Icon size={28} weight="duotone" /></span>
            <div><p className="eyebrow">专项学习指南</p><h2>{guide.title}</h2></div>
          </div>
          <p className="method-purpose">{guide.purpose}</p>
          <blockquote className="method-principle">{guide.principle}</blockquote>

          <section className="method-section practice-standard">
            <div className="method-section-heading">
              <p className="eyebrow">8 分训练标准</p>
              <h3>这一科要练多少，练到什么程度</h3>
            </div>
            <p className="practice-intro">{practice.intro}</p>
            <div className="practice-total"><Target size={20} /><strong>{practice.sectionTarget}</strong></div>
            <div className="wide-table-wrap">
              <table className="score-table practice-table">
                <thead><tr><th>题型或任务</th><th>最低练习量</th><th>达标线</th><th>判断重点</th></tr></thead>
                <tbody>
                  {practice.rows.map((row) => (
                    <tr key={row.item}>
                      <td>{row.item}</td><td>{row.volume}</td><td>{row.target}</td><td>{row.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="method-section">
            <div className="method-section-heading">
              <p className="eyebrow">具体执行</p>
              <h3>每次训练按这个顺序完成</h3>
            </div>
            <ol className="method-steps">
              {guide.steps.map((step) => (
                <li key={step.title}>
                  <div><strong>{step.title}</strong><p>{step.action}</p></div>
                  <span><small>需要留下</small>{step.output}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="method-section troubleshooting">
            <div className="method-section-heading">
              <p className="eyebrow">遇到问题时</p>
              <h3>先判断原因，再决定练什么</h3>
            </div>
            <div className="problem-list">
              {guide.problems.map((problem) => (
                <article key={problem.signal}>
                  <h4>{problem.signal}</h4>
                  <dl>
                    <div><dt>常见原因</dt><dd>{problem.cause}</dd></div>
                    <div><dt>怎么处理</dt><dd>{problem.response}</dd></div>
                    <div><dt>怎么确认有效</dt><dd>{problem.verify}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>

          <div className="stop-rule">
            <strong>什么时候说明这套练法有效</strong>
            <p>{guide.stop}</p>
          </div>

          <section className="faq method-faq">
            <div className="method-section-heading">
              <p className="eyebrow">常见问题</p>
              <h3>{guide.title}学习中最容易卡住的地方</h3>
            </div>
            {guide.faq.map((item, index) => {
              const key = `${guide.id}-${index}`;
              return (
                <FaqItem
                  key={item.question}
                  item={item}
                  open={openFaq === key}
                  onToggle={() => setOpenFaq(openFaq === key ? null : key)}
                />
              );
            })}
          </section>
        </article>
      </div>

      <section className="faq common-faq">
        <div className="section-copy">
          <p className="eyebrow">整个一年里都可能遇到</p>
          <h2>常见问题</h2>
          <p>这些回答优先保护长期执行，不让一次状态、一次分数或一份新资料轻易打乱计划。</p>
        </div>
        <div className="common-faq-list">
          {commonQuestionGroups.map((group, groupIndex) => (
            <section className="common-faq-group" key={group.category}>
              <div className="common-faq-group-title">
                <span>{String(groupIndex + 1).padStart(2, "0")}</span>
                <h3>{group.category}</h3>
              </div>
              {group.items.map((item) => {
                const key = `common-${item.question}`;
                return (
                  <FaqItem
                    key={item.question}
                    item={item}
                    open={openFaq === key}
                    onToggle={() => setOpenFaq(openFaq === key ? null : key)}
                  />
                );
              })}
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

function ResponseGuide() {
  return (
    <main className="page inner-page response-guide-page">
      <div className="page-intro">
        <p className="eyebrow">出现变化时先查这里</p>
        <h1>应对指南</h1>
        <p>这里说明遇到成绩波动、进度落后、方法无效、心态变化或现实事务时，计划允许怎样调整，以及哪些标准不能被绕过。</p>
      </div>
      <section className="response-priority">
        <strong>固定判断顺序</strong>
        <ol>
          <li><span>01</span>健康与基本状态</li>
          <li><span>02</span>真实可用时间</li>
          <li><span>03</span>测量是否可靠</li>
          <li><span>04</span>方法是否有效</li>
          <li><span>05</span>是否需要改变阶段</li>
        </ol>
        <p>无法判断时保持原计划，只补证据；一次最多改三个近期动作。</p>
      </section>
      <section className="mindset-guide" aria-labelledby="mindset-guide-title">
        <div>
          <p className="eyebrow">状态调整规则</p>
          <h2 id="mindset-guide-title">心态变化会改变近期任务，但不会降低长期目标</h2>
          <p>系统只把心态变化转成短期、可撤销的学习安排。它不会进行心理诊断，也不会把一次焦虑、拖延或受挫解释成能力不足。</p>
        </div>
        <div className="mindset-list">
          {mindsetGuide.map((item) => (
            <article key={item.state}>
              <h3>{item.state}</h3>
              <p>{item.response}</p>
              <small>{item.boundary}</small>
            </article>
          ))}
        </div>
      </section>
      <section className="preset-library" aria-labelledby="preset-library-title">
        <div className="preset-library-heading">
          <div>
            <p className="eyebrow">完整预设库</p>
            <h2 id="preset-library-title">具体发生哪种情况，应该怎么处理</h2>
          </div>
          <p>先在这里查看规则，再到“更新情况”记录真实变化。预设负责给出边界，更新页负责结合你的记录生成本次修订建议。</p>
        </div>
        <div className="preset-groups">
          {adaptationScenarios.map((group, groupIndex) => (
            <details key={group.category} open={groupIndex === 1}>
              <summary><span>{group.category}</span><small>{group.cases.length} 种情况</small><CaretDown size={18} /></summary>
              <div className="preset-cases">
                {group.cases.map((item) => (
                  <article key={item.when}>
                    <h3>{item.when}</h3>
                    <p><strong>系统会：</strong>{item.response}</p>
                    <p><strong>不能做：</strong>{item.boundary}</p>
                  </article>
                ))}
              </div>
            </details>
          ))}
        </div>
      </section>
    </main>
  );
}

function SituationUpdate({ onSaved, aiConfig, onAiConfigChange, onNavigate }) {
  const [form, setForm] = useState({
    eventType: "performance",
    pattern: "drop",
    duration: "one_off",
    summary: "",
    availableHours: 8,
    capacity: "standard",
    pressure: 3,
    mindsetState: "anxiety",
    evidence: "partial",
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showConnection, setShowConnection] = useState(false);
  const capability = useMemo(() => getSecureApiConfigCapability(), []);
  const [hasSavedConfig, setHasSavedConfig] = useState(() => hasEncryptedApiConfig());
  const [portablePayload, setPortablePayload] = useState("");
  const [vaultPassphrase, setVaultPassphrase] = useState("");
  const [vaultPassphraseConfirm, setVaultPassphraseConfirm] = useState("");
  const [vaultMessage, setVaultMessage] = useState("");
  const [vaultBusy, setVaultBusy] = useState(false);
  const aiReady = Boolean(aiConfig.apiKey && aiConfig.baseUrl && aiConfig.model);

  function downloadEncryptedConfig(serialized) {
    const url = URL.createObjectURL(new Blob([serialized], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "雅思学习手册-API配置.enc.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function saveApiConfig() {
    setVaultBusy(true);
    setVaultMessage("");
    try {
      if (!capability.cryptoAvailable) throw new Error("当前浏览器不支持 Web Crypto，不能安全保存密钥。");
      if (vaultPassphrase !== vaultPassphraseConfirm) throw new Error("两次输入的本地解锁密码不一致。");
      const serialized = await createEncryptedApiConfig(aiConfig, vaultPassphrase);
      let persisted = false;
      if (capability.storageAvailable) {
        try {
          importEncryptedApiConfig(serialized);
          persisted = true;
        } catch {
          persisted = false;
        }
      }
      setPortablePayload(serialized);
      setHasSavedConfig(persisted);
      setVaultPassphrase("");
      setVaultPassphraseConfirm("");
      setVaultMessage(persisted
        ? "已使用 AES-GCM 加密保存。刷新后需输入解锁密码。"
        : "本地存储不可用或写入失败；密文已在本次会话生成，请立即导出加密配置文件。"
      );
    } catch (error) {
      setVaultMessage(error.message || "加密保存失败。");
    } finally {
      setVaultBusy(false);
    }
  }

  async function unlockApiConfig() {
    setVaultBusy(true);
    setVaultMessage("");
    try {
      if (!capability.cryptoAvailable) throw new Error("当前浏览器不支持 Web Crypto，无法解锁密文。");
      const config = portablePayload
        ? await loadEncryptedApiConfigFromSerialized(portablePayload, vaultPassphrase)
        : await loadEncryptedApiConfig(vaultPassphrase);
      onAiConfigChange(config);
      setVaultPassphrase("");
      setVaultPassphraseConfirm("");
      setVaultMessage("接口配置已解锁，仅在本次页面会话中保留明文。");
    } catch (error) {
      setVaultMessage(error.message || "解锁失败。");
    } finally {
      setVaultBusy(false);
    }
  }

  function lockApiConfig() {
    onAiConfigChange(defaultAiConfig);
    setVaultPassphrase("");
    setVaultPassphraseConfirm("");
    setVaultMessage("本次会话已锁定，内存中的 API Key 已清除。");
  }

  function deleteApiConfig() {
    try {
      if (capability.storageAvailable && hasEncryptedApiConfig()) removeEncryptedApiConfig();
      setHasSavedConfig(false);
      setPortablePayload("");
      onAiConfigChange(defaultAiConfig);
      setVaultPassphrase("");
      setVaultPassphraseConfirm("");
      setVaultMessage("已删除本地密文，并清除本次会话中的 API Key。");
    } catch (error) {
      setVaultMessage(error.message || "删除失败。");
    }
  }

  function exportApiConfig() {
    try {
      const serialized = portablePayload || exportEncryptedApiConfig();
      downloadEncryptedConfig(serialized);
      setVaultMessage("已导出加密配置文件；文件中不含明文 API Key。");
    } catch (error) {
      setVaultMessage(error.message || "导出失败。");
    }
  }

  async function importApiConfig(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setVaultBusy(true);
    setVaultMessage("");
    try {
      if (file.size > 128 * 1024) throw new Error("加密配置文件异常过大，已拒绝导入。");
      if (!vaultPassphrase) throw new Error("导入前请先输入该配置文件的解锁密码。");
      const serialized = await file.text();
      const config = await loadEncryptedApiConfigFromSerialized(serialized, vaultPassphrase);
      let persisted = false;
      if (capability.storageAvailable) {
        try {
          importEncryptedApiConfig(serialized);
          persisted = true;
        } catch {
          persisted = false;
        }
      }
      setHasSavedConfig(persisted);
      setPortablePayload(serialized);
      onAiConfigChange(config);
      setVaultPassphrase("");
      setVaultPassphraseConfirm("");
      setVaultMessage(persisted
        ? "加密配置已验证、导入、保存并解锁。"
        : "加密配置已验证并在本次会话解锁；本地存储不可用，请保留原加密配置文件。"
      );
    } catch (error) {
      setVaultMessage(error.message || "导入失败。");
    } finally {
      setVaultBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.summary.trim()) return;
    setLoading(true);
    setSaveError("");
    try {
    readStore();
    const existing = readRevisions();
    const history = existing.filter((entry) => entry.input?.eventType === form.eventType
      && (form.eventType !== "performance" || entry.input?.measurement?.skill === form.measurement?.skill)
      && Date.now() - Date.parse(entry.createdAt) <= 42 * 86400000).slice(0, 8).map((entry) => ({
      createdAt: entry.createdAt,
      eventType: entry.input?.eventType,
      pattern: entry.input?.pattern,
      duration: entry.input?.duration,
      capacity: entry.input?.capacity,
      energy: entry.input?.energy,
      pressure: entry.input?.pressure,
      evidence: entry.input?.evidence,
    }));
    const evidenceCheck = assessEvidence(form, existing);
    const checkedInput = { ...form, history, evidenceVersion: 2, evidence: evidenceCheck.level, evidenceReason: evidenceCheck.reason };
    const suggestion = await requestAdaptation(checkedInput, aiConfig);
    const entry = {
      id: makeRevisionId(),
      createdAt: new Date().toISOString(),
      input: checkedInput,
      suggestion,
      status: "待确认",
    };
    writeRevisions([entry, ...readStore().revisions]);
    setResult(entry);
    onSaved?.();
    } catch (error) {
      setSaveError(error.message);
    } finally { setLoading(false); }
  }

  function decide(status) {
    try {
    if (status === "已采用") {
      saveStore(adoptRevision(readStore(), result.id));
      setResult((entry) => ({ ...entry, status }));
      onSaved?.();
      return;
    }
    const entries = readRevisions().map((entry) =>
      entry.id === result.id ? { ...entry, status } : entry,
    );
    writeRevisions(entries);
    setResult((entry) => ({ ...entry, status }));
    onSaved?.();
    } catch (error) { setSaveError(error.message); }
  }

  function changeEventType(eventType) {
    const nextPattern = eventPatternOptions[eventType]?.[0]?.[0] || form.pattern;
    setForm({ ...form, eventType, pattern: nextPattern });
  }

  return (
    <main className="page inner-page update-page">
      <div className="page-intro">
        <p className="eyebrow">低频入口 · 只记录有意义的变化</p>
        <h1>最近发生了什么？</h1>
        <p>不用逐题录入。告诉系统哪些现实或学习判断发生了变化，它只提出有限的计划修订。</p>
      </div>
      <div className="intelligence-control">
        <button
          type="button"
          className={aiReady ? "intelligence-trigger connected" : "intelligence-trigger"}
          onClick={() => setShowConnection((value) => !value)}
          aria-expanded={showConnection}
        >
          <PlugsConnected size={18} weight={aiReady ? "fill" : "regular"} />
          <span>
            <small>智能分析</small>
            {aiReady ? "已解锁" : (hasSavedConfig || portablePayload ? "配置已加密" : "使用本地规则")}
          </span>
          {showConnection ? <CaretDown size={16} /> : <CaretRight size={16} />}
        </button>
        {showConnection && (
          <section className="connection-panel" aria-label="智能分析连接设置">
            <div>
              <h2>连接兼容 OpenAI 的接口</h2>
              <p>模型只会整理你提供的信息并标记可能的问题，不能直接改目标、阶段或任务。连接失败时会继续使用本地规则。</p>
            </div>
            <div className="connection-fields">
              <label>
                接口地址
                <input
                  type="url"
                  value={aiConfig.baseUrl}
                  onChange={(event) => onAiConfigChange({ ...aiConfig, baseUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label>
                模型
                <input
                  value={aiConfig.model}
                  onChange={(event) => onAiConfigChange({ ...aiConfig, model: event.target.value })}
                  placeholder="gpt-4.1-mini"
                />
              </label>
              <label className="api-key-field">
                API Key
                <input
                  type="password"
                  value={aiConfig.apiKey}
                  onChange={(event) => onAiConfigChange({ ...aiConfig, apiKey: event.target.value })}
                  autoComplete="off"
                  placeholder={hasSavedConfig && !aiReady ? "已加密保存，解锁后使用" : "输入后可加密保存"}
                />
              </label>
              <label className="vault-passphrase-field">
                本地解锁密码
                <input
                  type="password"
                  value={vaultPassphrase}
                  onChange={(event) => setVaultPassphrase(event.target.value)}
                  autoComplete="off"
                  placeholder="至少 8 个字符；密码本身不会保存"
                />
              </label>
              {aiReady && (
                <label className="vault-passphrase-field">
                  确认解锁密码
                  <input
                    type="password"
                    value={vaultPassphraseConfirm}
                    onChange={(event) => setVaultPassphraseConfirm(event.target.value)}
                    autoComplete="off"
                    placeholder="加密保存时再次输入"
                  />
                </label>
              )}
            </div>
            <div className="vault-actions" aria-label="API 配置安全存储操作">
              <button type="button" onClick={saveApiConfig} disabled={vaultBusy || !capability.cryptoAvailable || !aiReady || vaultPassphrase.length < 8 || vaultPassphrase !== vaultPassphraseConfirm}>
                {hasSavedConfig ? "更新加密配置" : "加密保存"}
              </button>
              {(hasSavedConfig || portablePayload) && !aiReady && (
                <button type="button" onClick={unlockApiConfig} disabled={vaultBusy || !vaultPassphrase}>解锁</button>
              )}
              {aiReady && (hasSavedConfig || portablePayload) && (
                <button type="button" onClick={lockApiConfig} disabled={vaultBusy}>锁定本次会话</button>
              )}
              {(hasSavedConfig || portablePayload) && (
                <button type="button" onClick={exportApiConfig} disabled={vaultBusy}>导出密文</button>
              )}
              <label className="vault-file-button">
                导入密文
                <input type="file" accept="application/json,.json" onChange={importApiConfig} />
              </label>
              {(hasSavedConfig || portablePayload) && (
                <button className="danger" type="button" onClick={deleteApiConfig} disabled={vaultBusy}>删除密文</button>
              )}
            </div>
            <div className="connection-note">
              <p>
                {capability.cryptoAvailable
                  ? "使用 PBKDF2-SHA-256 派生 256 位密钥，并以 AES-GCM 加密。解锁密码不保存，丢失后无法恢复。"
                  : "当前浏览器缺少 Web Crypto：不会降级为明文保存，只能在本次页面临时使用。"
                }
              </p>
              <p>
                {capability.storageAvailable
                  ? "密文保存在当前浏览器；换电脑或浏览器时可导出并导入加密配置文件。"
                  : "当前浏览器禁止本地存储；请导出加密配置文件，刷新后再导入。"
                }
                直接调用仍可能受接口跨域设置限制。
              </p>
            </div>
            {vaultMessage && <p className="vault-message" role="status" aria-live="polite">{vaultMessage}</p>}
          </section>
        )}
      </div>
      <div className="update-grid">
        <form className="update-form" onSubmit={submit}>
          <label>
            变化类型
            <select value={form.eventType} onChange={(e) => changeEventType(e.target.value)}>
              <option value="performance">阶段表现或测试</option>
              <option value="schedule">课表、实习或可用时间</option>
              <option value="method">方法执行后的感受</option>
              <option value="mindset">心态、焦虑或学习阻力</option>
              <option value="health">状态或健康影响</option>
              <option value="goal">目标与申请信息</option>
            </select>
          </label>
          {eventPatternOptions[form.eventType] && (
            <div className="form-row situation-fields">
              <label>
                具体情况
                <select value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })}>
                  {eventPatternOptions[form.eventType].map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label>
                已经持续多久
                <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}>
                  {durationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
          )}
          {form.eventType === "mindset" && (
            <div className="form-row mindset-fields">
              <label>
                当前最接近的情况
                <select value={form.mindsetState} onChange={(e) => setForm({ ...form, mindsetState: e.target.value })}>
                  <option value="anxiety">担心分数、反复推演结果</option>
                  <option value="discouraged">受挫、自我怀疑</option>
                  <option value="avoidance">害怕开始、持续拖延</option>
                  <option value="overload">疲劳、厌学或压力过高</option>
                  <option value="overdrive">状态很好，想突然加很多任务</option>
                  <option value="other">其他</option>
                </select>
              </label>
              <label>
                当前学习压力
                <select value={form.pressure} onChange={(e) => setForm({ ...form, pressure: e.target.value })}>
                  <option value="1">1 · 很低</option>
                  <option value="2">2 · 较低</option>
                  <option value="3">3 · 可以承受</option>
                  <option value="4">4 · 明显影响学习</option>
                  <option value="5">5 · 已影响日常状态</option>
                </select>
              </label>
              <label>
                已经持续多久
                <select value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })}>
                  {durationOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </div>
          )}
          <label>
            用自己的话描述
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="例如：本周临时事务增加，只完成了三天安排。听力按要求完成，但阅读没有计时，只完成了第一篇。"
              rows={6}
            />
          </label>
          <div className="form-row">
            <label>
              下周真实可用时间
              <input
                type="number"
                min="1"
                max="30"
                value={form.availableHours}
                onChange={(e) => setForm({ ...form, availableHours: e.target.value })}
              />
            </label>
            <label>
              今日任务容量
              <select value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })}>
                <option value="recovery">恢复模式｜连 10 分钟专注都困难</option>
                <option value="minimum">最低模式｜能完成 25 分钟轻任务</option>
                <option value="standard">标准模式｜能完成 45–60 分钟核心任务</option>
                <option value="deep">深度模式｜能完成 90 分钟计时与复盘</option>
              </select>
              <small className="field-help">按今天能够稳定完成的最长任务选择，不按心情好坏选择。</small>
            </label>
          </div>
          <label>这次想排查的科目（可选，不代表已确认短板）
            <select value={form.focusSkill || ""} onChange={(e) => setForm({ ...form, focusSkill: e.target.value })}>
              <option value="">不指定／仅调整时间与状态</option>
              <option value="listening">听力</option><option value="reading">阅读</option>
              <option value="writing">写作</option><option value="speaking">口语</option><option value="vocabulary">词汇</option>
            </select>
          </label>
          <details className="measurement-fields">
            <summary>补充阶段测量（可选，仅听力或阅读）</summary>
            <p>普通情况更新不必填写。只有要判断能力变化时，再补充这些条件；写作、口语外部反馈可先写在描述中，不在此自动判分。</p>
            {[
              ["material", "材料和 Test", "text"], ["raw", "答对题数（完整 40 题）", "number"], ["minutes", "实际用时（分钟）", "number"],
            ].map(([key, label, type]) => <label key={key}>{label}<input type={type} min="0" max={key === "raw" ? "40" : undefined}
              value={form.measurement?.[key] ?? ""} onChange={(e) => setForm({ ...form, measurement: { ...form.measurement, [key]: e.target.value } })} /></label>)}
            <label>科目<select value={form.measurement?.skill || ""} onChange={(e) => setForm({ ...form, measurement: { ...form.measurement, skill: e.target.value } })}>
              <option value="">请选择</option><option value="listening">听力</option><option value="reading">学术阅读</option></select></label>
            {[["first", "是否首次接触"], ["timed", "是否严格计时"], ["complete", "是否完成全部 40 题"], ["aided", "是否查词、暂停、回放或看过答案"], ["normal", "状态和环境是否正常"]].map(([key, label]) =>
              <label key={key}>{label}<select value={form.measurement?.[key] || ""} onChange={(e) => setForm({ ...form, measurement: { ...form.measurement, [key]: e.target.value } })}>
                <option value="">未确认</option><option value="yes">是</option><option value="no">否</option></select></label>)}
          </details>
          <p>{assessEvidence(form).reason}</p>
          <p className="privacy-note">学习记录保存在当前浏览器。启用接口后，描述、时间与证据条件会发送给所配置的服务；请勿填写无关隐私。接口失败时使用本地规则。</p>
          {saveError && <p role="alert">{saveError}</p>}
          <button className="primary-button" type="submit" disabled={loading || !form.summary.trim()}>
            {loading ? "正在检查约束…" : "生成修订建议"}
            {!loading && <ArrowRight size={18} />}
          </button>
        </form>
        <aside className="guardrails">
          <p className="eyebrow">系统边界</p>
          <h2>任何建议都要先经过你的确认</h2>
          <ul>
            <li><CheckCircle size={20} />一次低质量记录只触发观察或复测。</li>
            <li><CheckCircle size={20} />焦虑或受挫只调整近期任务，不直接判断能力。</li>
            <li><CheckCircle size={20} />最多修改三个任务，并说明依据。</li>
            <li><CheckCircle size={20} />阶段、考试和目标变化必须由你确认。</li>
            <li><CheckCircle size={20} />API失败时保留原计划。</li>
          </ul>
        </aside>
      </div>
      {result && (
        <div className="suggestion" role="status">
          <div>
            <p className="eyebrow">{result.status} · {result.suggestion.mode === "rules" ? "规则模式" : "AI + 规则模式"}</p>
            <h2>{result.suggestion.title}</h2>
            <p>{result.suggestion.rationale}</p>
            {result.suggestion.analysis?.summary && (
              <p className="model-observation">
                <strong>AI 观察：</strong>{result.suggestion.analysis.summary}
              </p>
            )}
            <ul>{result.suggestion.changes.map((change) => <li key={change}>{change}</li>)}</ul>
            <MethodNextStep input={result.input} onNavigate={onNavigate} />
            <p>采用后将替换首页的近期安排，七天后复查；年度目标和阶段验收保持原标准。上一版本会保留，可从当前计划撤销。</p>
            {!["micro", "weekly"].includes(result.suggestion.scope) && <p>当前建议只用于观察或重要决定前的核对，不直接改写近期安排。</p>}
            {result.status === "待确认" ? (
              <div className="decision-actions">
                <button className="primary-button" type="button" disabled={!["micro", "weekly"].includes(result.suggestion.scope)} onClick={() => decide("已采用")}>
                  采用为近期安排
                </button>
                <button className="secondary-button" type="button" onClick={() => decide("未采用")}>
                  暂不采用
                </button>
              </div>
            ) : (
              <p className="decision-status">处理结果：{result.status}</p>
            )}
          </div>
          <button onClick={() => setResult(null)} aria-label="关闭建议"><X size={20} /></button>
        </div>
      )}
    </main>
  );
}

function Revisions({ revisionSignal }) {
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    setEntries(readRevisions());
  }, [revisionSignal]);

  return (
    <main className="page inner-page">
      <div className="page-intro">
        <p className="eyebrow">计划为何改变，也为何没有改变</p>
        <h1>修订记录</h1>
        <p>每次建议都保留输入、依据和状态。历史不会被新版本静默覆盖。</p>
      </div>
      <p className="revision-storage-note">
        <strong>保存位置</strong>
        当前浏览器的本地存储。旧记录 <code>ielts-revisions</code> 会在下次保存时迁入新版；它不会自动同步到其他设备，请使用上方的学习备份。
      </p>
      {entries.length === 0 ? (
        <div className="empty-state">
          <Sparkle size={28} />
          <h2>尚无修订建议</h2>
          <p>当前计划保持不变。出现新的现实约束或可靠证据时，再更新情况。</p>
        </div>
      ) : (
        <div className="revision-list">
          {entries.map((entry) => (
            <article key={entry.id}>
              <div className="revision-meta">
                <span>{new Date(entry.createdAt).toLocaleDateString("zh-CN")}</span>
                <em>{entry.status}</em>
              </div>
              <h2>{entry.suggestion.title}</h2>
              <p className="quoted">“{entry.input.summary}”</p>
              <p>{entry.suggestion.rationale}</p>
              <ul>{entry.suggestion.changes.map((change) => <li key={change}>{change}</li>)}</ul>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

export function App() {
  const [active, setActive] = useState("plan");
  const [requestedGuide, setRequestedGuide] = useState(null);
  const [revisionSignal, setRevisionSignal] = useState(0);
  const [aiConfig, setAiConfig] = useState(defaultAiConfig);

  function navigate(page, guide = null) {
    setRequestedGuide(guide);
    setActive(page);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const content = useMemo(() => {
    if (active === "roadmap") return <Roadmap />;
    if (active === "methods") return <Methods requestedGuide={requestedGuide} />;
    if (active === "responses") return <ResponseGuide />;
    if (active === "update") {
      return (
        <SituationUpdate
          onNavigate={navigate}
          onSaved={() => setRevisionSignal((value) => value + 1)}
          aiConfig={aiConfig}
          onAiConfigChange={setAiConfig}
        />
      );
    }
    if (active === "revisions") return <Revisions revisionSignal={revisionSignal} />;
    return <CurrentPlan onNavigate={navigate} revisionSignal={revisionSignal} />;
  }, [active, aiConfig, requestedGuide, revisionSignal]);

  return (
    <div className="app-shell">
      <Nav active={active} onChange={navigate} />
      <DataTools onSaved={() => setRevisionSignal((value) => value + 1)} />
      {content}
    </div>
  );
}
