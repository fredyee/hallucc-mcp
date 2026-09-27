HallucC MCP Server — 最小可用版本

 Context

 HallucC 后端（Python FastAPI hallucc/server.py @
 :8001）已具备全部能力：逐声明幻觉核验、agent 输出/轨迹检测、CUA 动作风险分级、40+
 特征安全网关；且已有 Authorization: Bearer <key>
 鉴权（auth.verify_api_key）与按账号共享的免费额度（auth.check_and_consume，与 Web
 仪表盘同源）。

 缺的只是一个让 Claude / Cursor 这类 MCP 客户端接入的入口。本计划在
 hallucc/mcp/（用户指定目录）用官方 @modelcontextprotocol/sdk (TypeScript)
 实现一个薄代理 remote server，暴露 4 个工具转发到现有后端，不重写任何检测逻辑、不引入
 Python 依赖。

 架构：薄代理（纯 HTTP 转发）

 Claude / Cursor  ──(MCP over Streamable HTTP, 带 Authorization 头)──▶  mcp server (TS,
 :8787)
                                                                           │  fetch +
 透传 Authorization 头
                                                                           ▼
                                                               FastAPI 后端 :8001
 (现有 /detect /guard/check /cua/classify /detect-agent)

 - 不复制 guard/verifier/cua 逻辑——TS 端只组装请求、转发、回传 JSON。
 - 鉴权：客户端在各自机器配 Authorization: Bearer <个人 key> 头 → server
   透传同一头到后端 → 后端 current_user→verify_api_key 校验 + check_and_consume
   扣额度。同一 key = 同一账号额度 → 自动"打通 Web 端"，无需在 MCP 侧另建额度系统。
 - 额度回显：每个工具响应里的 quota 对象 = 后端
   quota_status(uid)（{plan,used,limit,remaining,monthly_*}），与 Web
   仪表盘同源、随调用递减。
 - key 不进模型 transcript（只在 HTTP 头），安全。

 工具集（4 个，逐个对齐后端契约）

 工具: verify_text
 后端端点: POST /detect (server.py:508)
 关键入参: text, domain?, strict?, speed?
 返回要点: summary(红/黄/绿) + claims[](逐声明 status/confidence/reason/sources) +
 citations + quota
 耗额度: 是(detect)
 ────────────────────────────────────────
 工具: verify_agent
 后端端点: POST /detect-agent (server.py:1263)
 关键入参: agent_output, steps[], task?, tool_schemas?, domain?, speed?
 返回要点: main.claims + steps[].checks + dimensions(六维) + failure_modes + quota
 耗额度: 是(detect)
 ────────────────────────────────────────
 工具: check_cua_actions
 后端端点: POST /cua/classify (server.py:2188)
 关键入参:
 actions[{action,x,y,coordinate,text,target_app,target_element,target_path,thought}],
 session_id?
 返回要点: results[](逐步 level L0-L3 / verdict / outcome / reasons / matched_rules) +
 summary(L0-L3 计数)
 耗额度: 否(纯规则)
 ────────────────────────────────────────
 工具: check_safety
 后端端点: POST /guard/check (server.py:1762)
 关键入参: prompt, output, check_hallucination?
 返回要点: passed / risk_score / risk_level / injection_detected / jailbreak_detected /

 harmful_detected / threats[](category/severity/match_context/recommendation) + quota
 耗额度: 是(detect)

 - 40+ 特征留在后端 guard.py（INJECTION_RULES+JAILBREAK_RULES+HARMFUL_RULES，run_guard/
   run_guard_fast），TS 侧不复制。
 - check_safety 可选 fast 选项走 /guard/check-fast（纯规则 <10ms，无 LLM）；MVP 默认
   /guard/check。
 - 入参约束直接对齐后端 Pydantic Field(max_length=…)（多数 50000 字符上限）。

 传输：Streamable HTTP（即"HTTP+SSE"）

 - @modelcontextprotocol/sdk 的 StreamableHTTPServerTransport，挂 Express /mcp，处理
   POST/GET/DELETE。
 - 当前规范推荐的 remote 传输；Claude Code（--transport http）/ Cursor / Claude Desktop
   均支持；流式响应走 SSE，本质即"HTTP+SSE"。
 - ⚠ SDK 迭代快：实现前先读已安装包的 README + 类型定义确认 transport
   接线（node_modules/@modelcontextprotocol/sdk/），不凭记忆写。
 - 若后续要兼容只认旧版 SSE 的客户端，再加 SSEServerTransport（双端点
   /sse+/messages）是增量小改。

 文件布局（hallucc/mcp/）

 hallucc/mcp/
   package.json          # deps: @modelcontextprotocol/sdk, express, zod
                         # devDeps: typescript, tsx, @types/express, @types/node
   tsconfig.json         # target ES2022, module NodeNext, strict
   .env.example          # HALLUCC_BASE_URL=http://127.0.0.1:8001, PORT=8787
   README.md             # 安装/运行 + Claude Code & Cursor 接入命令
   src/
     server.ts           # Express + StreamableHTTP transport + 鉴权中间件 + 注册 4
 工具
     context.ts          # AsyncLocalStorage<{apiKey}> + getKey()（请求级 key 注入）
     backend.ts          # callBackend(path, body): 透传 key、统一 401/429/5xx 错误映射
     schemas.ts          # zod 输入 schema（与后端 Field 约束对齐）
     tools/
       verifyText.ts     # → /detect
       verifyAgent.ts    # → /detect-agent
       checkCuaActions.ts# → /cua/classify
       checkSafety.ts    # → /guard/check (可选 fast→/guard/check-fast)

 关键复用（不新写，实现时引用）

 - 后端契约：server.py:508 /detect、:1263 /detect-agent、:2188 /cua/classify、:1762
   /guard/check；请求 schema server.py:267/1254/1756/2155。
 - 鉴权：auth.verify_api_key(auth.py:449)、current_user 依赖(server.py:250，读
   Authorization: Bearer <key>)。
 - 额度：auth.check_and_consume(auth.py:672)、auth.quota_status(auth.py:594)。
 - 40+ 安全特征：guard.py INJECTION/JAILBREAK/HARMFUL_RULES +
   run_guard(:238)/run_guard_fast(:172)。
 - CUA：cua/ 包 ActionGate + cua.bridge.record_from_step + server.py:2188。

 实现步骤

 1. hallucc/mcp/ 初始化（package.json/tsconfig.json）→ npm install。
 2. 读已装 SDK 的 README + 类型，确认 McpServer + server.tool(name, desc, zodSchema,
    handler) + StreamableHTTPServerTransport 接线 → 写 src/server.ts 骨架（/mcp 路由 +
    鉴权中间件 + AsyncLocalStorage）+ src/context.ts。
 3. src/backend.ts：callBackend(path, body)——读 getKey()、fetch 带 Authorization
    头；401→"API key 无效"；429→"免费额度已用完，明天重置"；其他非 2xx→透传后端
    detail。
 4. src/schemas.ts + src/tools/*.ts：4 工具 zod schema 与 handler，逐个对齐后端
    Field(max_length) 等约束。
 5. README.md：本地运行 + 客户端接入示例。
 6. 端到端验证（见下）。

 验证

 1. 后端在跑：curl http://127.0.0.1:8001/health。
 2. 起 MCP 服务：cd hallucc/mcp && npm run dev（tsx src/server.ts，监听 :8787）。
 3. MCP Inspector：npx @modelcontextprotocol/inspector 连 http://localhost:8787/mcp，带
    Authorization: Bearer <key> 头，逐工具调用，核对返回与直连后端 /detect 等一致。
 4. Claude Code 接入实测：
    claude mcp add --transport http hallucc http://localhost:8787/mcp --header
    "Authorization: Bearer <key>"
    让 Claude 调 verify_text / check_safety / check_cua_actions /
    verify_agent，确认逐声明结果 + quota 回显 + 额度随调用递减（对齐 Web 仪表盘）。
 5. 鉴权负路径：不带 key → 报"无效 key"；错 key → 同；额度耗尽 → 报"额度已用完"。