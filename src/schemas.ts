/**
 * 7 个工具的 zod 输入 schema（raw shape）。
 * 约束逐字段对齐后端 Pydantic `Field(...)` 上限（server.py），避免被后端 422。
 * inputSchema 传 raw shape（{k: ZodType}），由 SDK 的 objectFromShape 组装。
 */
import { z } from "zod";

const MAX_INPUT_CHARS = 50000;

/** 领域枚举，对齐 server.py DetectRequest.domain 注释。 */
const domain = z
  .enum(["general", "medical", "legal", "finance", "education", "government"])
  .optional()
  .describe("Domain mode: general|medical|legal|finance|education|government");

const speed = z
  .enum(["fast", "standard", "deep"])
  .optional()
  .describe("Speed mode: fast|standard|deep (default: standard)");

/** 1. verify_text → POST /detect （DetectRequest, server.py:267） */
export const verifyTextSchema = {
  text: z.string().min(1).max(MAX_INPUT_CHARS).describe("Text to verify"),
  strict: z.boolean().optional().describe("Strict mode (self-consistency). Omit to use the global default."),
  domain,
  speed,
  model: z.string().max(50).optional().describe("Model name under test (optional; shown on the share card)"),
};

/** 2. verify_agent → POST /detect-agent （AgentDetectRequest, server.py:1254） */
const agentStep = z
  .object({
    step: z.number().int().optional().describe("Step number (default: 1)"),
    tool: z.string().optional().describe("Tool called in this step"),
    tool_input: z.string().optional().describe("Tool input"),
    tool_output: z.string().optional().describe("Tool output"),
    agent_claim: z.string().optional().describe("The agent's claim for this step"),
  })
  .describe("A single agent trajectory step");

export const verifyAgentSchema = {
  agent_output: z
    .string()
    .min(1)
    .max(50000)
    .describe("The agent's final output text (1-50,000 characters)"),
  steps: z.array(agentStep).optional().describe("Agent execution trajectory, graded step by step across six dimensions"),
  task: z.string().optional().describe("Original task instruction (used by the task_completion judge)"),
  tool_schemas: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Tool schemas (aligned with the trajectory endpoint)"),
  domain,
  speed,
};

/** 3. check_cua_actions → POST /cua/classify （CuaClassifyRequest, server.py:2174） */
const cuaAction = z
  .object({
    action: z.string().optional().describe("Action name (click/press/hotkey/write/move...); inferred from coordinates when omitted"),
    x: z.number().optional().describe("X coordinate of the click"),
    y: z.number().optional().describe("Y coordinate of the click"),
    coordinate: z
      .tuple([z.number().int(), z.number().int()])
      .optional()
      .describe("[x, y] pair (alternative to x/y)"),
    action_input: z.string().optional().describe("ReAct-style input alias -> text"),
    text: z.string().optional().describe("Content for type/key/paste"),
    target_app: z.string().optional().describe("Target application"),
    app: z.string().optional().describe("Alias for target_app"),
    target_element: z.string().optional().describe("Target element label"),
    element: z.string().optional().describe("Alias for target_element"),
    target_path: z.string().optional().describe("File operation path / terminal command path"),
    path: z.string().optional().describe("Alias for target_path"),
    target_url: z.string().optional().describe("Target URL of browser actions (used by domain grading, unknown-domain navigation and paste-into-unknown-domain rules)"),
    url: z.string().optional().describe("Alias for target_url"),
    thought: z.string().optional().describe("Agent reasoning text (audit trail)"),
    task_scope: z
      .object({
        task: z.string().min(1).describe("Declared task intent (for example, \"summarize this week's meeting notes\")"),
        allowed_apps: z.array(z.string()).optional().describe("Allowed foreground applications"),
        allowed_domains: z.array(z.string()).optional().describe("Allowed domains (suffix match, including subdomains)"),
        forbidden_elements: z.array(z.string()).optional().describe("Forbidden element labels (highest priority)"),
      })
      .optional()
      .describe("P1-5 Declared allowed task scope (read per action by the server; out of scope escalates one level and can only narrow)"),
    chain_id: z.string().optional().describe("P1-9 Multi-agent delegation chain id (uuid hex); when provided, audit records aggregate across sessions by chain_id and a chain view is available at /cua/audit"),
    agent_id: z.string().optional().describe("P1-9 Name of the agent this action belongs to (e.g. research); used with registered_agents for registration validation"),
    parent_agent_id: z.string().optional().describe("P1-9 Name of the delegating agent; cross-agent propagation chains are paired with this"),
    delegation_depth: z.number().int().min(0).optional().describe("P1-9 Delegation depth (root agent = 0); exceeding delegation_max_depth escalates to L2"),
  })
  .describe("A single CUA action");

