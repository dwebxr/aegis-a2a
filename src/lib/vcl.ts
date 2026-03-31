import type { VCLScores, VCLVerdict } from "@/types/offer";

const VCL_MIN_COMPOSITE = (() => {
  const raw = Number(process.env.AEGIS_MIN_COMPOSITE_SCORE ?? 7.0);
  return Number.isFinite(raw) ? raw : 7.0;
})();
const VCL_SCORE_MIN = 0;
const VCL_SCORE_MAX = 10;

function isScoreInRange(score: number): boolean {
  return typeof score === "number" && Number.isFinite(score) && score >= VCL_SCORE_MIN && score <= VCL_SCORE_MAX;
}

function isValidVerdict(v: unknown): v is VCLVerdict {
  return v === "quality" || v === "slop";
}

export interface VCLValidationResult {
  valid: boolean;
  error?: string;
  scores?: VCLScores;
}

export function validateVCLScores(raw: unknown): VCLValidationResult {
  if (raw === undefined || raw === null) {
    return { valid: false, error: "vclScores is required for paid offers. Include originality, insight, credibility, composite (0-10), and verdict ('quality' | 'slop')." };
  }

  if (typeof raw !== "object") {
    return { valid: false, error: "vclScores must be an object" };
  }

  const obj = raw as Record<string, unknown>;

  const requiredNumeric = ["originality", "insight", "credibility", "composite"] as const;
  for (const field of requiredNumeric) {
    if (!(field in obj)) {
      return { valid: false, error: `vclScores.${field} is required` };
    }
    if (!isScoreInRange(obj[field] as number)) {
      return { valid: false, error: `vclScores.${field} must be a number between ${VCL_SCORE_MIN} and ${VCL_SCORE_MAX}` };
    }
  }

  if (!("verdict" in obj) || !isValidVerdict(obj.verdict)) {
    return { valid: false, error: "vclScores.verdict must be 'quality' or 'slop'" };
  }

  const scores: VCLScores = {
    originality: obj.originality as number,
    insight: obj.insight as number,
    credibility: obj.credibility as number,
    composite: obj.composite as number,
    verdict: obj.verdict as VCLVerdict,
  };

  // Optional fields
  if ("vSignal" in obj && obj.vSignal !== undefined) {
    if (!isScoreInRange(obj.vSignal as number)) {
      return { valid: false, error: "vclScores.vSignal must be a number between 0 and 10" };
    }
    scores.vSignal = obj.vSignal as number;
  }
  if ("cContext" in obj && obj.cContext !== undefined) {
    if (!isScoreInRange(obj.cContext as number)) {
      return { valid: false, error: "vclScores.cContext must be a number between 0 and 10" };
    }
    scores.cContext = obj.cContext as number;
  }
  if ("lSlop" in obj && obj.lSlop !== undefined) {
    if (!isScoreInRange(obj.lSlop as number)) {
      return { valid: false, error: "vclScores.lSlop must be a number between 0 and 10" };
    }
    scores.lSlop = obj.lSlop as number;
  }

  return { valid: true, scores };
}

export function checkVCLThreshold(scores: VCLScores, minComposite?: number): { passed: boolean; reason?: string } {
  const threshold = minComposite ?? VCL_MIN_COMPOSITE;

  if (scores.verdict === "slop") {
    return { passed: false, reason: `Content rejected: verdict is 'slop' (composite: ${scores.composite})` };
  }

  if (scores.composite < threshold) {
    return { passed: false, reason: `Content rejected: composite score ${scores.composite} is below minimum threshold ${threshold}` };
  }

  return { passed: true };
}
