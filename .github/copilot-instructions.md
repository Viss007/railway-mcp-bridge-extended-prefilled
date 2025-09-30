# MCP-over-SSE Copilot Instructions

## Project Overview

This is an **MCP-over-SSE** (Model Context Protocol over Server-Sent Events) bridge server designed for deployment on Railway. It provides a minimal, extensible server that exposes MCP tools via SSE streams and JSON-RPC endpoints, making it easy to integrate with AI assistants like ChatGPT.

**Key characteristics:**
- Minimal footprint with Express.js
- SSE streaming with keepalive pings
- JSON-RPC 2.0 MCP protocol implementation
- Railway-ready with Docker support
- Extensible tool architecture

## Technology Stack

- **Runtime**: Node.js 20+ with ES modules
- **Framework**: Express.js 4.x
- **Protocol**: Server-Sent Events (SSE) + JSON-RPC 2.0
- **Deployment**: Railway (Docker-based)
- **Dependencies**: Minimal (express, cors)

## Project Structure

```
/
├── server.js              # Main Express server with SSE + MCP endpoints
├── package.json           # Node.js project configuration
├── Dockerfile             # Docker configuration for Railway deployment
├── .env.example           # Environment variable template
├── .github/
│   ├── workflows/
│   │   ├── ci.yml        # CI workflow for builds and tests
│   │   ├── doctor.yml    # Health check and SSE validation workflow
│   │   └── redeploy.yml  # Manual Railway redeployment workflow
│   └── copilot-instructions.md  # This file
├── README.md              # User documentation
└── LICENSE                # MIT License
```

## Code Style & Conventions

### General Guidelines
- Use **ES6+ module syntax** (`import`/`export`, not `require`)
- Prefer **arrow functions** for callbacks and short functions
- Use **const** by default, **let** only when reassignment is needed
- Keep functions small and focused on a single responsibility
- Add comments only when the code intent is not obvious

### Naming Conventions
- **Functions**: camelCase (e.g., `sseHeaders`, `handleRequest`)
- **Constants**: UPPER_SNAKE_CASE for environment variables (e.g., `PORT`, `SSE_KEEPALIVE_MS`)
- **Variables**: camelCase (e.g., `session_id`, `result`)

### Error Handling
- Use try-catch blocks for async operations
- Return proper JSON-RPC error responses with appropriate error codes
- Log errors to console for debugging but avoid exposing internals to clients

## Key Endpoints

### Health Check
- **GET /healthz**: Returns `{ok: true, version: "x.x.x"}` (200 OK)
- **GET /health**: Redirects to `/healthz` (307 Temporary Redirect)

### SSE Stream
- **GET /sse**: Establishes SSE connection with periodic ping events
  - Sends initial `: ok\n\n` comment
  - Emits `event: ping\ndata: {}\n\n` every `SSE_KEEPALIVE_MS` milliseconds (default: 30000)
  - Cleans up interval on client disconnect
- **HEAD /sse**: Returns 200 OK with SSE headers
- **OPTIONS /sse**: Returns 204 No Content with Allow header
- **POST /sse**: Returns 405 Method Not Allowed

