import express from "express";
import dotenv from "dotenv";
import Ajv from "ajv";
import { Agent } from "undici";

dotenv.config();
const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const ALLOW_WRITES = String(process.env.ALLOW_WRITES || "false").toLowerCase() === "true";

// ---- Docker Engine TLS Agent ----
function makeDockerAgent() {
  const host = process.env.DOCKER_HOST || "";
  const useTLS = String(process.env.DOCKER_TLS || "false").toLowerCase() === "true";
  if (!host) return null;
  if (!useTLS) {
    return new Agent({ connect: { timeout: 15000 } });
  }
  const b64 = (v) => (v ? Buffer.from(v, "base64").toString("utf8") : undefined);
  const ca = b64(process.env.DOCKER_TLS_CA_B64);
  const cert = b64(process.env.DOCKER_TLS_CERT_B64);
  const key = b64(process.env.DOCKER_TLS_KEY_B64);
  return new Agent({
    connect: { timeout: 15000, tls: { ca, cert, key, rejectUnauthorized: true } },
  });
}
const dockerAgent = makeDockerAgent();
const dockerHost = process.env.DOCKER_HOST || "";

// ---- SSE hub ----
let clients = new Set();
function sseSend(res, payload) {
  res.write(`event: message\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

// ---- Manifest for MCP ----
function manifest() {
  return {
    type: "manifest",
    name: "Railway MCP Bridge",
    version: "0.2.1",
    tools: [
      {
        name: "ping",
        description: "Health check; returns pong.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "discord.sendMessage",
        description: "Send a message to a Discord channel (guarded by ALLOW_WRITES).",
        input_schema: {
          type: "object",
          required: ["content"],
          properties: {
            channel_id: {
              type: "string",
              description: "Target channel ID (optional; falls back to DISCORD_DEFAULT_CHANNEL_ID)",
            },
            content: { type: "string", description: "Message content" },
          },
          additionalProperties: false,
        },
      },
      {
        name: "github.getUser",
        description: "Get the authenticated GitHub user.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "railway.listProjects",
        description: "List Railway projects (GraphQL).",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "railway.listEnvironments",
        description: "List environments for a Railway project.",
        input_schema: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } },
          additionalProperties: false,
        },
      },
      {
        name: "railway.listServices",
        description: "List services for a Railway project.",
        input_schema: {
          type: "object",
          required: ["projectId"],
          properties: { projectId: { type: "string" } },
          additionalProperties: false,
        },
      },
      {
        name: "railway.triggerDeploy",
        description: "Trigger a deployment via Railway Deploy Hook URL (guarded by ALLOW_WRITES).",
        input_schema: {
          type: "object",
          properties: {
            hook_url: {
              type: "string",
              description:
                "Deploy Hook URL from Railway (optional; falls back to RAILWAY_DEPLOY_HOOK_URL)",
            },
            payload: { type: "object", description: "Optional JSON payload", default: {} },
          },
          additionalProperties: false,
        },
      },
      {
        name: "dockerhub.listRepos",
        description: "List Docker Hub repositories for a username (read-only).",
        input_schema: {
          type: "object",
          properties: {
            username: {
              type: "string",
              description: "Docker Hub username; defaults to DOCKERHUB_USERNAME env",
            },
            page_size: { type: "integer", minimum: 1, maximum: 100, default: 10 },
          },
          additionalProperties: false,
        },
      },
      {
        name: "dockerengine.ping",
        description: "Ping the Docker Engine API.",
        input_schema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "dockerengine.listImages",
        description: "List images from Docker Engine.",
        input_schema: {
          type: "object",
          properties: { all: { type: "boolean", default: false } },
          additionalProperties: false,
        },
      },
      {
        name: "dockerengine.listContainers",
        description: "List containers from Docker Engine.",
        input_schema: {
          type: "object",
          properties: { all: { type: "boolean", default: false } },
          additionalProperties: false,
        },
      },
      {
        name: "dockerengine.runContainer",
        description: "Create and start a container (guarded by ALLOW_WRITES).",
        input_schema: {
          type: "object",
          required: ["image"],
          properties: {
            image: { type: "string", description: "e.g., alpine:3" },
            name: { type: "string", description: "Optional container name" },
            cmd: { type: "array", items: { type: "string" }, description: "Command array" },
          },
          additionalProperties: false,
        },
      },
      {
        name: "gemini.generateText",
        description: "Generate text with Google Gemini (single-turn).",
        input_schema: {
          type: "object",
          required: ["model", "prompt"],
          properties: { model: { type: "string" }, prompt: { type: "string" } },
          additionalProperties: false,
        },
      },
      {
        name: "claude.messagesCreate",
        description: "Generate text with Anthropic Claude (single-turn).",
        input_schema: {
          type: "object",
          required: ["model", "prompt"],
          properties: { model: { type: "string" }, prompt: { type: "string" } },
          additionalProperties: false,
        },
      },
    ],
  };
}

// ---- Routes ----
app.get("/", (_, res) => res.send("ok"));
app.get("/healthz", (_, res) => res.json({ ok: true }));

app.get("/sse", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  sseSend(res, manifest());
  clients.add(res);
  const keep = setInterval(() => res.write(": keep-alive\n\n"), 15000);
  req.on("close", () => {
    clearInterval(keep);
    clients.delete(res);
  });
});

// ---- Ajv + handlers ----
const ajv = new Ajv({ removeAdditional: "all", strict: false });

async function h_ping() {
  return { pong: true, ts: new Date().toISOString() };
}

async function h_discord_sendMessage(args) {
  if (!ALLOW_WRITES) return { ok: false, error: "Writes are disabled (set ALLOW_WRITES=true)" };
  const token = process.env.DISCORD_BOT_TOKEN;
  const resolvedChannel = args.channel_id || process.env.DISCORD_DEFAULT_CHANNEL_ID;
  if (!token) return { ok: false, error: "Missing DISCORD_BOT_TOKEN" };
  if (!resolvedChannel) return { ok: false, error: "Missing channel_id and DISCORD_DEFAULT_CHANNEL_ID" };

  const r = await fetch(
    `https://discord.com/api/v10/channels/${encodeURIComponent(resolvedChannel)}/messages`,
    {
      method: "POST",
      headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content: args.content }),
    }
  );
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, data };
  return {
    ok: true,
    id: data.id,
    link: `https://discord.com/channels/${data.guild_id || "@me"}/${resolvedChannel}/${data.id}`,
  };
}

