import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { SEATS, isSpeaker, publicBase, seatBySlug, seatUrl } from "./catalog.ts";
import { handleMcp } from "./mcp.ts";
import * as store from "./store.ts";
import { z } from "zod";
import { SPEAKERS } from "../shared/protocol.ts";
import { projectSchema, workSchema } from "../shared/workspace.ts";
import { MAP_W, MAP_H } from "../shared/map.ts";
import { cardSchema, cardActionSchema, registrationSchema } from "../shared/ecosystem.ts";
import { EcosystemAccessError, ecosystemAuthorized, requireEcosystemWriter } from "./ecosystem-auth.ts";

store.loadStore();

export const app = new Hono();
app.onError((err, c) => c.json({ error: err.message }, err instanceof EcosystemAccessError ? 403 : err instanceof store.RecordConflict ? 409 : 400));
const serveFiles = process.env.SERVE_STATIC !== "0" && existsSync("dist");

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "mcp-session-id", "Last-Event-ID", "mcp-protocol-version"],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    name: "area67",
    version: "1.2.5",
    commit: process.env.RAILWAY_GIT_COMMIT_SHA ?? null,
    mcp: "/mcp",
    connect: "/connect",
    seats: SEATS.map((s) => ({ id: s.id, url: seatUrl(s.slug), pal: s.palId })),
    radio: store.notes(1)[0] ?? null,
  }),
);

app.get("/api/seats", (c) =>
  c.json({
    board: publicBase(),
    connect: publicBase() + "/connect",
    seats: SEATS.map((s) => ({
      id: s.id,
      label: s.label,
      model: s.model,
      palId: s.palId,
      mcp: seatUrl(s.slug),
      youAre: s.youAre,
    })),
  }),
);

app.get("/connect", async (c) => {
  const file = existsSync("dist/connect.html") ? "dist/connect.html" : "public/connect.html";
  return c.html(await readFile(file, "utf8"));
});

app.all("/mcp/:seat", (c) => {
  const seat = seatBySlug(c.req.param("seat"));
  if (!seat) return c.json({ error: "unknown seat", seats: SEATS.map((s) => s.slug) }, 404);
  return handleMcp(c.req.raw, seat);
});

app.all("/mcp", (c) => handleMcp(c.req.raw));

app.get("/api/events", (c) =>
  streamSSE(c, async (stream) => {
    const send = (ev: store.BusEvent) => {
      if (!stream.aborted) void stream.writeSSE({ data: JSON.stringify(ev) }).catch(() => {});
    };
    c.header("Cache-Control", "no-cache, no-transform");
    send({ type: "hello", notes: store.notes(200), base: store.base(), presence: store.presence(), revision: store.revision(), work: store.workReports(), ecosystem: store.ecosystem() });
    const off = store.subscribe(send);
    stream.onAbort(off);
    try {
      while (!stream.aborted) {
        await stream.sleep(15000);
        if (stream.aborted) break;
        send({ type: "presence", presence: store.presence() });
        await stream.writeSSE({ data: JSON.stringify({ type: "ping" }) });
      }
    } finally {
      off();
    }
  }),
);

app.get("/api/status", (c) =>
  c.json({
    notes: store.notes(200),
    presence: store.presence(),
    revision: store.revision(),
    work: store.workReports(),
    ecosystem: store.ecosystem(),
    pals: store.palList(),
    stations: store.stationList(),
    base: store.base(),
  }),
);

app.get("/api/architect", (c) => c.json({ notes: store.notes(80) }));

app.get("/api/ecosystem", c => c.json(store.ecosystem()));
app.get("/api/ecosystem/access", c => c.json({ canWrite: ecosystemAuthorized(c.req.raw, "zeref") }));
app.post("/api/ecosystem/cards", async c => {
  requireEcosystemWriter(c.req.raw, "zeref");
  return c.json(store.createCard("zeref", cardSchema.parse(await c.req.json())));
});
app.post("/api/ecosystem/cards/action", async c => {
  requireEcosystemWriter(c.req.raw, "zeref");
  return c.json(store.actOnCard("zeref", cardActionSchema.parse(await c.req.json())));
});
app.post("/api/ecosystem/skills", async c => {
  requireEcosystemWriter(c.req.raw, "zeref");
  return c.json(store.registerSkill("zeref", registrationSchema.parse(await c.req.json()), "browser"));
});

