/**
 * 端到端 Demo：把 HallucC 当「写操作前置门禁」
 *
 *   npx tsx examples/gate-before-write/index.ts                # 零额度，默认
 *   npx tsx examples/gate-before-write/index.ts --refundable   # 对照组：门禁必须放行
 *   npx tsx examples/gate-before-write/index.ts --faithful     # 对照组：不触发门禁
 *   HALLUCC_API_KEY=hc_xxx npx tsx examples/gate-before-write/index.ts --live
 *
 * ── 演示的是什么 ─────────────────────────────────────────────────────────
 * 不是「接入一个 MCP server」，而是一个工程决策：**读操作自由执行，写操作先过门禁。**
 *
 * Agent 幻觉真正的代价不在「回答不准」，而在传播：
 *   读工具返回 → Agent 误读 → 基于错误前提发起写操作 → 对用户谎报成功
 * 用户只看到最后一句。在写操作执行**之前**拦截，资金变动从未发生；
 * 到用户看到回复时再报，需要客服介入，且预期已被污染。
 *
 * 所以这里唯一的门禁挂在 issueRefund 之前，不挂在最终回答之前。
 * 给最终回答盖「可信/不可信」的章是事后审核；这里做的是事前拦截。
 *
 * ── 三个场景，期望值写死并可自校验 ────────────────────────────────────────
 * 只演示「能拦住」是不够的：一个把所有写操作全拦的门禁没有价值，它只是把人
 * 全赶回去。所以必须有「合法写操作必须放行」的对照组。每个场景声明
 * expectation，运行时实际结论与期望不符会打 ❌——Demo 自己会揭自己的谎。
 *
 *   denied      订单不可退 + Agent 谎称可退 → 期望 blocked
 *   refundable  订单可退   + Agent 如实说可退 → 期望 allowed
 *   faithful    订单不可退 + Agent 如实转述   → 期望 no-gate（不产生写操作）
 *
 * ── 为什么默认离线 ───────────────────────────────────────────────────────
 * 一个连自己跑都跑不动的 Demo 没有演示价值，所以默认离线、零额度可跑；
 * 加 --live 走真实 MCP。离线路径的判定来自本地占位规则，不是 HallucC，
 * 运行时会在屏幕上明说，不冒充。
 *
 * ── Agent 的「推理」是写死的 ─────────────────────────────────────────────
 * 每个场景的 claim 是固定文本，不是真接了 LLM——演示价值在门禁本身，
 * 不依赖 LLM 额度。接真实 LLM 时把场景的 claim 换成你的模型调用即可，
 * 门禁逻辑不变。
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// ---------------------------------------------------------------------------
// 配置
// ---------------------------------------------------------------------------

const MCP_URL = process.env.HALLUCC_MCP_URL ?? "https://aihcc.cloud/mcp";
const API_KEY = process.env.HALLUCC_API_KEY ?? "";
const LIVE = process.argv.includes("--live");

const ORDER_ID = "20240912-8876";
const AMOUNT = "1299.00";

type Expectation = "blocked" | "allowed" | "no-gate";

type Scenario = {
  label: string;
  order: string;
  eligibility: string;
  claim: string;
  wantRefund: boolean;
  refundResult: string;
  userReply: string;
  expectation: Expectation;
};

const NOT_REFUNDABLE =
  `订单 ${ORDER_ID} 不可退款：商品类型为「生鲜冷链」，平台规则不支持无理由退款；` +
  `用户可申请冷链品质问题售后，需上传凭证。`;

const SCENARIOS = {
  denied: {
    label: "denied（订单不可退，Agent 谎称可退）",
    order: `订单 ${ORDER_ID}：状态=已完成；商品=生鲜冷链-三文鱼刺身 1 份；实付 ¥${AMOUNT}；签收于 3 天前。`,
    eligibility: NOT_REFUNDABLE,
    claim: `订单 ${ORDER_ID} 符合退款条件，支持全额退款 ¥${AMOUNT}。`,
    wantRefund: true,
    refundResult: `退款失败：订单 ${ORDER_ID} 不符合退款条件（商品类型=生鲜冷链）。未发起任何资金变动。`,
    userReply: `「${ORDER_ID} 属生鲜冷链类商品，按平台规则不支持无理由退款。」`,
    expectation: "blocked",
  } satisfies Scenario,
  refundable: {
    label: "refundable（订单可退，Agent 如实说可退）",
    order: `订单 ${ORDER_ID}：状态=已完成；商品=标准服装-羽绒服 1 件；实付 ¥${AMOUNT}；签收于 2 天前。`,
    eligibility: `订单 ${ORDER_ID} 可退款：商品类型为「标准服装」，处于 7 天无理由退货期内，可退金额 ¥${AMOUNT}。`,
    claim: `订单 ${ORDER_ID} 处于 7 天无理由退货期内，符合全额退款条件，可退 ¥${AMOUNT}。`,
    wantRefund: true,
    refundResult: `退款成功：订单 ${ORDER_ID} 已发起 ¥${AMOUNT} 退款，预计 1-3 个工作日到账。`,
    userReply: `已为您成功办理退款 ¥${AMOUNT}，预计 1-3 个工作日到账。`,
    expectation: "allowed",
  } satisfies Scenario,
  faithful: {
    label: "faithful（订单不可退，Agent 如实转述）",
    order: `订单 ${ORDER_ID}：状态=已完成；商品=生鲜冷链-三文鱼刺身 1 份；实付 ¥${AMOUNT}；签收于 3 天前。`,
    eligibility: NOT_REFUNDABLE,
    claim: `订单 ${ORDER_ID} 属生鲜冷链类商品，按平台规则不支持无理由全额退款。`,
    wantRefund: false,
    refundResult: "",
    userReply: `「${ORDER_ID} 属生鲜冷链类商品，按平台规则不支持无理由全额退款。」`,
    expectation: "no-gate",
  } satisfies Scenario,
};

const SCENARIO_KEY: keyof typeof SCENARIOS =
  process.argv.includes("--refundable") ? "refundable"
    : process.argv.includes("--faithful") ? "faithful"
      : "denied";
const SCENARIO: Scenario = SCENARIOS[SCENARIO_KEY];

// ---------------------------------------------------------------------------
// 轨迹记录
// ---------------------------------------------------------------------------

type Step = {
  step: number;
  tool: string;
  tool_input: string;
  tool_output: string;
  agent_claim?: string;
};

const steps: Step[] = [];

function log(tool: string, input: string, output: string, claim?: string): void {
  steps.push({
    step: steps.length + 1,
    tool,
    tool_input: input,
    tool_output: output,
    agent_claim: claim,
  });
  const tag = claim ? `\n    ⟶ agent 声称: ${claim}` : "";
  console.log(`  [${tool}]\n    输入: ${input}\n    返回: ${output}${tag}\n`);
}

// ---------------------------------------------------------------------------
// 门禁判定
//
// 三态，不是两态。这是本 Demo 最关键的一处：
//   blocked  门禁明确判「不可信」→ 拦
//   allow    门禁明确判「可信」  → 放行
//   unknown  门禁没给出结论（服务 500 / 超时 / 返回不可解析）
//
// unknown 必须按 blocked 处理（fail-closed）。门禁是给写操作装的，
// 安全服务挂了时放行走写，等于门禁形同虚设；拦下来最多是多问一句用户，
// 资损与误报的代价完全不对称。
// ---------------------------------------------------------------------------

type GateVerdict = {
  state: "blocked" | "allow" | "unknown";
  reason: string;
  ms: number;
};

/** MCP 回包里 steps[].checks[] 的 verdict 词汇：mismatch/fail/loop 即不可信。
 *  与后端 agent_pipeline 自身的判据一致，不另立一套。 */
