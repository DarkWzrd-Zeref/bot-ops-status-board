import { esc } from "./render";

export const EFFICIENCY_GUIDE = {
  schema: "hub.efficiency.guide.v1",
  title: "Boardwide Brain Bridge",
  subtitle: "Four subscriptions, one MCP nervous system",
  audience: "community_hub_public_post",
  stack: {
    monthly_usd: 620,
    subscriptions: [
      { id: "claude_pro", name: "Claude Pro", usd: 20, role: "spec_review_design", surface: "claude" },
      { id: "grok_heavy", name: "SuperGrok Heavy", usd: 300, role: "media_multiagent_live", surface: "grok" },
      { id: "cursor_ultra", name: "Cursor Ultra", usd: 200, role: "repo_agent_ide", surface: "cursor" },
      { id: "chatgpt_pro", name: "ChatGPT Pro 5x", usd: 100, role: "codex_computer_sora", surface: "chatgpt" },
    ],
  },
  pools: {
    claude_pro: {
      included: ["opus_5", "sonnet_5", "haiku_4_5"],
      credits_only: ["fable_5", "fable_5_1"],
      has: ["claude_code", "cowork", "design", "science", "research", "projects"],
      missing: ["native_image", "native_video"],
      note: "Do not burn Fable on $20. Opus 5 is the included flagship.",
    },
    grok_heavy: {
      included: ["grok_4_6", "grok_heavy_multiagent", "grok_build", "grok_bot", "imagine_image", "imagine_video", "voice", "web_x"],
      exclusive: ["grok_heavy_multiagent"],
      note: "Media factory + parallel reasoner. Not the IDE.",
    },
    cursor_ultra: {
      cursor_models: ["grok_4_6", "grok_4_5", "composer_2_5"],
      other_models: ["fable_5_1", "opus_5", "sonnet_5", "gpt56_sol", "gpt56_terra", "gpt56_luna", "gemini_38_flash", "gemini_31_pro", "muse_spark_1_3"],
      has: ["cloud_agents", "grok_bot_max", "bugbot", "projects", "mcp"],
      missing: ["native_image", "native_video"],
      protect: "other_models_pool",
    },
    chatgpt_pro: {
      included: ["gpt56_sol", "gpt56_terra", "gpt56_luna", "gpt56_sol_pro", "gpt6_astra", "codex", "images", "deep_research", "agent"],
      capped: { gpt6_astra_pro: "~50/week", sora: "limited_not_unlimited" },
      missing_vs_200: ["unlimited_sora", "20x_usage"],
    },
  },
  mcp_bus: {
    purpose: "Bridge subscription silos so each brain only does the job it owns.",
    shared_objects: ["job_spec", "file_map", "diff", "asset_brief", "ship_packet"],
    handoff_contract: {
      job_spec: ["goal", "constraints", "stack", "done_when", "owner_model"],
      file_map: ["paths", "touch_list", "do_not_break"],
      diff: ["pr", "tests", "risks"],
      asset_brief: ["still_prompt", "motion_prompt", "refs"],
      ship_packet: ["pr_url", "exports", "launch_copy"],
    },
    tools: [
      { name: "route_job", does: "pick surface+model from intent" },
      { name: "pass_context", does: "move spec/diff/brief between brains without re-prompting history" },
      { name: "quota_guard", does: "block fable/astra/sol on cheap tasks" },
      { name: "promote_asset", does: "imagine still -> video -> ship folder" },
    ],
  },
  owners: {
    daily_ide: { primary: "cursor:grok_4_6|composer_2_5", backup: "cursor:sonnet_5|terra" },
    hard_multifile: { primary: "cursor:opus_5", escalate: "cursor:fable_5_1" },
    terminal_long_agent: { primary: "chatgpt:codex+sol|astra", backup: "grok:build|bot" },
    architecture_review: { primary: "claude:opus_5", backup: "chatgpt:sol" },
    research: { primary: "grok:4_6+search", backup: "chatgpt:deep_research|claude:research" },
    stills: { primary: "grok:imagine_image", backup: "chatgpt:images" },
    video: { primary: "grok:imagine_video", backup: "chatgpt:sora" },
    computer_use: { primary: "chatgpt:gpt6_astra", backup: "grok:bot" },
    parallel_think: { primary: "grok:heavy_multiagent", backup: "chatgpt:astra_pro" },
    cheap_volume: { primary: "composer_2_5|luna|flash|haiku" },
  },
  pipeline: [
    { step: 0, name: "capture", brain: "grok|chatgpt", out: "job_spec" },
    { step: 1, name: "plan", brain: "claude:opus_5", fallback: "claude:sonnet_5", out: "file_map" },
    { step: 2, name: "build", brain: "cursor", ladder: ["composer_2_5", "grok_4_6", "sonnet_5", "opus_5", "gpt56_sol", "fable_5_1"], out: "diff" },
    { step: 3, name: "verify", brains: ["cursor:bugbot", "claude:opus_5", "chatgpt:codex"], nuke: "grok:heavy_multiagent", out: "diff.risks" },
    { step: 4, name: "make", brains: ["grok:imagine", "chatgpt:sora|work"], out: "asset_brief+exports" },
    { step: 5, name: "ship", brains: ["cursor:cloud_agent|chatgpt:codex", "claude:sonnet_5"], out: "ship_packet" },
  ],
  router: [
    { if: "small_feature", then: "cursor:composer_2_5" },
    { if: "normal_feature", then: "cursor:grok_4_6 -> claude:opus_5 review" },
    { if: "scary_refactor", then: "cursor:opus_5 -> cursor:fable_5_1" },
    { if: "overnight_repo_agent", then: "chatgpt:codex+sol | grok:bot" },
    { if: "need_n_hypotheses", then: "grok:heavy_multiagent" },
    { if: "drive_browser_os", then: "chatgpt:gpt6_astra" },
    { if: "thumbnail_still", then: "grok:imagine_image" },
    { if: "short_clip", then: "grok:imagine_video" },
    { if: "cinematic_sora", then: "chatgpt:sora after imagine draft" },
    { if: "long_spec", then: "claude:opus_5" },
    { if: "live_x_news", then: "grok:4_6" },
  ],
  guards: [
    "never_fable_on_claude_pro_daily",
    "fable_only_in_cursor_other_pool",
    "no_fable_astra_sol_for_tab_work",
    "grok_heavy_is_not_the_ide",
    "chatgpt_pro_is_codex_astra_media_not_duplicate_cursor",
    "pin_cursor_default_to_grok_4_6_or_composer",
    "cap_astra_pro_for_computer_use_only",
  ],
  public_copy: [
    "One bus. Four wallets. No duplicate thinking.",
    "Cursor holds the repo. Claude holds the judgment. ChatGPT holds the computer. Grok holds the media.",
    "Escalate models, not subscriptions.",
    "Fable and Astra are scalpels. Composer and Luna are shovels.",
  ],
  bot_instructions: {
    ingest: "Parse owners, router, pipeline, guards. Ignore prose.",
    post: "Render subscriptions around MCP_BUS, then public_copy as captions.",
    runtime: "On incoming task, run router then emit MCP handoff_contract object to next brain.",
    gap_fill: "If a surface lacks a capability, route via MCP_BUS instead of forcing the local model.",
  },
} as const;

