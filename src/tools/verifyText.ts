import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { verifyTextSchema } from "../schemas.js";

/** verify_text → POST /detect：逐声明幻觉核验 + 来源。 */
export function registerVerifyText(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "verify_text",
    {
      description:
        "逐声明幻觉核验。输入文本 → 提取声明 → 逐声明验证（supported/refuted/unverified）" +
        "+ 来源引用。返回红/黄/绿汇总、每条声明的状态/置信度/理由/来源、citations、quota。" +
        "耗 detect 额度（与 Web 端同源）。",
      inputSchema: verifyTextSchema,
    },
    async (args) => toMcpResult(await backend.post("/detect", args)),
  );
}