const BAD_VERDICT = new Set(["mismatch", "fail", "loop"]);

function judge(parsed: Record<string, unknown>): { blocked: boolean; reason: string } {
  const hits: string[] = [];
  const p = parsed as {
    steps?: Array<Record<string, unknown>>;
    main?: { claims?: Array<Record<string, unknown>> };
  };
  for (const s of p.steps ?? []) {
    for (const c of (s.checks as Array<Record<string, unknown>> | undefined) ?? []) {
      if (BAD_VERDICT.has(String(c.verdict))) {
        hits.push(`step${String(s.step)} ${String(c.type)}=${String(c.verdict)} ${String(c.detail ?? "")}`.trim());
      }
    }
  }
  for (const c of p.main?.claims ?? []) {
    const v = c.verification as Record<string, unknown> | undefined;
    if (v?.status === "refuted") {
      hits.push(`final claim refuted: ${String((c.claim as Record<string, unknown>)?.text ?? "").slice(0, 50)}`);
    }
  }
  return { blocked: hits.length > 0, reason: hits.join("；") || "未发现矛盾" };
}

async function gateLive(client: Client): Promise<GateVerdict> {
  const t0 = Date.now();
  try {
    const r = await client.callTool({
      name: "verify_agent",
      arguments: {
        task: `用户询问订单 ${ORDER_ID} 能否退款，请核实并处理。`,
        agent_output: steps.at(-1)?.agent_claim ?? "",
        steps,
        speed: "fast",
      },
    });
    // CallToolResult 是带兼容分支的联合类型，content 未必是数组，先收窄
    const blocks: Array<Record<string, unknown>> = Array.isArray(r.content)
      ? (r.content as Array<Record<string, unknown>>)
      : [];
    const text = blocks.map((c) => (typeof c.text === "string" ? c.text : "")).join("\n");
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch {
      // 后端 500/503 时 MCP 会把错误正文当 content 回传，且 isError=true
      const why = r.isError ? "后端返回错误" : "返回不可解析";
      return { state: "unknown", ms: Date.now() - t0, reason: `${why}：${text.slice(0, 160)}` };
    }
    const { blocked, reason } = judge(parsed);
    return { state: blocked ? "blocked" : "allow", reason, ms: Date.now() - t0 };
  } catch (e) {
    return { state: "unknown", ms: Date.now() - t0, reason: `调用异常：${String(e instanceof Error ? e.message : e)}` };
  }
}

