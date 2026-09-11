import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseSnapshot } from "./data";
import { HANDOFF_SCHEMA, createPacket, routeIntent } from "./handoff";
import { renderActionQueue } from "./render";

describe("Area 67 routing and packets", () => {
  it("routes cheap work without protected quota", () => {
    expect(routeIntent("small_feature")).toEqual({
      owner: "cursor:composer_2_5",
      quotaGuard: "PASS: standard or capability-owned route",
    });
  });

  it("flags protected-model escalation", () => {
    expect(routeIntent("scary_refactor")).toEqual({
      owner: "cursor:opus_5 -> cursor:fable_5_1",
      quotaGuard: "ESCALATED: confirm complexity before spending protected model quota",
    });
  });

  it("creates a private, attributable, versioned packet", () => {
    const packet = createPacket({
      intent: "normal_feature",
      contract: "job_spec",
      source: "jorge:area67",
      payload: {
        goal: "Bridge this task",
        constraints: "No secrets",
        stack: "Vite",
        done_when: "Tests pass",
        owner_model: "cursor:grok_4_6",
      },
    });

    expect(packet.schema).toBe(HANDOFF_SCHEMA);
    expect(packet.task_id.length).toBeGreaterThan(8);
    expect(packet.status).toBe("READY");
    expect(packet.privacy).toBe("private_device_only");
    expect(packet.provenance.public_sync).toBe(false);
    expect(packet.audit).toMatchObject({ approved_by: null, revision: 1 });
  });

  it("rejects incomplete handoff contracts", () => {
    expect(() => createPacket({
      intent: "small_feature",
      contract: "file_map",
      source: "jorge:area67",
      payload: { paths: "src", touch_list: "", do_not_break: "production" },
    })).toThrow("Missing required fields: touch_list");
  });
});

describe("live ledger adaptation", () => {
  it("surfaces row-oriented pending work and walls missing approval", () => {
    const data = parseSnapshot(
      "bot_or_item,owner,approve_status,approved_by,next_step,updated_et,notes\nPrivate bridge,Engineer,pending,,await Jorge GO,2026-09-05,Keep private",
      "snapshot",
    );
    const html = renderActionQueue(data);

    expect(html).toContain("1 pending");
    expect(html).toContain("WALLED · APPROVAL");
    expect(html).toContain("Private bridge");
    expect(html).toContain("Keep private");
  });

  it("escapes ledger values before rendering", () => {
    const data = parseSnapshot(
      "bot_or_item,owner,approve_status,next_step\n<script>alert(1)</script>,Engineer,pending,wait",
      "snapshot",
    );
    const html = renderActionQueue(data);

    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("public machine boundary", () => {
  it("publishes only public discovery metadata", () => {
    const discovery = JSON.parse(readFileSync("public/.well-known/area-67.json", "utf8")) as {
      privacy: { classification: string; operational_packets_published: boolean };
      capabilities: Record<string, string>;
    };

    expect(discovery.privacy.classification).toBe("public_capability_metadata_only");
    expect(discovery.privacy.operational_packets_published).toBe(false);
    expect(discovery.capabilities.private_cross_device_sync).toBe("walled");
  });

  it("keeps all public JSON artifacts parseable", () => {
    for (const path of [
      "public/area-67/efficiency-guide.json",
      "public/area-67/handoff.schema.json",
      "public/area-67/roadmap.json",
    ]) {
      expect(() => JSON.parse(readFileSync(path, "utf8"))).not.toThrow();
    }
  });
});
