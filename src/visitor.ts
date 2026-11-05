/**
 * 访客上报：把 /mcp 的流量补录进后端 visitor_log。
 *
 * 为什么需要：/mcp 由 nginx 直转 127.0.0.1:8787，完全不经过后端 FastAPI 进程，
 * 因此后端的访客追踪中间件一条都看不到。实测单日 /mcp 请求 2094 条（占 nginx
 * 总量近六成），访客表里是 0 —— 「访客管理」页面因此严重低估真实流量、也看不到
 * MCP 层被扫描/爆破的情况。
 *
 * 上报是 fire-and-forget：不 await、超时 500ms、失败静默。MCP 请求延迟不受影响。
 * 后端 /visitor/report 用 X-Visitor-Token 校验（该路径经 nginx /api/ 对公网开放，
 * 没有 token 就是公开的写库接口，可被拿来做存储 DoS）。
 */
import type { IncomingMessage } from "node:http";

export interface VisitorTarget {
  /** 后端 FastAPI 基址，如 http://127.0.0.1:8001 */
  baseUrl: string;
  /** 与后端 VISITOR_REPORT_TOKEN 一致；为空则不上报 */
  token: string;
  /** 上报超时（毫秒） */
  timeoutMs: number;
}

/**
 * 真实客户端 IP：X-Real-IP → XFF 末位 → socket。
 *
 * 与后端 ip_guard._client_ip 同一套优先级。nginx 用 `$proxy_add_x_forwarded_for`
 * （追加模式），XFF 第一个元素是客户端自带的、可伪造；`X-Real-IP` 是 nginx 用
 * `$remote_addr` 覆写的，客户端注入不了。上报错了 IP 会让访客表的 IP 聚合失真。
 */
export function clientIp(req: IncomingMessage): string {
  const real = req.headers["x-real-ip"];
  if (Array.isArray(real) && real.length > 0) return (real[0] ?? "").trim();
  if (typeof real === "string" && real) return real.trim();
  const xff = req.headers["x-forwarded-for"];
  if (Array.isArray(xff) && xff.length > 0) return (xff[xff.length - 1] ?? "").trim();
  if (typeof xff === "string" && xff) return (xff.split(",").slice(-1)[0] ?? "").trim();
  return req.socket?.remoteAddress ?? "unknown";
}

export function reportVisitor(
  target: VisitorTarget,
  req: IncomingMessage,
  path: string,
  apiKey: string | null,
): void {
  if (!target.token) return;
  const body = {
    ip: clientIp(req),
    method: req.method ?? "GET",
    path,
    user_agent: str(req.headers["user-agent"]).slice(0, 300),
    referer: str(req.headers["referer"] ?? req.headers["referrer"]).slice(0, 300),
    auth_key: apiKey ?? "",
  };
  try {
    void fetch(`${target.baseUrl}/visitor/report`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Visitor-Token": target.token,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(target.timeoutMs),
    }).catch(() => {
      /* 上报失败静默：访客统计绝不能影响 MCP 请求本身 */
    });
  } catch {
    /* 同上 */
  }
}

function str(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}
