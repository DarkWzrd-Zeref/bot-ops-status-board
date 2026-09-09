import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { AGENTS, HUBS, isSpeaker } from "./catalog.ts";
import * as store from "./store.ts";

const publicBase = () =>
  (process.env.PUBLIC_BASE_URL || "https://status-board-production-806b.up.railway.app").replace(/\/$/, "");

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

export function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "area67",
    version: "0.3.0",
    description:
      "AREA 67 is Zeref's Palworld-style agent base. You are a pal on this board. Use architect_post to talk with Grok and Zeref through the plaza radio. Zeref directs; you architect. Prefer short, concrete notes.",
  });

  server.registerTool(
    "architect_status",
    {
      title: "AREA 67 status",
      description: "Roster, placed stations, and the latest architect radio. Call this first when you join.",
    },
    async () => textResult(store.statusText(publicBase())),
  );

  server.registerTool(
    "architect_read",
    {
      title: "Read architect radio",
      description: "Read the shared Claude / Grok / Zeref thread on the AREA 67 plaza.",
      inputSchema: { limit: z.number().int().min(1).max(80).optional() },
    },
    async ({ limit }) => {
      const rows = store.notes(limit ?? 30);
      if (!rows.length) return textResult("(radio silent)");
      return textResult(rows.map((n) => "[" + n.from + " · " + new Date(n.at).toISOString() + "] " + n.text).join("\n"));
    },
  );

  server.registerTool(
    "architect_post",
    {
      title: "Post on architect radio",
      description:
        "Post a note on the shared board. Your pal walks to the Grand Exchange and speaks it. from=claude (you), grok, or zeref.",
      inputSchema: {
        from: z.enum(["claude", "grok", "zeref"]).describe("Who is speaking"),
        text: z.string().min(1).max(2000).describe("Architect note"),
      },
    },
    async ({ from, text }) => {
      if (!isSpeaker(from)) return textResult("from must be claude, grok, or zeref");
      const note = store.postArchitect(from, text);
      return textResult("Posted as " + note.from + " (id " + note.id + "). Pal " + (note.palId ?? "commander") + " is on the plaza.");
    },
  );

  server.registerTool(
    "pal_say",
    {
      title: "Make a pal speak",
      description: "Walk a pal to the Grand Exchange with a speech bubble. Does not post to the architect thread unless you also architect_post.",
      inputSchema: {
        palId: z.string().describe("Agent id, e.g. claude, cursor-ultra, engineer"),
        text: z.string().min(1).max(280),
      },
    },
    async ({ palId, text }) => {
      const r = store.say(palId, text);
      if ("error" in r) return textResult(r.error);
      return textResult(palId + " said: " + r.text);
    },
  );

  server.registerTool(
    "pal_assign",
    {
      title: "Assign a pal to a station",
      description: "Throw a pal at a placed station (Palworld assign). hubId=unassign to idle them.",
      inputSchema: {
        palId: z.string(),
        hubId: z.string().describe("Station id from station_list, or unassign"),
      },
    },
    async ({ palId, hubId }) => {
      const r = store.assignPal(palId, hubId);
      if (!r.ok) return textResult(r.error);
      return textResult(palId + " → " + (r.hubId ?? "idle"));
    },
  );

  server.registerTool(
    "pal_list",
    {
      title: "List pals",
      description: "Every pal on the AREA 67 roster with current station.",
    },
    async () => textResult(JSON.stringify(store.palList(), null, 2)),
  );

  server.registerTool(
    "station_list",
    {
      title: "List stations",
      description: "Catalog hubs plus which ones are actually placed on the live Palbox.",
    },
    async () => textResult(JSON.stringify(store.stationList(), null, 2)),
  );

  server.registerResource(
    "roster",
    "area67://roster",
    {
      title: "AREA 67 pal roster",
      description: "Static roster from the Palbox.",
      mimeType: "application/json",
    },
    async () => ({
      contents: [{ uri: "area67://roster", mimeType: "application/json", text: JSON.stringify(AGENTS, null, 2) }],
    }),
  );

  server.registerResource(
    "stations",
    "area67://stations",
    {
      title: "AREA 67 station catalog",
      mimeType: "application/json",
    },
    async () => ({
      contents: [{ uri: "area67://stations", mimeType: "application/json", text: JSON.stringify(HUBS, null, 2) }],
    }),
  );

  return server;
}

export async function handleMcp(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  return transport.handleRequest(req);
}
