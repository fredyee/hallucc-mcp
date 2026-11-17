import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { checkCuaActionsOutput, checkCuaActionsSchema } from "../schemas.js";

/**
 * check_cua_actions → POST /cua/classify：CUA 动作风险分级 L0-L3（纯规则，不耗额度）。
 * annotations：idempotentHint=false —— 传 session_id 时会把分级结果写入审计表。
 */
export function registerCheckCuaActions(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_cua_actions",
    {
      title: "Classify CUA Actions",
      description:
        "Computer-Use Agent action risk grading. Submit an action trajectory and receive a step-by-step " +
        "verdict of L0 (allow) / L1 (allow + log) / L2 (require confirmation) / L3 (block) / takeover " +
        "(suspend in credential scenarios and wait for the user to type manually), together with " +
        "matched_rules, outcome and L0-L3 tallies. The response includes ruleset_version and a disclaimer " +
        "(results are grading guidance only; no enforcement is performed). Coverage: sensitive paths, " +
        "destructive commands, irreversible element semantics; domain grading (unknown-domain navigation " +
        "-> L2, blocklisted domains and sensitive pastes into unknown domains -> L3, payment amounts " +
        "above threshold -> L3); credential vocabularies and takeover on payment/login domains; " +
        "task_scope intent deviation (out of scope escalates one level and can only narrow); multi-agent " +
        "delegation chain fields (each action may carry " +
        "chain_id/agent_id/parent_agent_id/delegation_depth; when provided the server adds chain-level " +
        "cross-hop taint analysis, raising the aggregate level to L3 and setting risk_diluted on " +
        "cross-agent propagation, returned in the chain_trace field; omitted means no effect). Pure " +
        "rule-based: no LLM calls, no quota consumed. Use it for safety self-checks before and after " +
        "agent execution.",
      inputSchema: checkCuaActionsSchema,
      outputSchema: checkCuaActionsOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => toMcpResult(await backend.post("/cua/classify", args)),
  );
}
