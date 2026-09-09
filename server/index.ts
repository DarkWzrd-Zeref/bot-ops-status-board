import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { streamSSE } from "hono/streaming";
import { SEATS, isSpeaker, publicBase, seatBySlug, seatUrl, type Speaker } from "./catalog.ts";
import { handleMcp } from "./mcp.ts";
import * as store from "./store.ts";

store.loadStore();

const app = new Hono();
const serveFiles = process.env.SERVE_STATIC !== "0" && existsSync("dist");

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "mcp-session-id", "Last-Event-ID", "mcp-protocol-version"],
    exposeHeaders: ["mcp-session-id", "mcp-protocol-version"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    name: "area67",
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
      void stream.writeSSE({ data: JSON.stringify(ev) });
    };
    send({ type: "hello", notes: store.notes(40), base: store.base() });
    const off = store.subscribe(send);
    try {
      while (true) {
        await stream.sleep(20000);
        await stream.writeSSE({ data: JSON.stringify({ type: "ping" }) });
      }
    } finally {
      off();
    }
  }),
);

app.get("/api/status", (c) =>
  c.json({
    notes: store.notes(40),
    pals: store.palList(),
    stations: store.stationList(),
    base: store.base(),
  }),
);

app.get("/api/architect", (c) => c.json({ notes: store.notes(80) }));

app.post("/api/architect", async (c) => {
  const body = await c.req.json().catch(() => null);
  const from = typeof body?.from === "string" ? body.from : "";
  const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!isSpeaker(from) || !text) {
    return c.json({ error: "Need { from: claude|grok|grok-a|grok-b|chatgpt|grok-heavy|zeref, text }" }, 400);
  }
  return c.json(store.postArchitect(from as Speaker, text));
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
  const r = store.assignPal(palId, hubId);
  if (!r.ok) return c.json(r, 400);
  return c.json(r);
});

app.get("/api/pals", (c) => c.json(store.palList()));
app.get("/api/stations", (c) => c.json(store.stationList()));
app.get("/api/base", (c) => c.json(store.base()));

app.post("/api/base", async (c) => {
  const body = (await c.req.json().catch(() => null)) as store.BaseSnapshot | null;
  if (!body || !Array.isArray(body.buildings) || !body.assignments || typeof body.assignments !== "object") {
    return c.json({ error: "Need { buildings, assignments }" }, 400);
  }
  store.setBase({
    buildings: body.buildings,
    assignments: body.assignments,
    equipped: body.equipped,
  });
  return c.json({ ok: true, stations: body.buildings.length });
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
serve({ fetch: app.fetch, port, hostname: "0.0.0.0" });
