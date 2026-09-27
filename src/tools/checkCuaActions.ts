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
        "L2(需确认)/L3(阻断)/takeover(凭据场景挂起等用户亲手输入) 裁决、matched_rules、outcome，" +
        "及 L0-L3 汇总计数；响应含 ruleset_version（规则库版本）与 disclaimer（本结果仅为分级参考，" +
        "未执行实际拦截）。覆盖：敏感路径/破坏性命令/不可逆元素语义、域名分级（未知域导航 L2、" +
        "黑名单域与敏感粘贴到未知域 L3、支付金额超阈值 L3）、凭据词表与支付/登录域 takeover、" +
        "task_scope 任务意图偏离（越界升一级，只能收窄）、多智能体委托链字段（每条动作可选 " +
        "chain_id/agent_id/parent_agent_id/delegation_depth，给了则服务端追加链级跨跳污点分析：" +
        "跨 agent 传播时聚合级别抬到 L3 并置 risk_diluted，返回在 chain_trace 字段；未给则零影响）。" +
        "纯规则判定，不调 LLM、不耗额度。" +
        "用于在 agent 执行前/后做安全自检。",
      inputSchema: checkCuaActionsSchema,
    },
    async (args) => toMcpResult(await backend.post("/cua/classify", args)),
  );
}
