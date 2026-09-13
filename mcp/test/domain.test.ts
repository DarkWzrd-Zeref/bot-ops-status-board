import { describe, expect, it } from "vitest";
import {
  canTransition,
  containsLikelySecret,
  createStoredPacket,
  packetInputSchema,
  routeJob,
  validatePacketInput,
  type PacketInput,
} from "../src/domain";

const validInput = (overrides: Partial<PacketInput> = {}): PacketInput => ({
  parent_id: null,
  source: "jorge:area67",
  intent: "normal_feature",
  contract_type: "job_spec",
  payload: {
    goal: "Create a private bridge",
    constraints: "Do not publish task content",
    stack: "Cloudflare Worker and D1",
    done_when: "The lifecycle is tested",
    owner_model: "cursor:grok_4_6",
  },
  ...overrides,
});

describe("Area 67 private service domain", () => {
  it("routes ordinary and protected work through the quota policy", () => {
    expect(routeJob("normal_feature")).toEqual({
      owner: "cursor:grok_4_6 -> claude:opus_5 review",
      quota_guard: "PASS: standard or capability-owned route",
    });
    expect(routeJob("scary_refactor").quota_guard).toMatch(/^ESCALATED/);
  });

  it("requires every field in the selected contract", () => {
    expect(() => validatePacketInput(validInput({
      payload: { ...validInput().payload, done_when: "" },
    }))).toThrow("Missing required fields: done_when");
  });

  it("rejects likely credentials before storage", () => {
    expect(containsLikelySecret("password=hunter2-private")).toBe(true);
    expect(() => validatePacketInput(validInput({
      payload: { ...validInput().payload, constraints: "api_key=sk-private-value-123456" },
    }))).toThrow("Packet rejected by privacy guard");
  });

  it("accepts only declared packet properties", () => {
    expect(() => packetInputSchema.parse({
      ...validInput(),
      public_sync: true,
    })).toThrow();
  });

  it("enforces the lifecycle graph", () => {
    expect(canTransition("READY", "CLAIMED")).toBe(true);
    expect(canTransition("READY", "DONE")).toBe(false);
    expect(canTransition("REVIEW", "DONE")).toBe(true);
    expect(canTransition("DONE", "WORKING")).toBe(false);
  });

  it("creates owner-scoped packets with no public sync", () => {
    const packet = createStoredPacket(validInput(), "jorge");
    expect(packet.task_id.length).toBeGreaterThan(20);
    expect(packet.status).toBe("READY");
    expect(packet.privacy).toBe("private_authenticated");
    expect(packet.provenance).toMatchObject({ owner_id: "jorge", public_sync: false });
    expect(packet.audit.validation).toContain("secret_scan");
  });

  it("preserves a client UUID when promoting a local packet", () => {
    const clientTaskId = "8ea484d8-e224-4e80-a1a4-9dabc57579e8";
    const packet = createStoredPacket(validInput({ client_task_id: clientTaskId }), "jorge");
    expect(packet.task_id).toBe(clientTaskId);
  });
});
