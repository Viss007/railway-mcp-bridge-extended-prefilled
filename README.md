# Railway MCP Bridge (Extended)

A minimal **MCP-over-SSE** server you can deploy on **Railway** with tools that are not already covered by a hosted MCP:
- Discord
- GitHub
- Railway
- Docker Hub (safe read-only)
- Gemini (Google Generative AI)
- Claude (Anthropic)

> This starter streams a **manifest** over `/sse` and exposes a generic `/mcp/` endpoint that makes it easy to deploy MCP connectors. It's intentionally small and easy to extend.

[One-click deploy (Railway)](https://railway.app/new) - No setup needed, give this repo a try via Railway.app.

## Endpoints
**MCP Server URL:** `https://<your-app>.up.railway.app/sse`

## Usage
```bash
npm i
PORT=8080 node server.js
```

## Tools
- `ping` - Returns "pong"

## Examples
```bash
# SSE endpoint
curl -N http://localhost:8080/sse

# MCP JSON-RPC endpoint
curl -X POST http://localhost:8080/mcp/ -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```
