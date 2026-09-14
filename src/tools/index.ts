import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { BackendClient } from "../backend.js";
import { registerVerifyText } from "./verifyText.js";
import { registerVerifyAgent } from "./verifyAgent.js";
import { registerCheckCuaActions } from "./checkCuaActions.js";
import { registerCheckSafety } from "./checkSafety.js";

/** 注册全部 4 个工具到 server。每个工具闭包持有已绑定该请求 key 的 BackendClient。 */
export function registerAllTools(server: McpServer, backend: BackendClient): void {
  registerVerifyText(server, backend);
  registerVerifyAgent(server, backend);
  registerCheckCuaActions(server, backend);
  registerCheckSafety(server, backend);
}
