/**
 * 请求级上下文：配置加载 + API Key 提取。
 *
 * 鉴权模型：每个 MCP 客户端在各自机器配置 `Authorization: Bearer <个人 key>`
 * 头。server 从进站 MCP 请求里提取该头，原样透传到后端 → 后端 `current_user`
 * → `verify_api_key` 校验 + `check_and_consume` 扣额度。同一 key = 同一账号额度
 * = 自动「打通 Web 端」，MCP 侧不另建额度系统。Key 只在 HTTP 头里流转，
 * 不进工具参数、不进模型 transcript。
 */
import type { IncomingMessage } from "node:http";

export interface ServerConfig {
  /** 后端 FastAPI 基址（默认 http://127.0.0.1:8001） */
  baseUrl: string;
  /** MCP server 监听端口（默认 8787） */
  port: number;
  /** 请求后端超时（毫秒） */
  backendTimeoutMs: number;
  /** 绑定地址 */
  host: string;
}

export function loadConfig(): ServerConfig {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  const baseUrl = (process.env.HALLUCC_BASE_URL ?? "http://127.0.0.1:8001").replace(/\/+$/, "");
  const backendTimeoutMs = Number(process.env.BACKEND_TIMEOUT_MS ?? 120000);
  return { baseUrl, port, backendTimeoutMs, host };
}

/**
 * 从进站请求的 `Authorization: Bearer <key>` 头提取 API key。
 * 也兼容裸 key（无 Bearer 前缀）的容错输入。
 */
export function extractApiKey(req: IncomingMessage): string | null {
  const raw = req.headers["authorization"] ?? req.headers["Authorization"];
  const h = Array.isArray(raw) ? raw[0] : raw;
  if (!h) return null;
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (m && m[1]) {
    const k = m[1].trim();
    if (k) return k;
  }
  // 容错：裸 key（无 Bearer 前缀）
  const k = h.trim();
  return k || null;
}
