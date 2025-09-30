# Copilot Instructions for MCP-over-SSE

## Project Overview
This is a Railway MCP Bridge (Extended) - a minimal MCP-over-SSE server that can be deployed on Railway. The server streams a manifest over `/sse` and exposes an `/invoke` endpoint for MCP connectors.

## Technology Stack
- **Runtime**: Node.js (ES modules)
- **Framework**: Express.js
- **Key Dependencies**: cors, express
- **Deployment**: Railway, Docker

## Project Structure
- `server.js` - Main Express server implementing MCP-over-SSE protocol
- `package.json` - Project dependencies and scripts
- `Dockerfile` - Docker configuration for deployment
- `.github/workflows/` - CI/CD workflows for health checks and deployment

## Code Style & Conventions
- Use ES6+ module syntax (`import`/`export`)
- Use arrow functions for Express route handlers
- Keep code minimal and focused
- Use `const` for immutable values
- Follow existing naming conventions (camelCase for variables, UPPER_CASE for constants)

## Key Endpoints
- `GET /healthz` - Health check endpoint (returns `{ok: true, version}`)
- `GET /health` - Redirects to `/healthz`
- `GET /sse` - Server-Sent Events endpoint for streaming manifests
- `POST /mcp/` - JSON-RPC endpoint for MCP protocol

## Running the Application
```bash
npm install
npm start  # Starts server on PORT (default: 8080)
```

## Environment Variables
- `PORT` - Server port (default: 8080)
- `SSE_KEEPALIVE_MS` - SSE keepalive interval (default: 30000ms)
- `NODE_ENV` - Environment (production/development)

## Testing
The project uses GitHub Actions for smoke testing:
- Health endpoint verification
- SSE endpoint verification
- See `.github/workflows/doctor.yml` for test scenarios

## Important Notes
- The server uses JSON-RPC 2.0 protocol for MCP communication
- SSE implementation includes keepalive pings every 30 seconds
- All responses include proper CORS headers
- The project is intentionally minimal for easy extension

## Making Changes
- Keep changes minimal and focused
- Test endpoints locally before committing
- Ensure health checks continue to pass
- Follow the existing error handling patterns
- Update README.md if adding new features or endpoints
