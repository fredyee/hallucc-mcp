#!/usr/bin/env node
/**
 * 从运行中的 MCP server 拉 tools/list，重生成 server-card.updated.json 的 tools 段。
 *
 * 为什么需要这个脚本：卡片是手写静态文件，工具定义在 src/ 里另有一份，两处漂移是
 * 之前事故的根因（卡片里的 outputSchema 有 4/5 与后端实际响应字段对不上）。
 * 现在 tools 段以运行中的 server 为唯一事实来源，手工只维护顶层元数据。
 *
 * 用法：node scripts/gen-server-card.mjs [BASE_URL]
 *   BASE_URL 默认 http://127.0.0.1:8787（本机生产实例；tools/list 属发现类方法，无需 key）
 *
 * 顶层的 title 由工具注册时的 title 配置提升而来；annotations 只保留 4 个 hint
 * （title 属于工具自身字段，按 MCP 规范不放进 annotations）。
 */
import { readFileSync, writeFileSync } from "node:fs";

const BASE = (process.argv[2] || "http://127.0.0.1:8787/mcp").replace(/\/$/, "");
const CARD = "server-card.updated.json";

const KEY = "hc_" + "ab".repeat(24); // tools/list 是发现类方法，门禁放行，不带 key 也行

const res = await fetch(BASE, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${KEY}`,
  },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {},
  }),
});
const raw = await res.text();
const rpc = JSON.parse(raw.match(/data:\s*(\{.*\})/s)?.[1] ?? raw);
if (rpc.error) {
  console.error(`tools/list 失败: ${JSON.stringify(rpc.error)}`);
  process.exit(1);
}
const wire = rpc.result.tools;

// title 提到工具顶层，annotations 只留 4 个 hint
const tools = wire.map((t) => {
  const annotations = {
    ...(t.annotations &&
      Object.fromEntries(
        Object.entries(t.annotations).filter(([k]) => k.endsWith("Hint")),
      )),
  };
  return {
    name: t.name,
    ...(t.title ? { title: t.title } : {}),
    description: t.description,
    inputSchema: t.inputSchema,
    ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
    annotations,
  };
});

const card = JSON.parse(readFileSync(CARD, "utf8"));
card.tools = tools;
writeFileSync(CARD, JSON.stringify(card, null, 2) + "\n");

console.log(`已重生成 ${CARD}`);
for (const t of tools) {
  console.log(
    `  ${t.name.padEnd(22)} title=${t.title ?? "-"}  outputSchema=${t.outputSchema ? "✓" : "-"}  ` +
      `hints=${Object.keys(t.annotations).join(",")}`,
  );
}