async function h_github_getUser() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { ok: false, error: "Missing GITHUB_TOKEN" };
  const r = await fetch("https://api.github.com/user", {
    headers: {
      "User-Agent": "railway-mcp-bridge",
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, data };
  return { ok: true, login: data.login, id: data.id, html_url: data.html_url, name: data.name };
}

async function h_railway_listProjects() {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) return { ok: false, error: "Missing RAILWAY_TOKEN" };
  const query = `query { me { projects { edges { node { id name } } } } }`;
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.errors) return { ok: false, status: r.status, data };
  const edges = data?.data?.me?.projects?.edges || [];
  return { ok: true, count: edges.length, projects: edges.map((e) => e.node) };
}

async function h_railway_listEnvironments(args) {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) return { ok: false, error: "Missing RAILWAY_TOKEN" };
  const query = `query($projectId: String!) { project(id: $projectId) { environments { edges { node { id name } } } } }`;
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { projectId: args.projectId } }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.errors) return { ok: false, status: r.status, data };
  const edges = data?.data?.project?.environments?.edges || [];
  return { ok: true, count: edges.length, environments: edges.map((e) => e.node) };
}

async function h_railway_listServices(args) {
  const token = process.env.RAILWAY_TOKEN;
  if (!token) return { ok: false, error: "Missing RAILWAY_TOKEN" };
  const query = `query($projectId: String!) { project(id: $projectId) { services { edges { node { id name } } } } }`;
  const r = await fetch("https://backboard.railway.app/graphql/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables: { projectId: args.projectId } }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.errors) return { ok: false, status: r.status, data };
  const edges = data?.data?.project?.services?.edges || [];
  return { ok: true, count: edges.length, services: edges.map((e) => e.node) };
}

async function h_railway_triggerDeploy(args) {
  if (!ALLOW_WRITES) return { ok: false, error: "Writes are disabled (set ALLOW_WRITES=true)" };
  const url = args.hook_url || process.env.RAILWAY_DEPLOY_HOOK_URL;
  if (!url) return { ok: false, error: "Missing hook_url and RAILWAY_DEPLOY_HOOK_URL" };
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "Invalid hook_url" };
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args.payload || {}),
  });
  const text = await r.text();
  if (!r.ok) return { ok: false, status: r.status, body: text.slice(0, 2000) };
  return { ok: true, status: r.status, body: text.slice(0, 2000) };
}

