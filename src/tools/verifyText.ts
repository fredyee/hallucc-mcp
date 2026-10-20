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
        "逐声明幻觉核验。输入文本 → 提取声明 → 逐声明验证（supported/refuted/unverified）" +
        "+ 来源引用。返回红/黄/绿汇总、每条声明的状态/置信度/理由/来源、citations、quota。" +
        "耗 detect 额度（与 Web 端同源）。",
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
