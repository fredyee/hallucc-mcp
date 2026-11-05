import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import {
  checkAgentIceWallOutput,
  checkAgentIceWallSchema,
  resetAgentIceWallOutput,
  resetAgentIceWallSchema,
} from "../schemas.js";

/**
 * check_agent_ice_wall → POST /icewall/check：智能体冰墙（童锁/保险丝）。
 * 单步幻觉护栏 + 会话级风险累积熔断；耗 detect 额度 ×1。
 * annotations：idempotentHint=false —— 每步调用会改变会话累积状态。
 */
export function registerCheckAgentIceWall(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "check_agent_ice_wall",
    {
      title: "Agent Ice Wall (Session Fuse)",
      description:
        "智能体冰墙（童锁/保险丝）：agent 每执行一步前调用一次，做单步幻觉护栏 + " +
        "会话级风险累积熔断。响应的 action 字段是唯一需要看的：allow/warn 放行、" +
        "block 本步拦截、frozen=整场立即停机（风险累积超阈值或命中捏造工具等零容忍项，" +
        "冻结期间任何动作都不应执行）。熔断条件：block=3分/warn=1分累积 ≥10、连续 3 次 block、" +
        "或一次命中捏造工具/参数 Schema 违规；冷却 5 分钟自动解冻，或用户手动 reset。" +
        "session_id 由你在整个 agent 任务内自定复用（状态在云端账号下，本地零安装零存储）。" +
        "传入 tool_schemas 工具注册表可启用捏造工具/参数校验（强烈建议）。耗额度。" +
        "与 check_cua_actions（CUA 桌面动作分级）正交：本工具管 LLM agent 的幻觉失控。",
      inputSchema: checkAgentIceWallSchema,
      outputSchema: checkAgentIceWallOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args) => toMcpResult(await backend.post("/icewall/check", args)),
  );

  server.registerTool(
    "reset_agent_ice_wall",
    {
      title: "Reset Agent Ice Wall",
      description:
        "手动解冻被冰墙冻结的 agent 会话（用户确认安全后调用）。was_frozen=false 表示" +
        "该会话本就没冻结（幂等）。解冻后风险分归零。",
      inputSchema: resetAgentIceWallSchema,
      outputSchema: resetAgentIceWallOutput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => toMcpResult(await backend.post("/icewall/reset", args)),
  );
}
