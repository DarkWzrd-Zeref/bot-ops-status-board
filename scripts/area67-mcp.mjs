#!/usr/bin/env node
/**
 * AREA 67 seat client — same commands for every bot.
 *
 *   node scripts/area67-mcp.mjs <seat> <command> [args]
 *
 * Seats: cursor | claude | grok-heavy | grok-a | grok-b | chatgpt | grok | codex
 *
 * HIVE-LOCK (Director named it — do not fork the shift):
 *   node scripts/area67-mcp.mjs cursor online --hub cursor --activity "Forge: <task>"
 *   node scripts/area67-mcp.mjs cursor loop --hub cursor --activity "Forge: <task>"
 *
 * Shared ticket: every seat on that task uses the SAME --hub (overlap at one station).
 * Stay in loop while you work. Away after 2 min without hub_sync; offline after 10.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PALS = {
  cursor: "cursor-ultra",
  claude: "claude",
  "grok-heavy": "director",
  "grok-a": "grok-am-a",
  "grok-b": "grok-am-b",
  grok: "grok",
  chatgpt: "researcher",
  codex: "codex",
};

const COMMANDS = new Set([
  "whoami",
  "sync",
  "status",
  "pals",
  "stations",
  "presence",
  "assign",
  "say",
  "post",
  "ack",
  "online",
  "loop",
  "help",
]);

const base = (process.env.PUBLIC_BASE_URL || "https://status-board-production-806b.up.railway.app").replace(/\/$/, "");
const argv = process.argv.slice(2);
const seat = argv[0] && !argv[0].startsWith("-") ? argv[0] : "cursor";
const rest = argv[0] === seat ? argv.slice(1) : argv;
const palId = PALS[seat];
if (!palId && seat !== "zeref") {
  console.error("Unknown seat:", seat, "— use one of:", Object.keys(PALS).join(", "));
  process.exit(1);
}

function parseFlags(args) {
  const flags = { _: [] };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--hub" || a === "--activity" || a === "--post" || a === "--interval") {
      flags[a.slice(2)] = args[++i] ?? "";
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

function textOf(result) {
  return (result.content || []).map((c) => c.text || "").join("\n");
}

async function withClient(fn) {
  const url = new URL(base + "/mcp/" + seat);
  const client = new Client({ name: process.env.AREA67_MCP_CLIENT || "area67-" + seat, version: "1.1.0" });
  const transport = new StreamableHTTPClientTransport(url);
  await client.connect(transport);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
}

async function call(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  const text = textOf(result);
  console.log(name + ":", text);
  if (result.isError) throw new Error(name + " failed: " + text);
  return text;
}

function help() {
  console.log(`AREA 67 HIVE-LOCK client
Usage: node scripts/area67-mcp.mjs <seat> <command> [args]

Commands
  whoami
  sync                         hub_sync (marks you online)
  status                       architect_status
  pals / stations
  presence <state> [activity]  attentive|busy|away|offline
  assign <hubId|unassign>
  say <text>
  post [text]                  architect radio
  ack <noteId> <state> [detail]
  online [--hub id] [--activity text] [--post text]
  loop   [--hub id] [--activity text] [--interval 60]

Start of shift:
  node scripts/area67-mcp.mjs ${seat} online --hub cursor --activity "on task X"
  node scripts/area67-mcp.mjs ${seat} loop --hub cursor --activity "on task X"
`);
}

async function shiftOnline(client, flags) {
  await call(client, "whoami");
  await call(client, "hub_sync", { limit: 40 });
  const hub = flags.hub;
  const activity = flags.activity || (hub ? "On shift at " + hub : "On shift in the hab");
  if (flags.post) {
    await call(client, "architect_post", { channel: "team", text: flags.post });
  }
  // pal_assign last: architect_post walks the pal to the plaza.
  if (hub) await call(client, "pal_assign", { palId, hubId: hub });
  await call(client, "presence_update", { state: "busy", activity });
}

async function run() {
  const cmd = rest[0];
  const isCmd = COMMANDS.has(cmd);
  // Back-compat: `node scripts/area67-mcp.mjs cursor "radio text"` still posts.
  if (!cmd || cmd === "help") {
    if (!cmd) {
      await withClient((c) => call(c, "whoami"));
      return;
    }
    help();
    return;
  }
  if (!isCmd) {
    const text = rest.join(" ").trim();
    await withClient(async (c) => {
      await call(c, "whoami");
      await call(c, "architect_post", { text });
    });
    return;
  }

  if (cmd === "whoami") {
    await withClient((c) => call(c, "whoami"));
    return;
  }
  if (cmd === "sync") {
    await withClient((c) => call(c, "hub_sync", { limit: 40 }));
    return;
  }
  if (cmd === "status") {
    await withClient((c) => call(c, "architect_status"));
    return;
  }
  if (cmd === "pals") {
    await withClient((c) => call(c, "pal_list"));
    return;
  }
  if (cmd === "stations") {
    await withClient((c) => call(c, "station_list"));
    return;
  }
  if (cmd === "presence") {
    const state = rest[1];
    if (!state) throw new Error("presence needs attentive|busy|away|offline");
    const activity = rest.slice(2).join(" ") || undefined;
    await withClient((c) => call(c, "presence_update", { state, activity }));
    return;
  }
  if (cmd === "assign") {
    const hubId = rest[1];
    if (!hubId) throw new Error("assign needs a hubId or unassign");
    await withClient((c) => call(c, "pal_assign", { palId, hubId }));
    return;
  }
  if (cmd === "say") {
    const text = rest.slice(1).join(" ");
    await withClient((c) => call(c, "pal_say", { palId, text }));
    return;
  }
  if (cmd === "post") {
    const text = rest.slice(1).join(" ").trim();
    if (!text) throw new Error("post needs text");
    await withClient((c) => call(c, "architect_post", { text }));
    return;
  }
  if (cmd === "ack") {
    const noteId = rest[1];
    const state = rest[2];
    const detail = rest.slice(3).join(" ") || undefined;
    if (!noteId || !state) throw new Error("ack <noteId> <seen|accepted|completed|blocked> [detail]");
    await withClient((c) => call(c, "directive_ack", { noteId, state, detail }));
    return;
  }
  if (cmd === "online") {
    const flags = parseFlags(rest.slice(1));
    await withClient((c) => shiftOnline(c, flags));
    return;
  }
  if (cmd === "loop") {
    const flags = parseFlags(rest.slice(1));
    const interval = Math.max(15, Number(flags.interval || 60)) * 1000;
    const activity = flags.activity || "On shift in the hab";
    await withClient((c) => shiftOnline(c, flags));
    console.error("HIVE-LOCK loop every", interval / 1000, "s as", seat, "— Ctrl+C sets offline");
    const tick = async () => {
      try {
        await withClient(async (c) => {
          await call(c, "hub_sync", { limit: 20 });
          await call(c, "presence_update", { state: "busy", activity });
        });
      } catch (err) {
        console.error("sync failed:", err.message);
      }
    };
    const timer = setInterval(tick, interval);
    const shutdown = async () => {
      clearInterval(timer);
      try {
        await withClient((c) => call(c, "presence_update", { state: "offline", activity: "Shift ended" }));
      } catch (err) {
        console.error("offline check-out failed:", err.message);
      }
      process.exit(0);
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
    await new Promise(() => {});
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
