import type { Reco, ScanReport, Severity } from "./types.ts";
import scans from "../content/scans.json";

const reports = scans.reports as Record<string, ScanReport>;

export function scoreToReco(score: number): Reco {
  if (score > 50) return "DO_NOT_INSTALL";
  if (score >= 25) return "CAUTION";
  return "SAFE";
}

export function recoTone(reco: Reco): "ok" | "warn" | "bad" {
  if (reco === "SAFE") return "ok";
  if (reco === "CAUTION") return "warn";
  return "bad";
}

export function canEquipSkill(report: ScanReport | undefined, cautionBlocks: boolean): { ok: boolean; reason: string } {
  if (!report) return { ok: false, reason: "No Spector scan yet. Walk this skill to the Spector Gate." };
  const reco = report.risk_assessment.recommendation;
  if (reco === "DO_NOT_INSTALL") return { ok: false, reason: "SkillSpector: DO_NOT_INSTALL (score " + report.risk_assessment.score + ")" };
  if (reco === "CAUTION" && cautionBlocks) return { ok: false, reason: "SkillSpector: CAUTION — gate is set to block medium risk." };
  return { ok: true, reason: reco === "SAFE" ? "SkillSpector: SAFE" : "SkillSpector: CAUTION — installed with warning" };
}

export async function scanSkill(skillId: string, target: string): Promise<ScanReport> {
  const base = import.meta.env.VITE_SKILLSPECTOR_URL as string | undefined;
  if (base) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/scan_skill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, use_llm: false, output_format: "json" }),
      });
      if (res.ok) {
        const raw = (await res.json()) as Partial<ScanReport> & {
          risk_score?: number;
          severity?: Severity;
          recommendation?: Reco;
          findings?: ScanReport["issues"];
        };
        if (raw.risk_assessment) return raw as ScanReport;
        const score = raw.risk_score ?? 0;
        return {
          skill: { name: skillId, source: target, scanned_at: new Date().toISOString() },
          risk_assessment: {
            score,
            severity: raw.severity ?? (score > 75 ? "CRITICAL" : score > 50 ? "HIGH" : score >= 25 ? "MEDIUM" : "LOW"),
            recommendation: raw.recommendation ?? scoreToReco(score),
          },
          components: [],
          issues: raw.findings ?? [],
          metadata: {
            has_executable_scripts: false,
            skillspector_version: "live",
            llm_requested: false,
            llm_available: false,
            inference_usage: [],
          },
        };
      }
    } catch {
      /* fall through to fixture */
    }
  }
  const fixture = reports[skillId];
  if (fixture) {
    return {
      ...fixture,
      skill: { ...fixture.skill, scanned_at: new Date().toISOString() },
    };
  }
  return {
    skill: { name: skillId, source: target, scanned_at: new Date().toISOString() },
    risk_assessment: { score: 0, severity: "LOW", recommendation: "SAFE" },
    components: [],
    issues: [],
    metadata: {
      has_executable_scripts: false,
      skillspector_version: "empty",
      llm_requested: false,
      llm_available: false,
      inference_usage: [],
    },
  };
}
