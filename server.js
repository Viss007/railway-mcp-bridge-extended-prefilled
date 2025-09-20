import express from "express";
import dotenv from "dotenv";
import Ajv from "ajv";
import { Agent } from "undici";

dotenv.config();const app = express();app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;const ALLOW_WRITES = String(process.env.ALLOW_WRITES || "false").toLowerCase() === "true";

// ---- Docker Engine TLS Agent ----
function makeDockerAgent() {  const host = process.env.DOCKER_HOST || "";  const useTLS = String(process.env.DOCKER_TLS || "false").toLowerCase() === "true";  if (!host) return null;  if (!useTLS) {    return new Agent({connect: { timeout: 15000 } });  }  const b64 = (v) => (v ? Buffer.from(v, "base64").toString("utf8") : undefined);  const ca = b64(process.env.DOCKER_TLS_CA_B64);  const cert = b64(process.env.DOCKER_TLS_CERT_B64);  const key = b64(process.env.DOCKER_TLS_KEY_B64);  return new Agent({connect: { timeout: 15000, tls: { ca, cert, key, rejectUnauthorized: true } },  });}const dockerAgent = makeDockerAgent();const dockerHost = process.env.DOCKER_HOST || "";

// ---- SSE hub ----let clients = new Set();
function sseSend(res, event, payload) {
  res.write("event: " + event + "\n");
  res.write("data: " + JSON.stringify(payload) + "\n\n");
}


// ---- Manifest for MCP ----
function manifest() {
  return {
    type: "manifest",
    name: "Railway MCPBridge",
    version: "0.2.1",
    tools: [
      {
        name: "ping",
        description: "Health check; returns pong.",
        input_schema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "discord.sendMessage",
        description: "Send a message to a Discord channel (guarded by ALLOW_WRITES).",
        input_schema: {
          type: "object",
          required: ["content"],
          properties: {
            channel_id: { type: "string", description: "Target channel ID" },
            content: { type: "string", description: "Message content" }
          },
          additionalProperties: false
        }
      },
      {
        name: "github.getUser",
        description: "Get the authenticated GitHub user.",
        input_schema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "railway.listProjects",
        description: "List Railway projects (GraphQL).",
        input_schema: { type: "object", properties: {}, additionalProperties: false }
      }
    ]
  };
;
}

// ---- Routes ----
app.get("/", (_, res) => res.send("ok"));
app.get("/healthz", (_, res) => res.json({ ok: true }));

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  sseSend(res, "manifest", manifest());

  const keep = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(keep);
  });
});

// ---- Ajv + handlers ----
const ajv = new Ajv({ removeAdditional: "all", strict: false });f
  function h_ping() {

  return { pong: true, ts: new Date().toISOString() };
}


async function h_discord_sendMessage(args) {  if (!ALLOW_WRITES) return { ok: false, error: "Writes are disabled (set ALLOW_WRITES=true)" };  const token = process.env.DISCORD_BOT_TOKEN;  const resolvedChannel = args.channel_id || process.env.DISCORD_DEFAULT_CHANNEL_ID;  if (!token) return { ok: false, error: "Missing DISCORD_BOT_TOKEN" };  if (!resolvedChannel) return { ok: false, error: "Missing channel_id and DISCORD_DEFAULT_CHANNEL_ID" };  const r = await fetch( `https://discord.com/api/v10/channels/${encodeURIComponent(resolvedChannel)}/messages`,    {      method: "POST",      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },      body: JSON.stringify({ content: args.content }),    }  );  const data = await r.json().catch(() => ({}));  if (!r.ok) return { ok: false, status: r.status, data };  return {    ok: true,    id: data.id,    link: https://discord.com/channels/${data.guild_id || "@me"}/${resolvedChannel}/${data.id} } }

async function h_github_getUser() {  const token = process.env.GITHUB_TOKEN;  if (!token) return { ok: false, error: "Missing GITHUB_TOKEN" };  const r = await fetch("https://api.github.com/user", {    headers: {     "User-Agent": "railway-mcp-bridge",     Authorization: Bearer ${token},     Accept: "application/vnd.github+json",   },  });  const data = await r.json().catch(() => ({}));  if (!r.ok) return { ok: false, status: r.status, data };  return { ok: true, login: data.login, id: data.id, html_url: data.html_url, name: data.name };}

async function h_railway_listProjects() {  const token = process.env.RAILWAY_TOKEN;  if (!token) return { ok: false, error: "Missing RAILWAY_TOKEN" };  const query = query { me { projects { edges { node { id name } } } } };  const r = await fetch("https://backboard.railway.app/graphql/v2", {    method: "POST",    headers: { "Content-Type": "application/json", Authorization: Bearer ${token} },   body: JSON.stringify({ query }),  });  const data = await r.json().catch(() => ({}));  if (!r.ok || data.errors) return { ok: false, status: r.status, data };  const edges = data?.data?.me?.projects?.edges || [];  return { ok: true, count: edges.length, projects: edges.map((e) => e.node) };}
