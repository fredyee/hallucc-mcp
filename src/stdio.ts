#!/usr/bin/env node
/**
 * stdio 入口：`npx hallucc-mcp` 本地运行模式。
 *
 * 与 server.ts（remote HTTP）同一套工具，区别只在传输与 key 来源：
 * key 从环境变量 HALLUCC_API_KEY 读（客户端 mcp.json 的 env 字段注入），
 * 后端默认指向公网 https://aihcc.cloud/api（可用 HALLUCC_BASE_URL 覆盖）。
 *
 * mcp.json 配置示例：
 *   "hallucc": {
 *     "command": "npx",
 *     "args": ["-y", "hallucc-mcp"],
 *     "env": { "HALLUCC_API_KEY": "<你的 HallucC API key>" }
 *   }
 *
 * 设计说明（重要）：
 *   进程在「未提供 key」时也要能正常启动。工具列表（tools/list）与 schema 内省
 *   不需要鉴权，目录站/评估器（如 Glama 的容器检查）会在无密钥环境下拉起本进程，
 *   若此处在启动阶段 process.exit(1) 会导致连接被立即关闭（Connection closed），
 *   评估失败。故无 key 时只打印提示、继续启动；真正的核验类工具调用由
 *   BackendClient 返回可读的 401 错误。
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadConfig } from "./context.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./mcpServer.js";

const apiKey = process.env.HALLUCC_API_KEY?.trim();
if (!apiKey) {
  // 不再 exit(1)：允许「无鉴权」启动，便于工具列表/内省与目录站评估。
  console.error(
    "[hallucc-mcp] 未检测到 HALLUCC_API_KEY：将以「未鉴权」模式启动。" +
      "工具列表可用，但调用核验类工具会返回 401。\n" +
      "正式使用请在客户端 mcp.json 的 env 中配置 HALLUCC_API_KEY" +
      "（在 https://aihcc.cloud/keys 创建）：\n" +
      '  "env": { "HALLUCC_API_KEY": "<你的 HallucC API key>" }',
  );
}

// stdio 模式默认打公网后端（npx 用户本机没有 127.0.0.1:8001）。
// 注意：公网 API 必须带 /api 前缀（nginx 仅代理 /api/ 到后端，其余路径落前端）。
const cfg = {
  ...loadConfig(),
  baseUrl: (process.env.HALLUCC_BASE_URL ?? "https://aihcc.cloud/api").replace(/\/+$/, ""),
};

const server = buildServer(cfg, apiKey ?? "");
const transport = new StdioServerTransport();
await server.connect(transport);
console.error(`[${SERVER_NAME}] v${SERVER_VERSION} stdio 就绪 → 后端 ${cfg.baseUrl}`);
