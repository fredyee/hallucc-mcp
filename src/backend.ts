/**
 * 后端薄代理：单一把 API key 闭包注入的 HTTP 客户端。
 *
 * `BackendClient` 每次请求 new 一个（绑定该请求的 key），`post()` 负责转发
 * 到 FastAPI 后端，统一把 401/429/5xx/超时/连接失败映射成可读中文错误。
 * `toMcpResult()` 把后端 JSON / 错误转成 MCP `CallToolResult`。
 */
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { ServerConfig } from "./context.js";

export type BackendResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status: number; error: string };

export class BackendClient {
  constructor(
    private readonly cfg: ServerConfig,
    private readonly apiKey: string,
  ) {}

  async post(path: string, body: unknown): Promise<BackendResult> {
    const url = `${this.cfg.baseUrl}${path}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.backendTimeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      const text = await res.text();
      let data: unknown = text;
      const head = text.trimStart();
      if (head.startsWith("{") || head.startsWith("[")) {
        try {
          data = JSON.parse(text);
        } catch {
          /* 保留纯文本 */
        }
      }
      if (res.ok) return { ok: true, status: res.status, data };
      return { ok: false, status: res.status, error: mapError(res.status, data) };
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || ctrl.signal.aborted)) {
        return { ok: false, status: 0, error: `后端请求超时（${this.cfg.backendTimeoutMs}ms）：${url}` };
      }
      return { ok: false, status: 0, error: `无法连接后端 ${url}：${e instanceof Error ? e.message : String(e)}` };
    } finally {
      clearTimeout(timer);
    }
  }
}

function mapError(status: number, data: unknown): string {
  const detail = extractDetail(data);
  if (status === 401) return `API key 无效或未授权（401）${detail ? "：" + detail : ""}`;
  if (status === 429) return `免费额度已用完，请明天重置或升级套餐（429）${detail ? "：" + detail : ""}`;
  if (status === 422) return `请求参数校验失败（422）${detail ? "：" + detail : ""}`;
  if (status >= 500) return `后端服务异常（${status}）${detail ? "：" + detail : ""}`;
  return `后端返回 ${status}${detail ? "：" + detail : ""}`;
}

/** 从 FastAPI 错误体里提炼可读 detail（string 或 422 的 [{msg,...}]）。 */
function extractDetail(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") return data;
  if (typeof data === "object" && data !== null) {
    const d = (data as Record<string, unknown>).detail;
    if (typeof d === "string") return d;
    if (d != null) {
      try {
        return JSON.stringify(d);
      } catch {
        return String(d);
      }
    }
  }
  try {
    return JSON.stringify(data);
  } catch {
    return String(data);
  }
}

/** 把后端结果转成 MCP 工具返回：成功→美化 JSON 文本；失败→错误文本 + isError。 */
export function toMcpResult(r: BackendResult): CallToolResult {
  if (r.ok) {
    const text = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
    return { content: [{ type: "text" as const, text }], isError: false };
  }
  return { content: [{ type: "text" as const, text: r.error }], isError: true };
}
