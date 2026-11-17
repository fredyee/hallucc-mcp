import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { verifyTextOutput, verifyTextSchema } from "../schemas.js";

/**
 * verify_text → POST /detect：逐声明幻觉核验 + 来源。
 *
 * annotations：只读（不改被测文本）、无破坏性、非幂等（扣额度 + 联网检索结果可变）、
 * openWorld（会发起外部搜索验证）。
 * outputSchema 描述 content[0].text 里的后端 JSON（同时经 structuredContent 回传）。
 */
export function registerVerifyText(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "verify_text",
    {
      title: "Verify Text",
      description:
        "Claim-by-claim hallucination verification. Input text is split into claims, and each claim is " +
        "verified (supported / refuted / unverified) with source citations. Returns a red/yellow/green " +
        "summary plus each claim's status, confidence, reason and sources, along with citations and " +
        "quota. Consumes detect quota (shared with the web dashboard).",
      inputSchema: verifyTextSchema,
      outputSchema: verifyTextOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => toMcpResult(await backend.post("/detect", args)),
  );
}
