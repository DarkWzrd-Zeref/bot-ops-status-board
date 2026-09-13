import { createMcpHandler } from "agents/mcp/server";
import { authorizeRequest, type SecretBindings } from "./auth";
import {
  STATUSES,
  createStoredPacket,
  packetInputSchema,
  transitionSchema,
  type JobStatus,
} from "./domain";
import { JobRepository } from "./repository";
import { createArea67Server } from "./server";

type RuntimeEnv = Cloudflare.Env & SecretBindings;

function corsHeaders(request: Request, env: RuntimeEnv): HeadersInit {
  const origin = request.headers.get("Origin");
  if (origin !== env.HUB_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function json(request: Request, env: RuntimeEnv, value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: corsHeaders(request, env) });
}

function errorResponse(request: Request, env: RuntimeEnv, error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unknown Area 67 service error.";
  const status = /not found/i.test(message) ? 404 : /version conflict/i.test(message) ? 409 : 400;
  console.error(JSON.stringify({ event: "request_error", status, message }));
  return json(request, env, { error: message }, status);
}

async function readJson(request: Request): Promise<unknown> {
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (declared > 70_000) throw new Error("Request exceeds Area 67 packet limit.");
  return request.json();
}

async function handleApi(
  request: Request,
  env: RuntimeEnv,
  repository: JobRepository,
  ownerId: string,
): Promise<Response> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/handoffs\/([^/]+)$/);

  if (request.method === "POST" && url.pathname === "/api/handoffs") {
    const input = packetInputSchema.parse(await readJson(request));
    const packet = createStoredPacket(input, ownerId);
    return json(request, env, await repository.create(packet, input.source), 201);
  }
  if (request.method === "GET" && url.pathname === "/api/handoffs") {
    const rawStatus = url.searchParams.get("status");
    const status = rawStatus && STATUSES.includes(rawStatus as JobStatus) ? rawStatus as JobStatus : undefined;
    if (rawStatus && !status) throw new Error("Unknown handoff status.");
    const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") ?? "25") || 25));
    return json(request, env, { packets: await repository.list(status, limit), owner_id: ownerId });
  }
  if (request.method === "GET" && match) {
    const packet = await repository.get(decodeURIComponent(match[1] ?? ""));
    if (!packet) throw new Error("Task not found.");
    return json(request, env, packet);
  }
  if (request.method === "PATCH" && match) {
    const body = await readJson(request);
    const input = transitionSchema.parse({
      ...(typeof body === "object" && body ? body : {}),
      task_id: decodeURIComponent(match[1] ?? ""),
    });
    return json(request, env, await repository.transition({
      taskId: input.task_id,
      toStatus: input.to_status,
      expectedVersion: input.expected_version,
      actor: input.actor,
      note: input.note,
    }));
  }
  return json(request, env, { error: "Not found." }, 404);
}

export default {
  async fetch(request: Request, env: RuntimeEnv, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      const origin = request.headers.get("Origin");
      return new Response(null, {
        status: origin === env.HUB_ORIGIN ? 204 : 403,
        headers: corsHeaders(request, env),
      });
    }
    if (request.method === "GET" && url.pathname === "/health") {
      return json(request, env, {
        service: "area67-private-mcp",
        status: "ok",
        storage: "d1",
        authentication: "required",
        oauth: "walled_pending_identity_choice",
      });
    }

    const principal = await authorizeRequest(request, env);
    if (!principal) return json(request, env, { error: "Unauthorized." }, 401);
    const repository = new JobRepository(env.DB, principal.ownerId);

    try {
      if (url.pathname === "/mcp") {
        return createMcpHandler(
          () => createArea67Server(repository, principal.ownerId),
          {
            route: "/mcp",
            legacy: "reject",
            corsOptions: { origin: env.HUB_ORIGIN },
          },
        )(request, env, ctx);
      }
      if (url.pathname.startsWith("/api/")) {
        return await handleApi(request, env, repository, principal.ownerId);
      }
      return json(request, env, {
        service: "Area 67 private bridge",
        mcp: "/mcp",
        api: "/api/handoffs",
        health: "/health",
      });
    } catch (error) {
      return errorResponse(request, env, error);
    }
  },
} satisfies ExportedHandler<RuntimeEnv>;
