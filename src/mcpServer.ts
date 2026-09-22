/**
 * McpServer 构造：从 server.ts 抽出，供 HTTP（server.ts）与 stdio（stdio.ts）两种
 * 传输复用。每个请求/进程一个实例，工具闭包绑定该上下文 key 对应的 BackendClient。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ServerConfig } from "./context.js";
import { BackendClient } from "./backend.js";
import { registerAllTools } from "./tools/index.js";

export const SERVER_NAME = "hallucc-mcp";
export const SERVER_VERSION = "0.1.4";

export function buildServer(cfg: ServerConfig, apiKey: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } },
  );
  const backend = new BackendClient(cfg, apiKey);
  registerAllTools(server, backend);
  return server;
}
