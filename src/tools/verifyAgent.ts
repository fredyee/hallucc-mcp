import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { BackendClient, toMcpResult } from "../backend.js";
import { verifyAgentSchema } from "../schemas.js";

/** verify_agent → POST /detect-agent：agent 最终输出文本级检测 + 轨迹六维评估。 */
export function registerVerifyAgent(server: McpServer, backend: BackendClient): void {
  server.registerTool(
    "verify_agent",
    {
      description:
        "Agent 输出与轨迹自检。对最终回答跑逐声明幻觉核验，并对执行轨迹做六维结构化评估" +
        "（事实性/来源/指令合规/工具声明一致/任务完成/反思）。返回 main.claims、" +
        "steps[].checks、quota。耗 detect 额度。",
      inputSchema: verifyAgentSchema,
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