async function h_dockerhub_listRepos(args) {
  const username = args.username || process.env.DOCKERHUB_USERNAME;
  const token = process.env.DOCKERHUB_TOKEN;
  if (!username) return { ok: false, error: "Missing username (arg 'username' or DOCKERHUB_USERNAME)" };
  if (!token) return { ok: false, error: "Missing DOCKERHUB_TOKEN" };
  const pageSize = Math.min(Math.max(args.page_size || 10, 1), 100);
  const url = `https://hub.docker.com/v2/repositories/${encodeURIComponent(username)}/?page_size=${pageSize}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, data };
  const repos = (data.results || []).map((r) => ({
    name: r.name,
    full_name: r.namespace + "/" + r.name,
    pulls: r.pull_count,
  }));
  return { ok: true, count: repos.length, repos };
}

// Docker Engine helpers
function dockerEnabled() {
  return Boolean(dockerHost);
}
async function dockerFetch(path, init = {}) {
  if (!dockerEnabled())
    return {
      r: { ok: false, status: 400 },
      data: { error: "Docker Engine not configured (set DOCKER_HOST)" },
      text: "",
    };
  const url = dockerHost.replace(/\/$/, "") + path;
  const r = await fetch(url, { ...init, dispatcher: dockerAgent });
  const text = await r.text();
  let data = text;
  try {
    data = JSON.parse(text);
  } catch {}
  return { r, data, text };
}

async function h_dockerengine_ping() {
  const { r, text } = await dockerFetch("/_ping");
  return { ok: r?.ok || false, status: r?.status || 0, body: String(text).slice(0, 2000) };
}
async function h_dockerengine_listImages(args) {
  const all = args.all ? "?all=1" : "";
  const { r, data } = await dockerFetch(`/images/json${all}`);
  if (!r.ok) return { ok: false, status: r.status, data };
  return { ok: true, count: Array.isArray(data) ? data.length : 0, images: data };
}
async function h_dockerengine_listContainers(args) {
  const all = args.all ? "?all=1" : "";
  const { r, data } = await dockerFetch(`/containers/json${all}`);
  if (!r.ok) return { ok: false, status: r.status, data };
  return { ok: true, count: Array.isArray(data) ? data.length : 0, containers: data };
}
async function h_dockerengine_runContainer(args) {
  if (!ALLOW_WRITES) return { ok: false, error: "Writes are disabled (set ALLOW_WRITES=true)" };
  const body = { Image: args.image, Cmd: Array.isArray(args.cmd) ? args.cmd : undefined, HostConfig: {} };
  const create = await dockerFetch(`/containers/create${args.name ? `?name=${encodeURIComponent(args.name)}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!create.r.ok) return { ok: false, step: "create", status: create.r.status, data: create.data };
  const id = create.data?.Id;
  const start = await dockerFetch(`/containers/${id}/start`, { method: "POST" });
  if (!start.r.ok) return { ok: false, step: "start", status: start.r.status, data: start.data };
  return { ok: true, id };
}

async function h_gemini_generateText(args) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "Missing GEMINI_API_KEY" };
  const model = args.model || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: args.prompt }] }],
    }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, data };
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return { ok: true, model, text };
}

async function h_claude_messagesCreate(args) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "Missing ANTHROPIC_API_KEY" };
  const model = args.model || "claude-3-5-sonnet-20240620";
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 512, messages: [{ role: "user", content: args.prompt }] }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, status: r.status, data };
  const text = data?.content?.[0]?.text || "";
  return { ok: true, model, text };
}

// ---- Tool registry ----
const handlers = {
  "ping": { schema: manifest().tools.find((t) => t.name === "ping").input_schema, fn: h_ping },
  "discord.sendMessage": {
    schema: manifest().tools.find((t) => t.name === "discord.sendMessage").input_schema,
    fn: h_discord_sendMessage,
  },
  "github.getUser": {
    schema: manifest().tools.find((t) => t.name === "github.getUser").input_schema,
    fn: h_github_getUser,
  },
  "railway.listProjects": {
    schema: manifest().tools.find((t) => t.name === "railway.listProjects").input_schema,
    fn: h_railway_listProjects,
  },
  "railway.listEnvironments": {
    schema: manifest().tools.find((t) => t.name === "railway.listEnvironments").input_schema,
    fn: h_railway_listEnvironments,
  },
  "railway.listServices": {
    schema: manifest().tools.find((t) => t.name === "railway.listServices").input_schema,
    fn: h_railway_listServices,
  },
  "railway.triggerDeploy": {
    schema: manifest().tools.find((t) => t.name === "railway.triggerDeploy").input_schema,
    fn: h_railway_triggerDeploy,
  },
  "dockerhub.listRepos": {
    schema: manifest().tools.find((t) => t.name === "dockerhub.listRepos").input_schema,
    fn: h_dockerhub_listRepos,
  },
  "dockerengine.ping": {
    schema: manifest().tools.find((t) => t.name === "dockerengine.ping").input_schema,
    fn: h_dockerengine_ping,
  },
  "dockerengine.listImages": {
    schema: manifest().tools.find((t) => t.name === "dockerengine.listImages").input_schema,
    fn: h_dockerengine_listImages,
  },
  "dockerengine.listContainers": {
    schema: manifest().tools.find((t) => t.name === "dockerengine.listContainers").input_schema,
    fn: h_dockerengine_listContainers,
  },
  "dockerengine.runContainer": {
    schema: manifest().tools.find((t) => t.name === "dockerengine.runContainer").input_schema,
    fn: h_dockerengine_runContainer,
  },
  "gemini.generateText": {
    schema: manifest().tools.find((t) => t.name === "gemini.generateText").input_schema,
    fn: h_gemini_generateText,
  },
  "claude.messagesCreate": {
    schema: manifest().tools.find((t) => t.name === "claude.messagesCreate").input_schema,
    fn: h_claude_messagesCreate,
  },
};

// ---- Invoke endpoint ----
app.post("/invoke", async (req, res) => {
  const { tool, args = {}, stream_id } = req.body || {};
  if (!tool || !handlers[tool])
    return res.status(400).json({ ok: false, error: "Unknown tool", tool });
  const validate = ajv.compile(handlers[tool].schema);
  const valid = validate(args);
  if (!valid) return res.status(400).json({ ok: false, error: "Invalid args", details: validate.errors });
  try {
    const out = await handlers[tool].fn(args);
    const payload = { type: "tool_result", tool, stream_id: stream_id || null, result: out };
    for (const c of clients) sseSend(c, payload);
    res.json(out);
  } catch (e) {
    const err = { ok: false, error: String(e?.message || e) };
    const payload = { type: "tool_error", tool, stream_id: stream_id || null, error: err };
    for (const c of clients) sseSend(c, payload);
    res.status(500).json(err);
  }
});

app.listen(PORT, () => {
  console.log(`MCP Bridge on :${PORT}`);
});