export const checkCuaActionsSchema = {
  actions: z
    .array(cuaAction)
    .min(1)
    .max(500)
    .describe("Action sequence to grade (1-500 actions)"),
  session_id: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("When provided, grading results are written to the audit table and can be replayed at /cua/audit"),
  task_scope: z
    .object({
      task: z.string().min(1).describe("Declared task intent (for example, \"summarize this week's meeting notes\")"),
      allowed_apps: z.array(z.string()).optional().describe("Allowed foreground applications"),
      allowed_domains: z.array(z.string()).optional().describe("Allowed domains (suffix match, including subdomains)"),
      forbidden_elements: z.array(z.string()).optional().describe("Forbidden element labels (highest priority)"),
    })
    .optional()
    .describe(
      "Task intent alignment (narrowing): actions outside the scope are handled one level higher (L0->L1, L1->L2, L2 stays but gains a reason, L3 unchanged). Escalation only, never a downgrade; omitted means no effect.",
    ),
};

/** 4. check_safety → POST /guard/check （GuardRequest, server.py:1756）；fast → /guard/check-fast */
export const checkSafetySchema = {
  prompt: z.string().max(50000).optional().describe("Raw user input (default: empty; up to 50,000 characters)"),
  output: z.string().min(1).max(50000).describe("AI response (1-50,000 characters)"),
  check_hallucination: z.boolean().optional().describe("Also run hallucination detection (default: false)"),
  fast: z
    .boolean()
    .optional()
    .describe("true uses the rule-only fast mode (sub-10ms, no LLM) -> /guard/check-fast; the default false uses the full /guard/check"),
};

/** 5. check_cua_code_audit → POST /cua/audit-code：Agent 源码静态审计（纯规则，不耗额度）。 */
export const checkCuaCodeAuditSchema = {
  code: z
    .string()
    .max(50000)
    .optional()
    .describe("Single-file mode: source code text to scan (up to 50,000 characters); mutually exclusive with files"),
  filename: z
    .string()
    .optional()
    .describe("Single-file mode: filename used to identify the file in the report (default: input.py)"),
  language: z
    .enum(["auto", "python", "javascript", "typescript"])
    .optional()
    .describe("Language hint; with auto it is inferred from the filename extension (default: auto)"),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().max(50000),
        language: z.enum(["auto", "python", "javascript", "typescript"]).optional(),
      }),
    )
    .optional()
    .describe("Multi-file mode: array of [{path, content, language?}]; mutually exclusive with code"),
};

/* ------------------------------------------------------------------ */
/* 输出 schema：字段名与后端 handler 的 return dict 逐一对齐。          */
/*                                                                     */
/* 两个硬约束决定了它们必须「宽」：                                    */
/* 1. 注册了 outputSchema 后，SDK 的 validateToolOutput 会对每次调用   */
/*    做校验；回调没有 structuredContent 会直接抛 InvalidParams，      */
/*    结构不匹配同样抛 —— 约束过严等于线上每次 tools/call 都 500。     */
/*    （实测踩过：/cua/classify 不传 session_id 时后端回 null，        */
/*      z.string().optional() 不接受 null，导致该工具全量失败。）      */
/* 2. 后端是自由 dict（无 response_model），会随迭代加字段 / 补 null。 */
/*    因此：标量一律 .nullish()（接受 undefined 与 null）、其余 optional */
/*    + .passthrough()，只声明稳定字段，深度动态结构（Source /          */
/*    chain_trace / hallucination / llm_analysis）一律 unknown。       */
/* ------------------------------------------------------------------ */

