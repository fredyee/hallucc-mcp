#!/usr/bin/env node
/**
 * stdio 入口：`npx hallucc-mcp` 本地运行模式。
 *
 * 与 server.ts（remote HTTP）同一套工具，区别只在传输与 key 来源：
 * key 从环境变量 HALLUCC_API_KEY 读（客户端 mcp.json 的 env 字段注入），
 * 后端默认指向公网 https://aihcc.cloud（可用 HALLUCC_BASE_URL 覆盖）。
 *
 * mcp.json 配置示例：
 *   "hallucc": {
 *     "command": "npx",
 *     "args": ["-y", "hallucc-mcp"],
 *     "env": { "HALLUCC_API_KEY": "<你的 HallucC API key>" }
 *   }
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./context.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./mcpServer.js";

const apiKey = process.env.HALLUCC_API_KEY?.trim();
if (!apiKey) {
  console.error(
    "[hallucc-mcp] 缺少 HALLUCC_API_KEY 环境变量。\n" +
      "在 https://aihcc.cloud/keys 创建 key，并在客户端 mcp.json 的 env 里配置：\n" +
      '  "env": { "HALLUCC_API_KEY": "<你的 HallucC API key>" }',
  );
  process.exit(1);
}

// stdio 模式默认打公网后端（npx 用户本机没有 127.0.0.1:8001）。
const cfg = {
  ...loadConfig(),
  baseUrl: (process.env.HALLUCC_BASE_URL ?? "https://aihcc.cloud").replace(/\/+$/, ""),
};

const server = buildServer(cfg, apiKey);
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[${SERVER_NAME}] v${SERVER_VERSION} stdio 就绪 → 后端 ${cfg.baseUrl}`);