### MCP JSON-RPC
- **POST /mcp/**: Main MCP endpoint supporting:
  - `initialize`: Returns a random session ID
  - `tools/list`: Returns available tools (currently just `ping`)
  - `tools/call`: Executes a tool by name
  - Returns JSON-RPC 2.0 compliant responses with audit logging

All JSON-RPC responses follow the format:
```json
// Success
{"jsonrpc": "2.0", "id": <request_id>, "result": <result_data>}

// Error
{"jsonrpc": "2.0", "id": <request_id>, "error": {"code": <error_code>, "message": "<error_message>"}}
```

## Environment Configuration

### Required Variables
- **PORT**: Server port (default: 8080, Railway injects automatically)
- **NODE_ENV**: Environment mode (`production` for Railway)

### Optional Variables
- **SSE_KEEPALIVE_MS**: SSE ping interval in milliseconds (default: 30000)

Configure these in Railway's environment variables dashboard, not in code.

## Development Workflow

### Local Development
```bash
# Install dependencies
npm install

# Start server (defaults to port 8080)
npm start

# Test health endpoint
curl http://localhost:8080/healthz

# Test SSE stream
curl -N http://localhost:8080/sse

# Test MCP initialize
curl -X POST http://localhost:8080/mcp/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}'

# Test tools/list
curl -X POST http://localhost:8080/mcp/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'

# Test tools/call
curl -X POST http://localhost:8080/mcp/ \
  -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"ping"}}'
```

### Railway Deployment
- Railway automatically builds using the Dockerfile
- Environment variables are injected at runtime
- Health checks monitor `/healthz` endpoint
- Logs are available in Railway dashboard

## Testing Approach

### CI Workflow (`.github/workflows/ci.yml`)
- Runs on push to `main` and pull requests
- Installs dependencies with `npm ci`
- Runs builds and tests if present

### Doctor Workflow (`.github/workflows/doctor.yml`)
- Smoke tests against deployed Railway instance
- Validates `/healthz` returns 200 OK with valid JSON
- Validates `/sse` streams proper SSE events
- Ensures proper headers and event format

### Manual Testing
When adding new features:
1. Test locally with curl commands
2. Verify endpoints return proper status codes
3. Check JSON-RPC response format compliance
4. Ensure SSE streams work with proper headers
5. Validate error cases return appropriate error codes

## Adding New MCP Tools

To add a new tool to the MCP server:

1. **Add to tools/list response** in `server.js`:
   ```javascript
   const tools = [
     { name: "ping", description: "Return pong", input_schema: { type: "object", properties: {} } },
     { name: "your_tool", description: "Your tool description", input_schema: { /* schema */ } }
   ];
   ```

2. **Add handler in tools/call**:
   ```javascript
   if (method === "tools/call") {
     if (params?.name === "ping") return res.json(ok(id, "pong"));
     if (params?.name === "your_tool") {
       // Your tool logic here
       return res.json(ok(id, { /* result */ }));
     }
     return res.json(err(id, -32601, `Unknown tool: ${params?.name}`));
   }
   ```

3. **Update documentation** in README.md and this file
4. **Test locally** before deploying
5. **Deploy to Railway** and run Doctor workflow to validate

## Common Issues & Solutions

### Server won't start
- **Issue**: `Cannot find module 'server.mjs'`
- **Solution**: Ensure `package.json` start script points to `server.js` (not `server.mjs`)

### SSE not working
- **Issue**: SSE connection closes immediately
- **Solution**: Check `SSE_KEEPALIVE_MS` is set, ensure proper headers are sent

### Railway deployment fails
- **Issue**: Build errors or crash on startup
- **Solution**: Verify `Dockerfile` syntax, check Railway environment variables, review logs

### CI workflow fails
- **Issue**: npm ci fails
- **Solution**: Ensure `package-lock.json` is committed, verify Node version in workflow matches project requirements

## MCP Protocol Implementation

This server implements a minimal subset of the MCP (Model Context Protocol) specification:

- **JSON-RPC 2.0**: All requests/responses follow JSON-RPC 2.0 format
- **Session Management**: `initialize` method creates a session ID
- **Tool Discovery**: `tools/list` enumerates available tools
- **Tool Execution**: `tools/call` executes tools by name
- **Audit Logging**: All requests are logged with timestamps and duration

For full MCP specification details, refer to the MCP documentation.

## Design Philosophy

### Minimal by Design
This server intentionally provides minimal functionality to serve as a foundation. When extending:
- Keep dependencies minimal
- Prefer standard library features
- Add complexity only when necessary
- Document all additions clearly

### Extensibility
The architecture supports easy extension:
- Add new tools in the MCP handler
- Add new Express routes for custom endpoints  
- Add middleware for cross-cutting concerns (auth, logging, etc.)
- Keep backward compatibility when possible

### Deployment-Ready
All code should be production-ready:
- No console.log for debugging (use proper logging)
- Handle errors gracefully
- Set appropriate HTTP status codes
- Clean up resources (intervals, connections)
- Use environment variables for configuration

## Best Practices

1. **Keep it Simple**: Don't over-engineer. This is a bridge, not a full application.
2. **Test Thoroughly**: Use curl to verify endpoints work before committing.
3. **Document Changes**: Update README and this file when adding features.
4. **Follow Conventions**: Match existing code style and patterns.
5. **Environment-Aware**: Use env vars for configuration, never hardcode secrets.
6. **Railway-First**: Test that changes work in Railway's environment.
7. **SSE Compliance**: Ensure SSE streams follow the SSE specification.
8. **JSON-RPC Compliance**: All MCP responses must be valid JSON-RPC 2.0.

## Resources

- [Express.js Documentation](https://expressjs.com/)
- [Server-Sent Events Specification](https://html.spec.whatwg.org/multipage/server-sent-events.html)
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Railway Documentation](https://docs.railway.app/)
- [Node.js ES Modules](https://nodejs.org/api/esm.html)
