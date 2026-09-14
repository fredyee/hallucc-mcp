/**
 * HallucC MCP Server — 薄代理 remote server。
 *
 * 传输：Streamable HTTP（即「HTTP+SSE」），stateless 模式：每个 POST 新建 transport +
 * McpServer，处理完即关。Claude Code / Cursor / Claude Desktop 均支持，零会话状态。
 *
 * 鉴权：客户端在 `Authorization: Bearer <key>` 头里带个人 API key → server 提取并透传
 * 到后端 → 后端校验 + 扣同一账号额度（与 Web 仪表盘同源）。key 不进工具参数、不进模型
 * transcript。无 key / 错 key → 401；额度用完 → 后端 429（映射成可读错误）。
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Response } from "express";

import { loadConfig, extractApiKey } from "./context.js";
import { BackendClient } from "./backend.js";
import { registerAllTools } from "./tools/index.js";

const SERVER_NAME = "hallucc-mcp";
const SERVER_VERSION = "0.1.0";

const cfg = loadConfig();

/** JSON-RPC 错误响应（与 MCP 协议错误体一致，便于客户端解析）。 */
function jsonrpcError(res: Response, httpStatus: number, code: number, message: string): void {
  if (res.headersSent) return;
  res
    .status(httpStatus)
    .json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

/** 每请求构造一个 McpServer，工具闭包绑定该请求的 key 对应的 BackendClient。 */
function buildServer(apiKey: string): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { logging: {} } },
  );
  const backend = new BackendClient(cfg, apiKey);
  registerAllTools(server, backend);
  return server;
}

// allowedHosts：放行公网域名（nginx 反代转发 Host: aihcc.cloud）+ 本机调试。
// 进程仍只绑定 127.0.0.1，公网流量必经 nginx（TLS 终止 + 敏感路径拦截）。
const app = createMcpExpressApp({
  host: cfg.host,
  allowedHosts: ["aihcc.cloud", "www.aihcc.cloud", "127.0.0.1", "localhost", "[::1]"],
});

// 健康检查（鉴权无关，给运维 / 验证用）
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, backend: cfg.baseUrl });
});

app.post("/mcp", async (req, res) => {
  // 鉴权：必须在创建 server 前完成——BackendClient 需要该请求的 key。
  const apiKey = extractApiKey(req);
  if (!apiKey) {
    jsonrpcError(res, 401, -32001, "未提供 API key：请在客户端配置 Authorization: Bearer <你的 HallucC key> 头");
    return;
  }

  const server = buildServer(apiKey);
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    transport.onerror = (err: Error) => {
      console.error(`[mcp] transport error: ${err.message}`);
    };
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });
  } catch (err) {
    console.error(`[mcp] 请求处理失败: ${err instanceof Error ? err.message : String(err)}`);
    jsonrpcError(
      res,
      500,
      -32603,
      `Internal server error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
});

app.get("/mcp", async (_req, res) => {
  // stateless 模式不维护会话，不支持 GET 长连接 SSE。
  res.writeHead(405).end(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)." }, id: null }),
  );
});

app.delete("/mcp", async (_req, res) => {
  res.writeHead(405).end(
    JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server)." }, id: null }),
  );
});

app.listen(cfg.port, cfg.host, () => {
  console.log(`[hallucc-mcp] 监听 http://${cfg.host}:${cfg.port}/mcp  →  后端 ${cfg.baseUrl}`);
  console.log(`[hallucc-mcp] 工具：verify_text / verify_agent / check_cua_actions / check_safety`);
  console.log(`[hallucc-mcp] 鉴权：客户端带 Authorization: Bearer <HallucC API key> 头（与 Web 端同源额度）`);
});