/** 后端额度快照（auth.quota_status）。内部键随套餐迭代，只约束是对象。 */
const quota = z.record(z.string(), z.unknown()).nullish();

/** 后端 JSON 对象（来源/引用/step 等自由结构）。 */
const obj = z.record(z.string(), z.unknown()).nullish();

/** 字符串字段：接受 null（后端 Pydantic `str | None` 常回 null）。 */
const str = () => z.string().nullish();

/** 整数 / 浮点字段。 */
const num = () => z.number().nullish();
const int = () => z.number().int().nullish();
const bool = () => z.boolean().nullish();

/**
 * 幻觉核验汇总结论。注意是对象不是字符串（实测：
 * {"total":1,"red":0,"yellow":1,"green":0,"hallucination_risk":1}）——
 * 早期按源码把 summary 当成 string，导致 verify_text / verify_agent
 * 线上每次调用都被 output 校验拦下。
 */
const detectSummary = z
  .object({
    total: int(),
    red: int(),
    yellow: int(),
    green: int(),
    hallucination_risk: num(),
  })
  .passthrough()
  .nullish();

/** 1. verify_text → POST /detect（_run_detect 返回值） */
export const verifyTextOutput = z
  .object({
    detection_id: int(),
    input: str(),
    summary: detectSummary,
    claims: z.array(z.unknown()).nullish(),
    citations: z.array(z.unknown()).nullish(),
    math_issues: z.array(z.unknown()).nullish(),
    strict: bool(),
    domain: str(),
    speed: str(),
    elapsed_ms: num(),
    quota,
  })
  .passthrough();

/** 2. verify_agent → POST /detect-agent
 *  注：verifyAgent.ts 回调已删除 dimensions / failure_modes（不外泄内部评分骨架），
 *  故这里不声明这两个字段。 */
export const verifyAgentOutput = z
  .object({
    detection_id: int(),
    main: z
      .object({ input: str(), summary: detectSummary, claims: z.array(z.unknown()).nullish() })
      .passthrough()
      .nullish(),
    steps: z.array(obj).nullish(),
    agent_eval: obj,
    quota,
  })
  .passthrough();

/** 3. check_cua_actions → POST /cua/classify */
export const checkCuaActionsOutput = z
  .object({
    results: z
      .array(
        z
          .object({
            step: int(),
            action: obj,
            level: z.enum(["L0", "L1", "L2", "L3"]).nullish(),
            verdict: str(),
            outcome: str(),
            reasons: z.array(z.string()).nullish(),
            matched_rules: z.array(z.unknown()).nullish(),
          })
          .passthrough(),
      )
      .nullish(),
    summary: z
      .object({
        total: int(),
        L0: int(),
        L1: int(),
        L2: int(),
        L3: int(),
        blocked: int(),
        confirm: int(),
        takeover: int(),
      })
      .passthrough()
      .nullish(),
    chains: z.array(z.unknown()).nullish(),
    has_propagation: bool(),
    injection_steps: int(),
    chain_trace: z.unknown().nullish(),
    session_id: str(),
    ruleset_version: str(),
    disclaimer: str(),
    // trace 解析出 0 步时的空结果变体
    warning: str(),
  })
  .passthrough();

/** 4. check_safety → POST /guard/check（或 fast → /guard/check-fast） */
export const checkSafetyOutput = z
  .object({
    detection_id: int(),
    passed: bool(),
    risk_score: num(),
    risk_level: str(),
    summary: str(),
    injection_detected: bool(),
    jailbreak_detected: bool(),
    harmful_detected: bool(),
    threats: z
      .array(
        z
          .object({
            category: str(),
            category_name: str(),
            severity: str(),
            match_context: str(),
            recommendation: str(),
          })
          .passthrough(),
      )
      .nullish(),
    hallucination: z.unknown().nullish(),
    llm_analysis: z.unknown().nullish(),
    quota,
  })
  .passthrough();

