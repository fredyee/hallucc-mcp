# HallucC MCP Server

把 HallucC 的检测能力以 **MCP（Model Context Protocol）** 工具暴露给 Claude / Cursor / Claude Desktop 等客户端，零配置接入。

**架构：薄代理（thin proxy）**——本服务用官方 `@modelcontextprotocol/sdk` (TypeScript) 实现，**不复制任何检测逻辑**，只把客户端请求原样转发到现有 HallucC FastAPI 后端（`server.py` @ :8001）。鉴权走每用户 API key，额度与 Web 端同源（同一 key = 同一账号额度）。

## 工具集（4 个）

| 工具 | 后端端点 | 作用 | 耗额度 |
|---|---|---|---|
| `verify_text` | `POST /detect` | 逐声明幻觉核验：返回红/黄/绿汇总 + 每条声明 status/confidence/reason/**sources** + citations | ✅ detect |
| `verify_agent` | `POST /detect-agent` | agent 最终输出文本级核验 + 执行轨迹六维评估（事实性/来源/指令合规/工具声明一致/任务完成/反思） | ✅ detect |
| `check_cua_actions` | `POST /cua/classify` | Computer-Use Agent 动作风险分级 L0-L3（纯规则，无 LLM） | ❌ 不耗 |
| `check_safety` | `POST /guard/check`（`fast=true` → `/guard/check-fast`） | 40+ 特征安全网关：Prompt 注入 / 越狱 / 有害内容 / 敏感信息泄露 / 欺诈 | ✅ detect |

> 鉴权模型：客户端在各自机器配 `Authorization: Bearer <你的 HallucC API key>` 头 → server 提取并**原样透传**到后端 → 后端校验 + 扣同一账号额度。key 只在 HTTP 头里流转，**不进工具参数、不进模型 transcript**。

## 公网接入（推荐，无需本地运行）

MCP server 已部署在 `https://aihcc.cloud/mcp`（nginx → 本机 8787，TLS 由 nginx 终止）。客户端直接配公网地址 + 个人 API key 即可：

```bash
# Claude Code
claude mcp add --transport http hallucc https://aihcc.cloud/mcp \
  --header "Authorization: Bearer <你的 HallucC API key>"
```

Cursor / Claude Desktop 同理，URL 填 `https://aihcc.cloud/mcp`，Headers 加 `Authorization: Bearer <key>`。API key 在 https://aihcc.cloud 注册后于 /keys 页创建，免费套餐每日有额度。

## 本地运行

```bash
# 1. 装依赖（已装可跳过）
npm install

# 2.（可选）配置后端地址与端口；默认指向本机 8001
cp .env.example .env
#   HALLUCC_BASE_URL=http://127.0.0.1:8001
#   PORT=8787

# 3. 确保后端在跑：curl http://127.0.0.1:8001/health
# 4. 起 MCP server（dev 热重载）
npm run dev
# 或生产：npm start
```

服务监听 `http://127.0.0.1:8787/mcp`，健康检查 `GET /health`。

## 客户端接入

### Claude Code（CLI）

```bash
# remote HTTP transport，带个人 key 头
claude mcp add --transport http hallucc http://127.0.0.1:8787/mcp \
  --header "Authorization: Bearer <你的 HallucC API key>"

# 验证
claude mcp list
# 在对话里调用：让 Claude 核验一段文本的幻觉 / 检测一段 prompt 的注入风险
```

### Cursor

`Settings → MCP → Add MCP server`：
- Type: `http`
- URL: `http://127.0.0.1:8787/mcp`
- Headers: `{"Authorization": "Bearer <你的 HallucC API key>"}`

### Claude Desktop

`~/Library/Application Support/Claude/claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "hallucc": {
      "type": "http",
      "url": "http://127.0.0.1:8787/mcp",
      "headers": { "Authorization": "Bearer <你的 HallucC API key>" }
    }
  }
}
```

### MCP Inspector（调试 / 不带额度也能测工具列表与鉴权）

```bash
npx @modelcontextprotocol/inspector
# 选 Streamable HTTP，URL 填 http://localhost:8787/mcp
# Custom Headers 加 Authorization: Bearer <key>
```

## 鉴权与额度

- 无 `Authorization` 头或 key 无效 → MCP 层返回 401 JSON-RPC 错误。
- key 有效但额度耗尽 → 后端返回 429，server 映射成「免费额度已用完，请明天重置或升级套餐」。
- 每个工具响应里的 `quota` 对象 = 后端 `quota_status`，与 Web 仪表盘同源、随调用递减。
- `check_cua_actions` 是纯规则，**不调 LLM、不耗额度**，可放心高频调用。

## 项目结构

```
src/
  server.ts     Express + StreamableHTTP transport（stateless）+ 鉴权中间件 + 注册工具
  context.ts    配置加载 + API key 提取
  backend.ts    BackendClient（透传 key、统一 401/429/5xx 错误映射）+ toMcpResult
  schemas.ts    4 工具 zod 输入 schema（约束对齐后端 Pydantic Field）
  tools/
    verifyText.ts       → /detect
    verifyAgent.ts      → /detect-agent
    checkCuaActions.ts  → /cua/classify
    checkSafety.ts      → /guard/check（fast → /guard/check-fast）
    index.ts            registerAllTools
```

## 传输

Streamable HTTP（当前 MCP 规范推荐的 remote 传输，即「HTTP+SSE」），**stateless** 模式：每个 POST 新建 transport + McpServer，处理完即关。Claude Code / Cursor / Claude Desktop 均原生支持。后续若要兼容只认旧版 SSE 的客户端，加 `SSEServerTransport`（双端点 `/sse` + `/messages`）即可。
