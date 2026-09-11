import { z } from "zod";

export const STATUSES = ["READY", "CLAIMED", "WORKING", "REVIEW", "BLOCKED", "DONE"] as const;
export const CONTRACTS = ["job_spec", "file_map", "diff", "asset_brief", "ship_packet"] as const;

export const contractFields = {
  job_spec: ["goal", "constraints", "stack", "done_when", "owner_model"],
  file_map: ["paths", "touch_list", "do_not_break"],
  diff: ["pr", "tests", "risks"],
  asset_brief: ["still_prompt", "motion_prompt", "refs"],
  ship_packet: ["pr_url", "exports", "launch_copy"],
} as const;

export const packetInputSchema = z.object({
  parent_id: z.string().min(8).max(100).nullable().optional(),
  source: z.string().min(1).max(120),
  intent: z.string().min(1).max(80),
  contract_type: z.enum(CONTRACTS),
  payload: z.record(z.string(), z.string().max(20_000)),
}).strict();

export const transitionSchema = z.object({
  task_id: z.string().min(8).max(100),
  to_status: z.enum(STATUSES),
  expected_version: z.number().int().positive(),
  actor: z.string().min(1).max(120),
  note: z.string().max(2_000).optional(),
}).strict();

export type PacketInput = z.infer<typeof packetInputSchema>;
export type JobStatus = (typeof STATUSES)[number];

export interface StoredPacket {
  schema: "area67.handoff.v1";
  task_id: string;
  parent_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  status: JobStatus;
  privacy: "private_authenticated";
  source: string;
  route: {
    intent: string;
    owner: string;
    quota_guard: string;
  };
  contract: {
    type: (typeof CONTRACTS)[number];
    payload: Record<string, string>;
  };
  provenance: {
    created_by: "area_67_mcp";
    owner_id: string;
    context_scope: "task_only";
    public_sync: false;
  };
  audit: {
    validation: string[];
    approved_by: string | null;
    revision: number;
  };
}

const routes: Record<string, string> = {
  small_feature: "cursor:composer_2_5",
  normal_feature: "cursor:grok_4_6 -> claude:opus_5 review",
  scary_refactor: "cursor:opus_5 -> cursor:fable_5_1",
  overnight_repo_agent: "chatgpt:codex+sol | grok:bot",
  need_n_hypotheses: "grok:heavy_multiagent",
  drive_browser_os: "chatgpt:gpt6_astra",
  thumbnail_still: "grok:imagine_image",
  short_clip: "grok:imagine_video",
  cinematic_sora: "chatgpt:sora after imagine draft",
  long_spec: "claude:opus_5",
  live_x_news: "grok:4_6",
};

export function routeJob(intent: string): { owner: string; quota_guard: string } {
  const owner = routes[intent] ?? "claude:opus_5 -> cursor:grok_4_6";
  const protectedModel = /fable|astra|gpt56_sol/.test(owner);
  return {
    owner,
    quota_guard: protectedModel
      ? "ESCALATED: confirm complexity before spending protected model quota"
      : "PASS: standard or capability-owned route",
  };
}

export function validatePacketInput(input: PacketInput): string[] {
  const required = contractFields[input.contract_type];
  const missing = required.filter((field) => !(input.payload[field] ?? "").trim());
  if (missing.length) throw new Error(`Missing required fields: ${missing.join(", ")}`);
  const serialized = JSON.stringify(input);
  if (serialized.length > 64_000) throw new Error("Packet exceeds the 64 KB private handoff limit.");
  if (containsLikelySecret(serialized)) {
    throw new Error("Packet rejected by privacy guard: remove credentials, tokens, passwords, or private keys.");
  }
  return ["schema", "required_fields", "payload_size", "secret_scan", "owner_boundary"];
}

export function containsLikelySecret(value: string): boolean {
  return /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_-]?key|password|secret|access[_-]?token)\s*[:=]\s*\S+|bearer\s+[a-z0-9._-]{12,}|sk-[a-z0-9_-]{12,})/i.test(value);
}

const transitions: Record<JobStatus, readonly JobStatus[]> = {
  READY: ["CLAIMED", "BLOCKED"],
  CLAIMED: ["WORKING", "BLOCKED"],
  WORKING: ["REVIEW", "BLOCKED"],
  REVIEW: ["WORKING", "DONE", "BLOCKED"],
  BLOCKED: ["READY", "WORKING"],
  DONE: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return transitions[from].includes(to);
}

export function createStoredPacket(input: PacketInput, ownerId: string): StoredPacket {
  const validation = validatePacketInput(input);
  const now = new Date().toISOString();
  return {
    schema: "area67.handoff.v1",
    task_id: crypto.randomUUID(),
    parent_id: input.parent_id ?? null,
    version: 1,
    created_at: now,
    updated_at: now,
    status: "READY",
    privacy: "private_authenticated",
    source: input.source,
    route: { intent: input.intent, ...routeJob(input.intent) },
    contract: { type: input.contract_type, payload: input.payload },
    provenance: {
      created_by: "area_67_mcp",
      owner_id: ownerId,
      context_scope: "task_only",
      public_sync: false,
    },
    audit: { validation, approved_by: null, revision: 1 },
  };
}
