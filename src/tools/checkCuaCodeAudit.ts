import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { checkCuaCodeAuditSchema } from "../schemas.js";

/** check_cua_code_audit → POST /cua/audit-code：Agent 源码静态审计（纯规则，不耗额度）。 */
export function registerCheckCuaCodeAudit(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_cua_code_audit",
    {
      description:
        "CUA 代码审计：静态分析 Agent 源码，检测危险导入（subprocess/os.system 等）、" +
        "权限边界（eval/exec）、注入面（字符串拼接 shell）、危险默认值、沙箱缺失。" +
        "纯规则扫描，不调 LLM、不耗额度。支持单文件或多文件扫描。",
      inputSchema: checkCuaCodeAuditSchema,
    },
    async (args) => toMcpResult(await backend.post("/cua/audit-code", args)),
  );
}