const surfaceClass = (surface: string): string => `surface-${surface.replace(/[^a-z]/g, "")}`;

export function renderEfficiencyGuide(): string {
  const subscriptions = EFFICIENCY_GUIDE.stack.subscriptions
    .map(
      (sub) => `<article class="brain ${surfaceClass(sub.surface)}">
        <span class="brain-cost">$${sub.usd}/mo</span>
        <h3>${esc(sub.name)}</h3>
        <p>${esc(sub.role.replaceAll("_", " "))}</p>
      </article>`,
    )
    .join("");
  const pipeline = EFFICIENCY_GUIDE.pipeline
    .map(
      (stage) => `<li>
        <span class="step-number">${stage.step}</span>
        <strong>${esc(stage.name.toUpperCase())}</strong>
        <span>${esc("brain" in stage ? stage.brain : stage.brains.join(" + "))}</span>
        <code>${esc(stage.out)}</code>
      </li>`,
    )
    .join("");
  const routes = EFFICIENCY_GUIDE.router
    .map((route) => `<div class="route"><code>${esc(route.if)}</code><span>→</span><strong>${esc(route.then)}</strong></div>`)
    .join("");
  const contracts = Object.entries(EFFICIENCY_GUIDE.mcp_bus.handoff_contract)
    .map(([name, fields]) => `<div class="contract"><strong>${esc(name)}</strong><span>${fields.map(esc).join(" · ")}</span></div>`)
    .join("");
  const guards = EFFICIENCY_GUIDE.guards.map((guard) => `<li>${esc(guard.replaceAll("_", " "))}</li>`).join("");
  const captions = EFFICIENCY_GUIDE.public_copy.map((line) => `<p>${esc(line)}</p>`).join("");

  return `<section class="efficiency" id="efficiency-guide" aria-labelledby="efficiency-title">
    <header class="efficiency-heading">
      <div>
        <p class="eyebrow">Area 67 reference checkpoint · ${esc(EFFICIENCY_GUIDE.schema)}</p>
        <h2 id="efficiency-title">${esc(EFFICIENCY_GUIDE.title)}</h2>
        <p class="muted">${esc(EFFICIENCY_GUIDE.subtitle)}</p>
      </div>
      <div class="guide-actions">
        <span class="pill warn">$${EFFICIENCY_GUIDE.stack.monthly_usd}/month</span>
        <button id="copy-guide" class="btn ghost" type="button">Copy bot JSON</button>
        <button id="download-guide" class="btn ghost" type="button">Download</button>
      </div>
    </header>

    <div class="brain-bridge" aria-label="Four subscription spokes connected by the MCP bus">
      <div class="brain-grid">${subscriptions}</div>
      <div class="mcp-core">
        <span>MCP BUS</span>
        <small>${esc(EFFICIENCY_GUIDE.mcp_bus.purpose)}</small>
      </div>
    </div>

    <ol class="pipeline" aria-label="Coding handoff pipeline">${pipeline}</ol>

    <div class="guide-grid">
      <section class="guide-panel"><h3>Route the job</h3>${routes}</section>
      <section class="guide-panel"><h3>Pass only the contract</h3>${contracts}</section>
      <section class="guide-panel"><h3>Quota guards</h3><ul class="guard-list">${guards}</ul></section>
    </div>

    <footer class="guide-copy">${captions}</footer>
  </section>`;
}

export function efficiencyGuideJson(): string {
  return JSON.stringify(EFFICIENCY_GUIDE, null, 2);
}
