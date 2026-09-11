import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  CONTRACTS,
  STATUSES,
  createStoredPacket,
  packetInputSchema,
  routeJob,
  transitionSchema,
} from "./domain";
import { JobRepository } from "./repository";

const jsonResult = (value: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  structuredContent: value as Record<string, unknown>,
});

const errorResult = (error: unknown) => ({
  content: [{
    type: "text" as const,
    text: error instanceof Error ? error.message : "Unknown Area 67 service error.",
  }],
  isError: true,
});

export function createArea67Server(repository: JobRepository, ownerId: string): McpServer {
  const server = new McpServer({
    name: "area67-private-bridge",
    version: "0.1.0",
  });

  server.registerTool(
    "route_job",
    {
      description: "Choose the Area 67 surface and model for a task intent without storing task content.",
      inputSchema: { intent: z.string().min(1).max(80) },
    },
    async ({ intent }) => jsonResult({ intent, ...routeJob(intent) }),
  );

  server.registerTool(
    "quota_guard",
    {
      description: "Check whether a routed task spends a protected model pool.",
      inputSchema: { intent: z.string().min(1).max(80) },
    },
    async ({ intent }) => jsonResult({ intent, ...routeJob(intent) }),
  );

  server.registerTool(
    "create_handoff",
    {
      description: "Validate and store one private, owner-scoped handoff packet.",
      inputSchema: {
        parent_id: z.string().min(8).max(100).nullable().optional(),
        source: z.string().min(1).max(120),
        intent: z.string().min(1).max(80),
        contract_type: z.enum(CONTRACTS),
        payload: z.record(z.string(), z.string().max(20_000)),
      },
    },
    async (value) => {
      try {
        const input = packetInputSchema.parse(value);
        const packet = createStoredPacket(input, ownerId);
        return jsonResult(await repository.create(packet, input.source));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "get_handoff",
    {
      description: "Get one private handoff packet by durable task ID.",
      inputSchema: { task_id: z.string().min(8).max(100) },
    },
    async ({ task_id }) => {
      const packet = await repository.get(task_id);
      return packet ? jsonResult(packet) : errorResult(new Error("Task not found."));
    },
  );

  server.registerTool(
    "list_inbox",
    {
      description: "List the authenticated owner's private inbox/outbox packets.",
      inputSchema: {
        status: z.enum(STATUSES).optional(),
        limit: z.number().int().min(1).max(100).default(25),
      },
    },
    async ({ status, limit }) => jsonResult({
      packets: await repository.list(status, limit),
      owner_id: ownerId,
    }),
  );

  server.registerTool(
    "transition_handoff",
    {
      description: "Move a packet through the enforced lifecycle using optimistic version control.",
      inputSchema: {
        task_id: z.string().min(8).max(100),
        to_status: z.enum(STATUSES),
        expected_version: z.number().int().positive(),
        actor: z.string().min(1).max(120),
        note: z.string().max(2_000).optional(),
      },
    },
    async (value) => {
      try {
        const input = transitionSchema.parse(value);
        return jsonResult(await repository.transition({
          taskId: input.task_id,
          toStatus: input.to_status,
          expectedVersion: input.expected_version,
          actor: input.actor,
          note: input.note,
        }));
      } catch (error) {
        return errorResult(error);
      }
    },
  );

  server.registerTool(
    "pass_context",
    {
      description: "Return only the selected contract, route, and provenance for the next brain.",
      inputSchema: { task_id: z.string().min(8).max(100) },
    },
    async ({ task_id }) => {
      const packet = await repository.get(task_id);
      if (!packet) return errorResult(new Error("Task not found."));
      return jsonResult({
        schema: packet.schema,
        task_id: packet.task_id,
        parent_id: packet.parent_id,
        version: packet.version,
        status: packet.status,
        route: packet.route,
        contract: packet.contract,
        provenance: packet.provenance,
      });
    },
  );

  return server;
}
