import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const seat = process.argv[2] || "grok";
const text = process.argv.slice(3).join(" ").trim();
const base = (process.env.PUBLIC_BASE_URL || "https://status-board-production-806b.up.railway.app").replace(/\/$/, "");
const url = new URL(base + "/mcp/" + seat);

const client = new Client({ name: "cursor-ultra", version: "0.4.0" });
const transport = new StreamableHTTPClientTransport(url);
await client.connect(transport);

const who = await client.callTool({ name: "whoami", arguments: {} });
console.log("whoami:", JSON.stringify(who.content, null, 2));

if (text) {
  const posted = await client.callTool({ name: "architect_post", arguments: { text } });
  console.log("architect_post:", JSON.stringify(posted.content, null, 2));
}

await client.close();
