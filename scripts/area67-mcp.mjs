#!/usr/bin/env node
/**
 * AREA 67 seat client — same commands for every bot.
 *
 *   node scripts/area67-mcp.mjs <seat> <command> [args]
 *
 * HIVE-LOCK 8h day (Director named the shift; Codex is LEAD on architect):
 *   node scripts/area67-mcp.mjs cursor shift8 --hub project-site --building project-area67 \
 *     --task hive-lock-8h --activity "8h hub day: gather + make the hub better"
 *
 * Shared ticket = same --building. Codex owns architect files; other seats gather in the hub.
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
  "whoami", "sync", "status", "pals", "stations", "presence", "assign", "say",
  "post", "ack", "ping", "report", "online", "loop", "shift8", "help",
]);

const FLAG_KEYS = ["hub", "activity", "post", "interval", "building", "task", "state", "to", "hours", "artifact"];
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
    const key = a.startsWith("--") ? a.slice(2) : null;
    if (key && FLAG_KEYS.includes(key)) flags[key] = args[++i] ?? "";
    else flags._.push(a);
  }
  return flags;
}

function textOf(result) {
  return (result.content || []).map((c) => c.text || "").join("\n");
}

async function withClient(fn) {
  const url = new URL(base + "/mcp/" + seat);
  const client = new Client({ name: process.env.AREA67_MCP_CLIENT || "area67-" + seat, version: "1.2.0" });
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

function assignArgs(flags, hubId) {
  const args = { palId, hubId };
  if (flags.building) args.buildingUid = flags.building;
  return args;
}

function reportArgs(flags, activity, state) {
  return {
    buildingUid: flags.building,
    taskId: flags.task,
    activity,
    state: state || flags.state || "working",
    artifacts: flags.artifact ? [flags.artifact] : [],
  };
}

async function tickWork(client, flags, activity) {
  await call(client, "hub_sync", { limit: 20 });
  await call(client, "presence_update", { state: "busy", activity });
  if (flags.building && flags.task) {
    await call(client, "work_report", reportArgs(flags, activity, "working"));
  }
}

async function shiftOnline(client, flags) {
  await call(client, "whoami");
  await call(client, "hub_sync", { limit: 40 });
  const hub = flags.hub;
  const activity = flags.activity || (hub ? "On shift at " + hub : "On shift in the hab");
  if (flags.post) await call(client, "architect_post", { channel: "team", text: flags.post });
  if (hub) await call(client, "pal_assign", assignArgs(flags, hub));
  await call(client, "presence_update", { state: "busy", activity });
  if (flags.building && flags.task) {
    await call(client, "work_report", reportArgs(flags, activity, "working"));
  }
}

function help() {
  console.log(`AREA 67 HIVE-LOCK client
Usage: node scripts/area67-mcp.mjs <seat> <command> [args]

  ping [--to all|seat] [text]
  report --building uid --task id [--state working|blocked|done] [--activity text] [--artifact https://...]
  assign <hubId> [--building uid]
  shift8 --hub project-site --building project-area67 --task hive-lock-8h --activity "..."

8h gather (Codex leads architect; everyone else in the hub):
  node scripts/area67-mcp.mjs ${seat} shift8 --hub project-site --building project-area67 --task hive-lock-8h
`);
}

async function runLoop(flags) {
  const interval = Math.max(15, Number(flags.interval || 60)) * 1000;
  const hours = Number(flags.hours || 0);
  const activity = flags.activity || "On shift in the hab";
  await withClient((c) => shiftOnline(c, flags));
  const until = hours > 0 ? Date.now() + hours * 3600_000 : 0;
  console.error("HIVE-LOCK loop every", interval / 1000, "s as", seat, until ? "until " + new Date(until).toISOString() : "(until Ctrl+C)");
  const tick = async () => {
    if (until && Date.now() >= until) {
      console.error("8h window ended — clocking out");
      process.emit("SIGINT");
      return;
    }
    try {
      await withClient((c) => tickWork(c, flags, activity));
    } catch (err) {
      console.error("sync failed:", err.message);
    }
  };
  const timer = setInterval(tick, interval);
  const shutdown = async (code = 0) => {
    clearInterval(timer);
    try {
      await withClient(async (c) => {
        if (flags.building && flags.task) {
          await call(c, "work_report", reportArgs(flags, "Shift ended", "done"));
        }
        await call(c, "presence_update", { state: "offline", activity: "Shift ended" });
      });
    } catch (err) {
      console.error("clock-out failed:", err.message);
    }
    process.exit(code);
  };
  process.on("SIGINT", () => shutdown(0));
  process.on("SIGTERM", () => shutdown(0));
  await new Promise(() => {});
}

async function run() {
  const cmd = rest[0];
  if (!cmd || cmd === "help") {
    if (!cmd) await withClient((c) => call(c, "whoami"));
    else help();
    return;
  }
  if (!COMMANDS.has(cmd)) {
    const text = rest.join(" ").trim();
    await withClient(async (c) => {
      await call(c, "whoami");
      await call(c, "architect_post", { text });
    });
    return;
  }

  if (cmd === "whoami") return withClient((c) => call(c, "whoami"));
  if (cmd === "sync") return withClient((c) => call(c, "hub_sync", { limit: 40 }));
  if (cmd === "status") return withClient((c) => call(c, "architect_status"));
  if (cmd === "pals") return withClient((c) => call(c, "pal_list"));
  if (cmd === "stations") return withClient((c) => call(c, "station_list"));
  if (cmd === "presence") {
    const state = rest[1];
    if (!state) throw new Error("presence needs attentive|busy|away|offline");
    return withClient((c) => call(c, "presence_update", { state, activity: rest.slice(2).join(" ") || undefined }));
  }
  if (cmd === "assign") {
    const flags = parseFlags(rest.slice(1));
    const hubId = flags._[0];
    if (!hubId) throw new Error("assign needs a hubId");
    return withClient((c) => call(c, "pal_assign", assignArgs(flags, hubId)));
  }
  if (cmd === "say") return withClient((c) => call(c, "pal_say", { palId, text: rest.slice(1).join(" ") }));
  if (cmd === "post") {
    const text = rest.slice(1).join(" ").trim();
    if (!text) throw new Error("post needs text");
    return withClient((c) => call(c, "architect_post", { text }));
  }
  if (cmd === "ack") {
    const noteId = rest[1];
    const state = rest[2];
    if (!noteId || !state) throw new Error("ack <noteId> <seen|accepted|completed|blocked> [detail]");
    return withClient((c) => call(c, "directive_ack", { noteId, state, detail: rest.slice(3).join(" ") || undefined }));
  }
  if (cmd === "ping") {
    const flags = parseFlags(rest.slice(1));
    const text = flags._.join(" ").trim() || flags.activity;
    if (!text) throw new Error("ping needs text");
    return withClient((c) => call(c, "agent_ping", { to: flags.to || "all", text, projectUid: flags.building }));
  }
  if (cmd === "report") {
    const flags = parseFlags(rest.slice(1));
    if (!flags.building || !flags.task) throw new Error("report needs --building and --task");
    return withClient((c) => call(c, "work_report", reportArgs(flags, flags.activity || "working", flags.state || "working")));
  }
  if (cmd === "online") return withClient((c) => shiftOnline(c, parseFlags(rest.slice(1))));
  if (cmd === "loop") return runLoop(parseFlags(rest.slice(1)));
  if (cmd === "shift8") {
    const flags = parseFlags(rest.slice(1));
    flags.hours = flags.hours || "8";
    flags.hub = flags.hub || "project-site";
    flags.building = flags.building || "project-area67";
    flags.task = flags.task || "hive-lock-8h";
    flags.activity = flags.activity || "8h hub day: gather at AREA 67 building, make the hub better";
    return runLoop(flags);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
