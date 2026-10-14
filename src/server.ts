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
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Response } from "express";

import { loadConfig, extractApiKey, isValidApiKey } from "./context.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./mcpServer.js";
import { LANDING_PAGE } from "./landing.js";

const cfg = loadConfig();

/** JSON-RPC 错误响应（与 MCP 协议错误体一致，便于客户端解析）。 */
function jsonrpcError(res: Response, httpStatus: number, code: number, message: string): void {
  if (res.headersSent) return;
  res
    .status(httpStatus)
    .json({ jsonrpc: "2.0", error: { code, message }, id: null });
}

// allowedHosts：放行公网域名（nginx 反代转发 Host: aihcc.cloud）+ 本机调试。
// 进程仍只绑定 127.0.0.1，公网流量必经 nginx（TLS 终止 + 敏感路径拦截）。
const app = createMcpExpressApp({
  host: cfg.host,
  allowedHosts: ["aihcc.cloud", "www.aihcc.cloud", "127.0.0.1", "localhost", "[::1]"],
});

// CORS：允许浏览器端 MCP 客户端（Glama 等 Web 沙箱）直接调用 /mcp。
// 必须挂在业务路由与鉴权之前——浏览器 OPTIONS 预检不带 API key，也要能 204 通过。
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", req.headers.origin ?? "*");
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Accept, Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version, Last-Event-ID",
  );
  res.setHeader("Access-Control-Max-Age", "86400");
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  next();
});

/**
 * 发现类方法：只读内省，不发后端请求、不返回任何用户数据。
 * 必须保持开放 —— 注册表与目录站靠它收录本 server；stdio 入口同样是
 * 「无 key 可启动 + tools/list 可用」的设计（见 stdio.ts）。
 */
const DISCOVERY_METHODS = new Set(["initialize", "notifications/initialized", "ping", "tools/list"]);

/** JSON-RPC body 是否全是发现类方法（兼容 batch 数组）。空 body 不算。 */
function isDiscoveryOnly(body: unknown): boolean {
  if (!body || typeof body !== "object") return false;
  const methods = Array.isArray(body)
    ? body.map((m) => (m as { method?: unknown })?.method)
    : [(body as { method?: unknown }).method];
  return methods.every((m) => typeof m === "string" && DISCOVERY_METHODS.has(m));
}

// 健康检查（鉴权无关，给运维 / 验证用）
app.get("/health", (_req, res) => {
  res.json({ status: "ok", server: SERVER_NAME, version: SERVER_VERSION, backend: cfg.baseUrl });
});

app.post("/mcp", async (req, res) => {
  // 门禁：发现类方法开放，其余方法必须在 MCP 层就持有格式合法的 key。
  //
  // 此前只要 Authorization 头非空就放行（任意伪造串都能握手拿完整 tools/list），
  // tools/call 全靠后端兜底。现在 MCP 层先挡一道格式门禁：
  //   · 后端校验出问题、或未来新增「纯本地实现、不经后端」的工具时，也不会变成匿名可调用；
  //   · 格式门禁不发后端请求，零额外延迟；
  //   · 误伤风险为零 —— 真 key 一律 `hc_` + 48 位 hex（生产库 598 个 key 全符合）。
  const apiKey = extractApiKey(req);
  if (!isValidApiKey(apiKey) && !(cfg.allowAnonDiscovery && isDiscoveryOnly(req.body))) {
    jsonrpcError(
      res,
      401,
      -32001,
      "未提供合法 API key：请在客户端配置 Authorization: Bearer <你的 HallucC key> 头（https://aihcc.cloud/keys 创建）",
    );
    return;
  }

  // 发现类调用允许无 key 通过；这类方法不触碰后端，空串安全（与 stdio.ts 一致）。
  const server = buildServer(cfg, apiKey ?? "");
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

app.get("/mcp", async (req, res) => {
  // 浏览器直接打开 → 友好落地页（转化闭环：给 endpoint 页面一个可读的下一步）。
  // MCP 客户端（Accept 不含 text/html）→ 仍按协议返回 405（stateless 不支持 GET/SSE）。
  if (req.accepts(["text/html", "application/json"]) === "text/html") {
    res.status(200).type("html").send(LANDING_PAGE);
    return;
  }
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
  console.log(
    `[hallucc-mcp] 工具：verify_text / verify_agent / check_cua_actions / check_cua_code_audit / check_safety`,
  );
  console.log(`[hallucc-mcp] 鉴权：Authorization: Bearer <HallucC API key>（与 Web 端同源额度）`);
  console.log(
    `[hallucc-mcp] 门禁：tools/call 等需格式合法的 key（hc_+48hex）；发现类方法` +
      `${cfg.allowAnonDiscovery ? "开放" : "也需 key"}（initialize / tools/list / ping）`,
  );
});
