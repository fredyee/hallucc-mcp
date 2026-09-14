import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { checkCuaActionsSchema } from "../schemas.js";

/** check_cua_actions → POST /cua/classify：CUA 动作风险分级 L0-L3（纯规则，不耗额度）。 */
export function registerCheckCuaActions(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_cua_actions",
    {
      description:
        "Computer-Use Agent 动作风险分级。提交动作轨迹 → 逐步返回 L0(放行)/L1(放行+记录)/" +
        "L2(需确认)/L3(阻断) 裁决、matched_rules、outcome，及 L0-L3 汇总计数。纯规则判定，" +
        "不调 LLM、不耗额度。用于在 agent 执行前/后做安全自检。",
      inputSchema: checkCuaActionsSchema,
    },
    async (args) => toMcpResult(await backend.post("/cua/classify", args)),
  );
}
