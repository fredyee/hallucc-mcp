import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { checkSafetySchema } from "../schemas.js";

/**
 * check_safety → POST /guard/check（或 fast=true → /guard/check-fast）。
 * 复用后端 40+ 特征安全网关：Prompt 注入 / 越狱 / 有害内容检测。
 */
export function registerCheckSafety(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_safety",
    {
      description:
        "AI 安全网关检测。对 prompt + output 跑 OWASP LLM Top 10 三层检测：40+ 特征规则引擎" +
        "（注入/越狱/有害内容/敏感信息泄露/欺诈）+ 可选 LLM 深度分析 + 可选幻觉检测。" +
        "返回 passed、risk_score、risk_level、threats[]（category/severity/match_context/" +
        "recommendation）、quota。fast=true 走纯规则 <10ms 模式。耗 detect 额度（fast 亦计入）。",
      inputSchema: checkSafetySchema,
    },
    async (args) => {
      const { fast, ...body } = args;
      const path = fast ? "/guard/check-fast" : "/guard/check";
      return toMcpResult(await backend.post(path, body));
    },
  );
}