/** 5. check_cua_code_audit → POST /cua/audit-code（AuditReport.to_dict） */
export const checkCuaCodeAuditOutput = z
  .object({
    findings: z
      .array(
        z
          .object({
            file: str(),
            line: int(),
            severity: z.enum(["high", "medium", "low"]).nullish(),
            category: str(),
            detail: str(),
            raw: str(),
          })
          .passthrough(),
      )
      .nullish(),
    summary: z
      .object({
        total: int(),
        by_severity: obj,
        by_category: obj,
        capability_level: str(),
        tool_count: int(),
        dangerous_import_count: int(),
        injection_surface_count: int(),
      })
      .passthrough()
      .nullish(),
    disclaimer: str(),
    privacy_note: str(),
    ruleset_version: str(),
  })
  .passthrough();


/** 6. check_agent_ice_wall → POST /icewall/check（IceWallCheckRequest, server.py）
 * 智能体冰墙（童锁/保险丝）：单步护栏 + 会话级风险累积熔断。 */
export const checkAgentIceWallSchema = {
  session_id: z
    .string()
    .min(1)
    .max(128)
    .describe(
      "Session ID (caller-defined and reused across one agent session): the risk score accumulates per session, " +
        "and exceeding the threshold freezes the entire run. Always reuse one ID for a single agent task; never reuse it across tasks.",
    ),
  step: z
    .object({
      step: z.number().int().optional().describe("Step number"),
      thought: z.string().optional().describe("The step's reasoning"),
      action: z.string().optional().describe("Tool/action name called in this step"),
      action_input: z.string().optional().describe("Tool/action input"),
      observation: z.string().optional().describe("Observation returned by the tool/action"),
      final_answer: z.string().optional().describe("Final answer (last step)"),
      agent_claim: z.string().optional().describe("The agent's claim for this step (compatible with the /detect-agent schema)"),
      tool: z.string().optional().describe("Tool name (compatible with the /detect-agent schema)"),
      tool_input: z.string().optional().describe("Tool input (compatible with the /detect-agent schema)"),
      tool_output: z.string().optional().describe("Tool output (compatible with the /detect-agent schema)"),
    })
    .passthrough()
    .describe("Current step (both schemas accepted; the server normalizes automatically)"),
  prior_steps: z
    .array(z.record(z.string(), z.unknown()))
    .optional()
    .describe("Prior steps (same schema), used for cross-step detection such as loops and retry storms"),
  task: z.string().max(5000).optional().describe("Original task instruction (used to validate parameter provenance)"),
  tool_schemas: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("Tool registry {toolName: {required, properties}}; provide it to enable fabricated-tool and parameter-schema validation (both are zero-tolerance fuse conditions)"),
};

/** 7. reset_agent_ice_wall → POST /icewall/reset */
export const resetAgentIceWallSchema = {
  session_id: z.string().min(1).max(128).describe("Session ID to unfreeze"),
};

const iceWallSession = z
  .object({
    state: z.enum(["normal", "frozen", "degraded"]).nullish(),
    score: int(),
    block_streak: int(),
    frozen_until: num(),
    tripped_by: str(),
  })
  .passthrough();

export const checkAgentIceWallOutput = z
  .object({
    step: z
      .object({
        action: z.enum(["allow", "warn", "block", "frozen"]).nullish(),
        summary: str(),
        failure_modes: z.array(z.unknown()).nullish(),
        checks: z.array(z.unknown()).nullish(),
        latency_ms: num(),
      })
      .passthrough()
      .nullish(),
    session: iceWallSession.nullish(),
    action: z
      .enum(["allow", "warn", "block", "frozen"])
      .nullish()
      .describe("The only field the client must read: frozen = halt the entire run immediately"),
    quota: z.unknown().nullish(),
  })
  .passthrough();

export const resetAgentIceWallOutput = z
  .object({
    session_id: str(),
    was_frozen: bool(),
    session: iceWallSession.nullish(),
  })
  .passthrough();
