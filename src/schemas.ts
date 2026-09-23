/**
 * 5 个工具的 zod 输入 schema（raw shape）。
 * 约束逐字段对齐后端 Pydantic `Field(...)` 上限（server.py），避免被后端 422。
 * inputSchema 传 raw shape（{k: ZodType}），由 SDK 的 objectFromShape 组装。
 */
import { z } from "zod";

const MAX_INPUT_CHARS = 50000;

/** 领域枚举，对齐 server.py DetectRequest.domain 注释。 */
const domain = z
  .enum(["general", "medical", "legal", "finance", "education", "government"])
  .optional()
  .describe("领域模式：general|medical|legal|finance|education|government");

const speed = z
  .enum(["fast", "standard", "deep"])
  .optional()
  .describe("速度模式：fast|standard|deep，默认 standard");

/** 1. verify_text → POST /detect （DetectRequest, server.py:267） */
export const verifyTextSchema = {
  text: z.string().min(1).max(MAX_INPUT_CHARS).describe("待核验的文本"),
  strict: z.boolean().optional().describe("严格模式（自我一致性），不传走全局默认"),
  domain,
  speed,
  model: z.string().max(50).optional().describe("被测模型名（选填，分享卡片展示用）"),
};

/** 2. verify_agent → POST /detect-agent （AgentDetectRequest, server.py:1254） */
const agentStep = z
  .object({
    step: z.number().int().optional().describe("步序号，默认 1"),
    tool: z.string().optional().describe("该步调用的工具名"),
    tool_input: z.string().optional().describe("工具输入"),
    tool_output: z.string().optional().describe("工具输出"),
    agent_claim: z.string().optional().describe("该步 agent 的声明"),
  })
  .describe("agent 轨迹单步");

export const verifyAgentSchema = {
  agent_output: z
    .string()
    .min(1)
    .max(50000)
    .describe("agent 最终输出文本（≥1 字，≤50000 字）"),
  steps: z.array(agentStep).optional().describe("agent 执行轨迹，逐步六维评估"),
  task: z.string().optional().describe("原始任务指令（task_completion 裁判用）"),
  tool_schemas: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("工具 Schema（与 trajectory 端点对齐）"),
  domain,
  speed,
};

/** 3. check_cua_actions → POST /cua/classify （CuaClassifyRequest, server.py:2174） */
const cuaAction = z
  .object({
    action: z.string().optional().describe("动作名（click/press/hotkey/write/move…），省略则按坐标推断"),
    x: z.number().optional().describe("坐标式点击 X"),
    y: z.number().optional().describe("坐标式点击 Y"),
    coordinate: z
      .tuple([z.number().int(), z.number().int()])
      .optional()
      .describe("[x, y] 二元组（与 x/y 二选一）"),
    action_input: z.string().optional().describe("ReAct 形态输入别名 → text"),
    text: z.string().optional().describe("type/key/paste 的内容"),
    target_app: z.string().optional().describe("目标应用"),
    app: z.string().optional().describe("target_app 别名"),
    target_element: z.string().optional().describe("目标元素标签"),
    element: z.string().optional().describe("target_element 别名"),
    target_path: z.string().optional().describe("文件操作路径 / 终端命令路径"),
    path: z.string().optional().describe("target_path 别名"),
    thought: z.string().optional().describe("agent 推理文本（审计留痕）"),
  })
  .describe("单条 CUA 动作");

export const checkCuaActionsSchema = {
  actions: z
    .array(cuaAction)
    .min(1)
    .max(500)
    .describe("待分级的动作序列（1~500 条）"),
  session_id: z
    .string()
    .min(1)
    .max(64)
    .optional()
    .describe("给了则把分级结果写入审计表，可在 /cua/audit 回放"),
};

/** 4. check_safety → POST /guard/check （GuardRequest, server.py:1756）；fast → /guard/check-fast */
export const checkSafetySchema = {
  prompt: z.string().max(50000).optional().describe("用户原始输入（默认空，≤50000 字）"),
  output: z.string().min(1).max(50000).describe("AI 响应（≥1 字，≤50000 字）"),
  check_hallucination: z.boolean().optional().describe("是否同时检测幻觉，默认 false"),
  fast: z
    .boolean()
    .optional()
    .describe("true 走纯规则快速模式（<10ms，无 LLM）→ /guard/check-fast；默认 false 走完整 /guard/check"),
};

/** 5. check_cua_code_audit → POST /cua/audit-code：Agent 源码静态审计（纯规则，不耗额度）。 */
export const checkCuaCodeAuditSchema = {
  code: z
    .string()
    .max(50000)
    .optional()
    .describe("单文件模式：要扫描的源代码文本（≤50000 字符），与 files 二选一"),
  filename: z
    .string()
    .optional()
    .describe("单文件模式：文件名，用于报告中标识（默认 input.py）"),
  language: z
    .enum(["auto", "python", "javascript", "typescript"])
    .optional()
    .describe("语言提示，auto 时按 filename 扩展名推断（默认 auto）"),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().max(50000),
        language: z.enum(["auto", "python", "javascript", "typescript"]).optional(),
      }),
    )
    .optional()
    .describe("多文件模式：[{path, content, language?}] 数组，与 code 二选一"),
};
