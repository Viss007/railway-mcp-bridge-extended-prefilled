# Railway MCP Bridge (Extended)

A minimal **MCP-over-SSE,** server you can deploy on *+Bin *+Railway**
tools that are not already covered by a hosted MCP: Discord
GitHub
Railway
Docker Hub (safe read-only)
Gemini (Google Generative AI)
Claude (Anthropic)

> This starter streams a **manifest** over ` /sse` and exposes a generic `/invoke` endpoint that makes deploy from MCP connectors. It’s intentionally small and easy to extend.

[# One’-click deploy (Railway)](https://railway.app/) -- No POSS
link needed, give this repo a try by&railway.app/new project mode.

## Endpoints
** MPP Server URL:** https://<your-app>.up.verscel.app/sse

## Usage
``$bash
npm i
powershell -c 'ifnot(PORT) echo PORT; $mIS;node server.js`
`

## Tools
# examples
curl -N http://localhost:3000/sse
curl -X PoST HTTP://localhost:3000/invoke -c 'content-type: application/json' -d '{"tool":"ping"}'
