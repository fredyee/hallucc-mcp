# Gate Before Write — 把 HallucC 当写操作前置门禁

Agent 幻觉的真正代价不在「回答不准」，而在**传播**：

```
读工具返回 → Agent 误读 → 基于错误前提发起写操作 → 对用户谎报成功
```

用户只看到最后一句。在写操作执行**之前**拦截，资金变动从未发生；
到用户看到回复时再报，需要客服介入，且预期已被污染。

所以这个 Demo 只把门禁挂在**写操作**之前，不挂在最终回答之前。
给最终回答盖「可信/不可信」的章是事后审核；这里做的是事前拦截。

## 三个场景，期望值写死并可自校验

只演示「能拦住」是不够的：**一个把所有写操作全拦的门禁没有价值**，它只是把人全赶回去。
所以必须有「合法写操作必须放行」的对照组。

每个场景声明 `expectation`，运行时实际结论与期望不符就打 ❌——Demo 自己会揭自己的谎。

| flag | 场景 | 期望 |
|---|---|---|
| *(默认)* | 订单不可退 + Agent 谎称可退 | `blocked` 写操作被拦 |
| `--refundable` | 订单可退 + Agent 如实说可退 | `allowed` 合法写操作必须放行 |
| `--faithful` | 订单不可退 + Agent 如实转述 | `no-gate` 不产生写操作 |

跑起来：

```bash
npx tsx examples/gate-before-write/index.ts                      # 零额度，默认
npx tsx examples/gate-before-write/index.ts --refundable         # 对照组
npx tsx examples/gate-before-write/index.ts --faithful           # 对照组

export HALLUCC_API_KEY=hc_xxx        # 在 https://aihcc.cloud 生成
npx tsx examples/gate-before-write/index.ts --live --refundable  # 走真实 MCP
```

不需要装依赖：`npx tsx` 按需拉取运行时。

## 实测结果（真实线上 MCP，2026-10-13）

```
denied      🛑 拦截  [3057 ms]
            step2 claim_mismatch 观察与声称相似度 0.25 < 阈值 0.5
            step2 claim_mismatch NLI 判定矛盾 (score=1.0)
            issue_refund ¥1299.00 —— 未执行        ✅ blocked

refundable  ✅ 放行  [4634 ms]
            未发现矛盾
            写操作已执行，资金已发起变动            ✅ allowed

faithful    无写操作，门禁未触发                   ✅ no-gate
```

两个信号独立指向同一结论：文本相似度判低、NLI 判矛盾。
门禁耗时 3–5 秒（`verify_agent` → `/detect-agent`，`speed:"fast"`）。

## 三态门禁，不是两态

这是这个 Demo 最想讲的一件事：

```ts
type State = "blocked" | "allow" | "unknown";
```

- `blocked` — 门禁明确判「不可信」→ 拦
- `allow`   — 门禁明确判「可信」  → 放行
- `unknown` — 门禁没给结论（服务 500 / 超时 / 返回不可解析）→ **按拦截处理**

`unknown` 必须 fail-closed。门禁是给写操作装的，安全服务挂了时放行走写，
等于门禁形同虚测。拦下来最多是多问一句用户；放过去可能是真实资损。
误报和误放的代价完全不对称。

后端异常时 `verify_agent` 会返回错误正文而非判定结果，Demo 归为 `unknown`
并拦下，同时写明「门禁本身没给出结论，是 fail-closed 兜住的——要修门禁的
服务可用性，而不是靠兜底策略掩盖」。兜底不是修复，它只是把故障变成一次
可解释的拒绝。

## 两条建模上的坑（踩过才写进来的）

**1. `agent_claim` 必须挂在有观察的那一步。** 把 Agent 的判断单独记成一步
（`tool_output` 是空占位符），后端比对的 `observation` 就变成占位符，
门禁会在占位符上误报 CLAIM_MISMATCH，而不是判出真矛盾。真实 Agent 的
判断就是对那一步观察的解读。

**2. 门禁不能只演示拦截。** 见上——放行场景同样是必须验证的行为。

## 判定来自后端，不是自己发明一套

`judge()` 只看两样东西：

- `steps[].checks[].verdict ∈ {mismatch, fail, loop}` — 与后端
  `agent_pipeline` 自己的判据一致
- `main.claims[].verification.status === "refuted"`

`unverified` 是弃权，不算 refuted，不触发拦截——避免「没查到证据」被当成
「发现错误」。

不重新实现检测逻辑。MCP 是薄代理，判定权留在后端，这样后端升级模型或
规则时 Demo 不用跟着改。

## 接到你自己的 Agent

三个替换点，其余不变：

1. `queryOrder` / `checkRefundEligibility` / `issueRefund` — 换成真实业务调用
2. 场景里的 `claim` — 换成你的 LLM 调用。这里写死是为了让 Demo 不依赖
   LLM 额度；门禁逻辑与 LLM 无关
3. `gateLive()` 的 `callTool({name:"verify_agent", ...})` — 已经是接入点

轨迹结构就是业务工具的真实调用记录，不需要埋点改造：

```ts
{ step, tool, tool_input, tool_output, agent_claim? }
```

读操作照旧执行，只在发起写操作前调用一次门禁。

## 离线模式

默认不连网络。判定来自一个本地关键词占位规则（`gateOffline()`），**不是
HallucC**，屏幕会标明来源。它存在的唯一意义是让 Demo 零额度可跑——一个
连自己跑都跑不动的 Demo 没有演示价值。接上真实后端只是加 `--live`。