/** 离线占位判定：只做「观察↔声称」关键词比对，不是 HallucC。
 *  存在意义是让 Demo 零额度可跑，运行时明确标注来源。 */
async function gateOffline(): Promise<GateVerdict> {
  const t0 = Date.now();
  const last = steps.at(-1);
  const claim = last?.agent_claim ?? "";
  const obs = last?.tool_output ?? "";
  const saysRefundable = /符合退款条件|支持全额退款|可以退款/.test(claim);
  const obsSaysNot = /不可退款|不支持无理由退款/.test(obs);
  const blocked = saysRefundable && obsSaysNot;
  return {
    state: blocked ? "blocked" : "allow",
    reason: blocked
      ? `step${last?.step ?? "?"} claim_mismatch=mismatch 观察=「不可退款」，声称=「${claim.slice(0, 24)}…」`
      : "声称与观察一致",
    ms: Date.now() - t0,
  };
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------

const EXPECT_TEXT: Record<Expectation, string> = {
  blocked: "blocked（写操作应被拦）",
  allowed: "allowed（合法写操作必须放行）",
  "no-gate": "no-gate（不产生写操作）",
};

async function run(client: Client | null): Promise<void> {
  console.log("── 1. 读操作：直接执行 ──────────────────────────");
  log("query_order", JSON.stringify({ order_id: ORDER_ID }), SCENARIO.order);

  // Agent 的「判断」是它对 step2 这次观察的解读，所以 agent_claim 挂在
  // 有观察的那一步上——不是另起一步。claim 与 observation 必须同处一步，
  // 后端才能做「观察 ↔ 声称」比对；拆开的话 obs 变成空占位符，
  // 门禁会在占位符上误报 CLAIM_MISMATCH，而不是判出真矛盾。
  log("check_refund_eligibility", JSON.stringify({ order_id: ORDER_ID }),
    SCENARIO.eligibility, SCENARIO.claim);

  if (!SCENARIO.wantRefund) {
    console.log("── 2. 无需写操作，直接回复 ──────────────────────");
    console.log(`  回复用户：${SCENARIO.userReply}`);
    console.log("\n  结局：忠实转述，无资金风险，门禁未被触发。\n");
    return verify("no-gate");
  }

  console.log("── 2. 写操作前过门禁 ────────────────────────────");
  const g = client ? await gateLive(client) : await gateOffline();
  const label =
    g.state === "blocked" ? "🛑 拦截"
      : g.state === "allow" ? "✅ 放行"
        : "⛔ 门禁无结论 → 按拦截处理（fail-closed）";
  console.log(`  ${label}   [${g.ms} ms]`);
  console.log(`  判定：${g.reason}\n`);

  if (g.state === "allow") {
    log("issue_refund", JSON.stringify({ order_id: ORDER_ID, amount: AMOUNT }),
      SCENARIO.refundResult);
    console.log(`  回复用户：${SCENARIO.userReply}\n`);
    console.log("  写操作已执行，资金已发起变动。");
  } else {
    console.log(`  issue_refund ¥${AMOUNT} —— 未执行。`);
    console.log(`  回复用户：${SCENARIO.userReply}\n`);
    console.log("  止损点：写操作从未发生，资金变动从未发起。");
    if (g.state === "unknown") {
      console.log("  注意：门禁本身没给出结论，是 fail-closed 兜住的。");
      console.log("  这种情况要修门禁的服务可用性，而不是靠兜底策略掩盖。");
    } else {
      console.log("  对照：若不设门禁，issueRefund 会带着 amount=1299.00 真的发出去，");
      console.log("        工具返回失败后 Agent 仍可能回复「退款已成功办理」。");
    }
  }
  return verify(g.state === "blocked" ? "blocked" : "allowed");
}

/** 自校验：实际结论 vs 场景期望。Demo 应能揭自己的谎。 */
function verify(actual: Expectation): void {
  const ok = actual === SCENARIO.expectation;
  console.log(`── 3. 自校验 ─────────────────────────────────────`);
  console.log(`  期望：${EXPECT_TEXT[SCENARIO.expectation]}`);
  console.log(`  实际：${EXPECT_TEXT[actual]}`);
  console.log(`  ${ok ? "✅ 符合预期" : "❌ 与预期不符 —— 门禁行为有问题，见上一步的判定理由"}\n`);
}

async function main(): Promise<void> {
  if (LIVE && !API_KEY) {
    console.error("--live 需要 HALLUCC_API_KEY。在 https://aihcc.cloud 生成：");
    console.error("  export HALLUCC_API_KEY=hc_xxx && npx tsx examples/gate-before-write/index.ts --live");
    process.exit(1);
  }

  console.log(`\n场景：用户问「订单 ${ORDER_ID} 能退吗？」`);
  console.log(`模式：${SCENARIO.label}`);
  console.log(`门禁：${LIVE ? `live → ${MCP_URL}` : "offline（本地占位规则，非 HallucC）"}\n`);

  if (LIVE) {
    try {
      const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        requestInit: { headers: { Authorization: `Bearer ${API_KEY}` } },
      });
      const client = new Client({ name: "gate-before-write-demo", version: "1.0.0" });
      await client.connect(transport);
      const tools = await client.listTools();
      console.log(`  已连接。可用工具：${tools.tools.map((t) => t.name).join(", ")}\n`);
      await run(client);
      await client.close();
    } catch (e) {
      console.error("  连接失败：", String(e instanceof Error ? e.message : e));
      process.exit(1);
    }
    return;
  }

  console.log("   零额度可跑。想走真实 HallucC 加 --live。\n");
  await run(null);
}

main().catch((e) => {
  console.error("Demo 执行失败：", String(e instanceof Error ? e.message : e));
  process.exit(1);
});
