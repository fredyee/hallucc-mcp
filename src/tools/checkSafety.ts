import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { checkSafetyOutput, checkSafetySchema } from "../schemas.js";

/**
 * check_safety → POST /guard/check（或 fast=true → /guard/check-fast）。
 * 复用后端 40+ 特征安全网关：Prompt 注入 / 越狱 / 有害内容检测。
 * annotations：本地规则引擎为主、不发外部检索，故 openWorldHint=false。
 */
export function registerCheckSafety(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_safety",
    {
      title: "Check Safety",
      description:
        "AI safety gateway detection. Runs three-layer OWASP LLM Top 10 detection on prompt + output: a " +
        "40+ signature rule engine (injection, jailbreak, harmful content, sensitive data leakage, fraud) " +
        "plus optional LLM deep analysis and optional hallucination detection. Returns passed, " +
        "risk_score, risk_level, threats[] (category/severity/match_context/recommendation) and quota. " +
        "fast=true uses the rule-only sub-10ms mode. Consumes detect quota (fast calls count too).",
      inputSchema: checkSafetySchema,
      outputSchema: checkSafetyOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => {
      const { fast, ...body } = args;
      const path = fast ? "/guard/check-fast" : "/guard/check";
      return toMcpResult(await backend.post(path, body));
    },
  );
}
