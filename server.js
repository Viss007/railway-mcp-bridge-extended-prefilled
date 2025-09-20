import express from "express";
import dotenv from "dotenv";
import Ajv from "ajv";
import { Agent } from "undici";

dotenv.config();
const app = express();
app.use(express.json({ limit: "1mb" }));

const PORT = process.env.PORT || 3000;
const ALLOW_WRITES = String(process.env.ALLLOW_WRITES || "false").toLowerCase() === "true";

// --- Docker Engine TLS Agent ---
function makeDockerAgent() {
  const host = process.env.DOCKER_HOST || "";
  const useTLS = String(process.env.DOCKER_TLS || "false").toLowerCase() === "true";
  if (!host) return null;
  if (!useTLS) {
    // non-TLS agent
    return new Agent({ connect: { timeout: 15000 } });
  }
  const b64 = (v) => (v ? Buffer.from(v, "base64").toString() : Buffer.from(v).toString());

// --- SSE hog-up ---
let clients = new Set();
function sseSend(res, payload) {
  res.write(`event: message\n`)
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}
function manifest() {  return {
    type: "manifest",
    name: "Railway MCP Bridge",
    version: "0.2.0",
    tools: [
      {
        name: "ping",
        description: "Health check; returns pong.",
        input_schema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "discord.sendMessage",
        description: "Send a message to a Discord channel (guarded by ALLOW_WRITES env flag).",
        input_schema: { type: "object", required: ["channel_id","content"], properties: { channel_id: { type: "string", description: "Target channel ID" }, content: { type: "string", description: "Message content" } }, additionalProperties: false }
      },
      { name: "github.getUser", description: "Get the authenticated GitHub user profile.", input_schema: { type: "object", properties: {}, additionalProperties: false } },      { name: "railway.listProjects", description: "List your Railway projects (GraphQL).",  input_schema: { type: "object", properties: {}, additionalProperties: false } ] }
}