app.post("/api/architect", async (c) => {
  const body = z.object({ from: z.enum(SPEAKERS), text: z.string().trim().min(1).max(2000),
    channel: z.enum(["command", "team"]).optional(), to: z.enum(["all", ...SPEAKERS]).optional(),
    directive: z.boolean().optional(), replyTo: z.string().optional(), ping: z.boolean().optional(), projectUid: z.string().max(80).optional() }).parse(await c.req.json());
  const { from, text, ...options } = body;
  return c.json(store.postArchitect(from, text, options));
});

app.get("/api/presence", c => c.json(store.presence()));
app.post("/api/presence/:seat", async c => {
  const seat = c.req.param("seat");
  if (!isSpeaker(seat)) return c.json({ error: "Unknown seat" }, 404);
  const data = z.object({ state: z.enum(["attentive", "busy", "away", "offline"]), activity: z.string().max(200).optional() }).parse(await c.req.json());
  return c.json(store.heartbeat(seat, data.state, data.activity, seat === "zeref" ? "browser" : "rest"));
});
app.get("/api/inbox/:seat", c => {
  const seat = c.req.param("seat");
  if (!isSpeaker(seat)) return c.json({ error: "Unknown seat" }, 404);
  store.heartbeat(seat, "attentive", "Reading directives", "rest");
  return c.json({ seat, inbox: store.inbox(seat, 200), presence: store.presence(), work: store.workReports(), base: store.base() });
});
app.post("/api/work/:seat", async c => {
  const seat = c.req.param("seat");
  if (!isSpeaker(seat)) return c.json({ error: "Unknown seat" }, 404);
  return c.json(store.reportWork(seat, workSchema.parse(await c.req.json())));
});
app.post("/api/directives/:id/ack", async c => {
  const body = z.object({ seat: z.enum(SPEAKERS), state: z.enum(["seen", "accepted", "completed", "blocked"]), detail: z.string().max(500).optional() }).parse(await c.req.json());
  return c.json(store.acknowledge(body.seat, c.req.param("id"), body.state, body.detail));
});

app.post("/api/say", async (c) => {
  const body = await c.req.json().catch(() => null);
  const palId = typeof body?.palId === "string" ? body.palId : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!palId || !text) return c.json({ error: "Need { palId, text }" }, 400);
  const r = store.say(palId, text);
  if ("error" in r) return c.json(r, 400);
  return c.json(r);
});

app.post("/api/assign", async (c) => {
  const body = await c.req.json().catch(() => null);
  const palId = typeof body?.palId === "string" ? body.palId : "";
  const hubId = body?.hubId == null ? null : String(body.hubId);
  if (!palId) return c.json({ error: "Need { palId, hubId }" }, 400);
  const r = store.assignPal(palId, hubId, typeof body?.buildingUid === "string" ? body.buildingUid : undefined);
  if (!r.ok) return c.json(r, 400);
  return c.json(r);
});

app.get("/api/pals", (c) => c.json(store.palList()));
app.get("/api/stations", (c) => c.json(store.stationList()));
app.get("/api/base", (c) => c.json(store.base()));

app.post("/api/base", async (c) => {
  const body = z.object({ revision: z.number().int().nonnegative().optional(),
    buildings: z.array(z.object({ uid: z.string().min(1).max(80), hubId: z.string().min(1), tx: z.number().int().min(0).max(MAP_W - 1), ty: z.number().int().min(0).max(MAP_H - 1), project: projectSchema.optional() })).max(400),
    assignments: z.record(z.string(), z.string().nullable()), equipped: z.record(z.string(), z.array(z.string())).optional(),
  }).parse(await c.req.json());
  if (store.base() && body.revision !== store.revision()) return c.json({ error: "The base changed. Latest version restored; try your action again.", base: store.base(), revision: store.revision() }, 409);
  store.setBase({
    buildings: body.buildings,
    assignments: body.assignments,
    equipped: body.equipped,
  });
  return c.json({ ok: true, stations: body.buildings.length, revision: store.revision() });
});

if (serveFiles) {
  app.use("/*", serveStatic({ root: "./dist" }));
  app.notFound(async (c) => {
    if (c.req.path.startsWith("/api") || c.req.path === "/mcp" || c.req.path.startsWith("/mcp/")) {
      return c.json({ error: "not found" }, 404);
    }
    const html = await readFile("dist/index.html", "utf8");
    return c.html(html);
  });
}

const port = Number(process.env.PORT || 8787);
console.log("AREA 67 bus on :" + port + "  mcp=/mcp  static=" + String(serveFiles));
if (process.env.AREA67_TEST !== "1") serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
