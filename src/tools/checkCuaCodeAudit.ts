import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { checkCuaCodeAuditOutput, checkCuaCodeAuditSchema } from "../schemas.js";

/**
 * check_cua_code_audit → POST /cua/audit-code：Agent 源码静态审计（纯规则，不耗额度）。
 * annotations：唯一幂等工具 —— 纯函数、0 LLM、不落库（源码不落盘、不用于训练）。
 */
export function registerCheckCuaCodeAudit(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_cua_code_audit",
    {
      title: "Audit CUA Code",
      description:
        "CUA code audit: static analysis of agent source code that detects dangerous imports (subprocess, " +
        "os.system, and similar), privilege boundaries (eval/exec), injection surface " +
        "(string-concatenated shell commands), dangerous defaults, and missing sandboxing. Pure " +
        "rule-based scanning: no LLM calls, no quota consumed. Supports single-file and multi-file scans.",
      inputSchema: checkCuaCodeAuditSchema,
      outputSchema: checkCuaCodeAuditOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => toMcpResult(await backend.post("/cua/audit-code", args)),
  );
}
