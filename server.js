import express from "express";
import cors from "cors";
import crypto from "crypto";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const PORT = process.env.PORT || 8080;
const version = process.env.npm_package_version || "dev";
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";

/* ---- Auth middleware ---- */
app.use((req, res, next) => {
  if (ADMIN_TOKEN && (req.url.startsWith("/mcp") || req.url.startsWith("/sse"))) {
    const token = req.headers["x-admin-token"];
    if (token !== ADMIN_TOKEN) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }
  next();
});

/* ---- Health ---- */
app.get("/healthz", (_, res) => res.status(200).json({ ok: true, version }));
app.get("/health",  (_, res) => res.redirect(307, "/healthz"));

/* ---- SSE contract ChatGPT expects ---- */
function sseHeaders(res) {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
  });
}
app.head("/sse", (req, res) => { sseHeaders(res); res.status(200).end(); });
app.options("/sse", (req, res) => { res.set("Allow","GET,OPTIONS"); res.status(204).end(); });
app.post("/sse", (req, res) => { res.set("Allow","GET,OPTIONS"); res.status(405).send("Method Not Allowed"); });
app.get("/sse", (req, res) => {
  sseHeaders(res);
  res.flushHeaders?.();
  res.write(": ok\n\n");
  const iv = setInterval(() => res.write("event: ping\ndata: {}\n\n"), parseInt(process.env.SSE_KEEPALIVE_MS||"30000",10));
  req.on("close", () => clearInterval(iv));
});

/* ---- Minimal MCP JSON-RPC that passes Doctor ---- */
const ok = (id, result) => ({ jsonrpc: "2.0", id, result });
const err = (id, code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });

app.post("/mcp/", (req, res) => {
  const { id, method, params } = req.body || {};
  const t0 = Date.now();
  try {
    if (method === "initialize") {
      const session_id = crypto.randomBytes(5).toString("base64url").toUpperCase();
      return res.json(ok(id, { session_id }));
    }
    if (method === "tools/list") {
      const tools = [{ name: "ping", description: "Return pong", input_schema: { type: "object", properties: {} } }];
      return res.json(ok(id, { tools }));
    }
    if (method === "tools/call") {
      if (params?.name === "ping") return res.json(ok(id, "pong"));
      return res.json(err(id, -32601, `Unknown tool: ${params?.name}`));
    }
    return res.json(err(id, -32601, "Method not found"));
  } finally {
    try {
      console.log("[audit]", JSON.stringify({
        ts: new Date().toISOString(),
        action: method,
        duration_ms: Date.now() - t0,
      }));
    } catch {}
  }
});

app.all("/mcp", (_, res) => res.status(405).json({ error:"Use POST /mcp/" }));

app.listen(PORT, () => console.log(`listening on ${PORT}`));

