import { normalizeKey } from "./data";

export type FieldKind = "text" | "url" | "approve" | "live" | "flag" | "money" | "queue";

export interface Field {
  key: string;
  label: string;
  kind?: FieldKind;
  aliases?: string[];
}

export interface Section {
  id: string;
  title: string;
  subtitle: string;
  rule?: string;
  fields: Field[];
}

export const SECTIONS: Section[] = [
  {
    id: "police",
    title: "Police",
    subtitle: "Guardrails on every bot",
    fields: [
      { key: "mcp_first", label: "MCP-first", aliases: ["mcp_first_status"] },
      { key: "no_clone", label: "No-clone", aliases: ["noclone", "no_cloning"] },
      { key: "model_tier", label: "Model tier", aliases: ["tier", "model"] },
      { key: "coding_handoff", label: "Coding handoff", aliases: ["code_handoff"] },
      { key: "waste_flags", label: "Waste flags", kind: "flag", aliases: ["waste", "waste_flag"] },
    ],
  },
  {
    id: "researcher",
    title: "Researcher",
    subtitle: "Proposals stay pending until approved",
    rule: "approve_status other than 'approved' renders as PENDING.",
    fields: [
      { key: "vision_board_url", label: "Vision board", kind: "url", aliases: ["vision_board"] },
      { key: "web_insight_url", label: "Web insight", kind: "url", aliases: ["web_insight"] },
      { key: "proposal_summary", label: "Proposal", aliases: ["proposal"] },
      { key: "approve_status", label: "Approval", kind: "approve", aliases: ["approval_status", "approved", "approval"] },
    ],
  },
  {
    id: "engineer",
    title: "Engineer",
    subtitle: "Board → Cloud → PR",
    fields: [
      { key: "boarding_packet", label: "Boarding packet" },
      { key: "cloud_agent_handoff", label: "Cloud agent handoff", aliases: ["cloud_handoff"] },
      { key: "pr_ci_pulse", label: "PR / CI pulse", aliases: ["ci_pulse", "pr_pulse"] },
      { key: "merge_ask", label: "Merge ask" },
      { key: "board_to_cloud_to_pr", label: "Board→Cloud→PR", aliases: ["board_cloud_pr"] },
      { key: "pulse_noise", label: "Pulse noise", kind: "flag" },
      { key: "mcp_or_gh_status", label: "MCP / GH status", aliases: ["mcp_gh_status", "mcp_status", "gh_status"] },
    ],
  },
  {
    id: "track",
    title: "Stay on Track",
    subtitle: "One LIVE book at a time · DONE = artifact",
    rule: "Exactly one row may be LIVE.",
    fields: [
      { key: "live_book", label: "LIVE book", aliases: ["book"] },
      { key: "live", label: "LIVE", kind: "live", aliases: ["is_live", "live_status", "one_live"] },
      { key: "syllabus", label: "Syllabus" },
      { key: "done_artifact", label: "DONE = artifact", aliases: ["done", "artifact", "done_equals_artifact"] },
      { key: "jumped_asks", label: "Jumped asks", kind: "flag", aliases: ["jumped"] },
      { key: "absorbs", label: "Absorbs", aliases: ["absorb"] },
    ],
  },
  {
    id: "am",
    title: "AM twin",
    subtitle: "iOS mirror · MCP parity desktop↔mobile",
    fields: [
      { key: "am_ios_mirror", label: "AM iOS mirror", aliases: ["ios_mirror", "am_ios"] },
      { key: "mcp_parity", label: "MCP parity", aliases: ["mcp_parity_desktop_to_mobile", "parity", "mcp_parity_desktop_mobile"] },
      { key: "last_discord_sync", label: "Last Discord sync", aliases: ["discord_sync", "last_sync"] },
    ],
  },
  {
    id: "cos",
    title: "CoS",
    subtitle: "Global Queue · PARK / GO · network burn",
    rule: "Network burn target: $325.",
    fields: [
      { key: "global_queue", label: "Global Queue", kind: "queue", aliases: ["queue", "park_go", "park_or_go", "global_queue_park_go"] },
      { key: "park", label: "PARK" },
      { key: "go", label: "GO" },
      { key: "pending_handoffs", label: "Pending handoffs", aliases: ["handoffs", "pending_handoff"] },
      { key: "network_burn", label: "Network burn", kind: "money", aliases: ["burn", "network_burn_325", "spend"] },
    ],
  },
];

const ROLE_PREFIXES = ["police_", "researcher_", "engineer_", "eng_", "track_", "sot_", "stay_on_track_", "am_twin_", "cos_", "chief_of_staff_"];

function candidates(header: string): string[] {
  const n = normalizeKey(header);
  const out = [n];
  for (const p of ROLE_PREFIXES) if (n.startsWith(p) && n.length > p.length) out.push(n.slice(p.length));
  return out;
}

/** Map of field.key -> actual header name for every field present in the dataset. */
export function matchFields(section: Section, headers: string[]): Map<string, string> {
  const found = new Map<string, string>();
  const headerCands = headers.map((h) => ({ h, c: candidates(h) }));
  for (const field of section.fields) {
    const names = [field.key, ...(field.aliases ?? [])];
    let hit = headerCands.find(({ c }) => c.some((x) => names.includes(x)));
    if (!hit && field.key.length >= 8) hit = headerCands.find(({ c }) => c.some((x) => x.includes(field.key)));
    if (hit) found.set(field.key, hit.h);
  }
  return found;
}
