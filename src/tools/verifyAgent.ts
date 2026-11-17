import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { verifyAgentOutput, verifyAgentSchema } from "../schemas.js";

/** verify_agent → POST /detect-agent：agent 最终输出文本级检测 + 轨迹六维评估。 */
export function registerVerifyAgent(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "verify_agent",
    {
      title: "Verify Agent",
      description:
        "Agent output and trajectory self-check. Runs claim-by-claim hallucination verification on the " +
        "final answer and a six-dimension structured evaluation of the execution trajectory (factuality, " +
        "sourcing, instruction compliance, tool-claim consistency, task completion, reflection). Returns " +
        "main.claims, steps[].checks and quota. Consumes detect quota.",
      inputSchema: verifyAgentSchema,
      outputSchema: verifyAgentOutput,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args) => {
      const r = await backend.post("/detect-agent", args);
      // 不外泄内部评分骨架：移除六维 rubric 名（dimensions）与失败模式清单（failure_modes），
      // 只把可执行的逐声明结论 + 逐步 checks + 额度回传给客户端。
      if (r.ok && r.data && typeof r.data === "object" && !Array.isArray(r.data)) {
        const obj = r.data as Record<string, unknown>;
        delete obj.dimensions;
        delete obj.failure_modes;
      }
      return toMcpResult(r);
    },
  );
}
