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
        "Agent ice wall (child lock / fuse). Call it once before every agent step for per-step " +
        "hallucination guardrails plus session-level cumulative risk fusing. The response's action field " +
        "is the only one you need to read: allow/warn = proceed, block = this step is intercepted, frozen " +
        "= halt the entire run immediately (the risk score passed the threshold, or a zero-tolerance " +
        "condition such as a fabricated tool was hit; no action should be executed while frozen). Fuse " +
        "conditions: block = 3 points, warn = 1 point, accumulated >= 10; three consecutive blocks; or a " +
        "single fabricated-tool / parameter-schema violation. It auto-unfreezes after a 5-minute " +
        "cooldown, or the user can reset it manually. session_id is caller-defined and must be reused for " +
        "the whole agent task (state lives in your cloud account, zero local install and zero local " +
        "storage). Pass tool_schemas as a tool registry to enable fabricated-tool and parameter " +
        "validation (strongly recommended). Consumes quota. Orthogonal to check_cua_actions (CUA desktop " +
        "action grading): this tool governs an LLM agent's own loss of control.",
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
        "Manually unfreeze an agent session frozen by the ice wall (call after the user confirms it is " +
        "safe). was_frozen=false means the session was not frozen in the first place (idempotent). The " +
        "risk score resets to zero after unfreezing.",
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
