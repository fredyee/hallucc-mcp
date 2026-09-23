/**
 * `/mcp` 浏览器落地页：浏览器 GET（Accept: text/html）时返回，把「访问 endpoint
 * 只看到 JSON-RPC 报错」的断点变成可读的接入指引。纯静态字符串，零依赖。
 */
export const LANDING_PAGE = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HallucC MCP Endpoint — aihcc.cloud</title>
<style>
  :root { color-scheme: light dark; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         max-width: 720px; margin: 0 auto; padding: 48px 24px; line-height: 1.6; }
  h1 { font-size: 1.6rem; margin-bottom: 0.2em; }
  .badge { display: inline-block; font-size: .8rem; padding: 2px 10px; border-radius: 999px;
           background: #16a34a22; color: #16a34a; border: 1px solid #16a34a55; margin-left: 8px;
           vertical-align: middle; }
  code, pre { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  pre { background: #8882; border-radius: 8px; padding: 14px 16px; overflow-x: auto; font-size: .85rem; }
  .endpoint { font-size: 1.05rem; background: #8882; border-radius: 8px; padding: 10px 16px;
              display: inline-block; }
  h2 { font-size: 1.1rem; margin-top: 2em; }
  a { color: #4f8ff7; }
  .muted { opacity: .65; font-size: .9rem; }
  ul { padding-left: 1.3em; }
</style>
</head>
<body>
<h1>HallucC MCP Endpoint <span class="badge">● online</span></h1>
<p class="muted">Claim-by-claim AI hallucination detection with sources &middot; agent trajectory verification &middot; L0–L3 risk gating for Computer-Use actions &middot; Agent source code static audit &middot; prompt-injection / jailbreak guard.</p>

<p>This URL is a <strong>Model Context Protocol</strong> endpoint (Streamable HTTP). It is meant for MCP clients, not browsers — point your client at it:</p>
<p class="endpoint"><code>https://aihcc.cloud/mcp</code></p>

<h2>1. Get an API key</h2>
<p>Sign up at <a href="https://aihcc.cloud">aihcc.cloud</a> and create a key on the <a href="https://aihcc.cloud/keys">Keys page</a>. The free tier includes a daily quota.</p>

<h2>2. Connect your client</h2>
<p><strong>Claude Code</strong></p>
<pre>claude mcp add --transport http hallucc https://aihcc.cloud/mcp \\
  --header "Authorization: Bearer &lt;your HallucC API key&gt;"</pre>
<p><strong>Cursor / Claude Desktop</strong> (<code>mcp.json</code>)</p>
<pre>{
  "mcpServers": {
    "hallucc": {
      "url": "https://aihcc.cloud/mcp",
      "headers": { "Authorization": "Bearer &lt;your HallucC API key&gt;" }
    }
  }
}</pre>
<p><strong>Or run locally via npx</strong> (stdio transport)</p>
<pre>{
  "mcpServers": {
    "hallucc": {
      "command": "npx",
      "args": ["-y", "hallucc-mcp"],
      "env": { "HALLUCC_API_KEY": "&lt;your HallucC API key&gt;" }
    }
  }
}</pre>

<h2>Tools</h2>
<ul>
  <li><code>verify_text</code> — claim-by-claim hallucination check with cited sources</li>
  <li><code>verify_agent</code> — verify an agent's tool-call trajectory</li>
  <li><code>check_cua_actions</code> — L0–L3 risk gating before Computer-Use actions execute</li>
  <li><code>check_cua_code_audit</code> — static audit of Agent source code for dangerous patterns</li>
  <li><code>check_safety</code> — 40+ feature prompt-injection / jailbreak screen</li>
</ul>

<p class="muted">
  <a href="https://github.com/fredyee/hallucc-mcp">GitHub</a> &middot;
  <a href="https://glama.ai/mcp/servers/fredyee/hallucc-mcp">Glama</a> &middot;
  <a href="https://aihcc.cloud">Dashboard</a><br>
  Health check: <code>GET /health</code> &middot; MCP clients should <code>POST /mcp</code>
</p>
</body>
</html>
`;
