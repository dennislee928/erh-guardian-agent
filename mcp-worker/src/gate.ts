/**
 * TypeScript port of the guardian's pure gate scoring
 * (src/erh_guardian/tools.py `guardian_risk` + gate.py `decide`, using the
 * ERH engine's deterministic lexical fallback from erh_engine/adapters/scoring.py).
 *
 * Powers the public console endpoint so the transparency panel can score a
 * user-proposed action with the exact same contract the Python agent uses.
 */

// Lexical fallback terms, kept in sync with erh_engine.adapters.scoring.
const TOXIC_TERMS = [
  "kill", "bomb", "weapon", "exploit", "malware", "ransomware", "hate",
  "attack", "steal", "fraud", "suicide", "abuse", "illegal", "bypass",
  "jailbreak", "ignore previous", "disregard", "override safety",
] as const;

/** Deterministic [-1, 1] safety score: 1.0 safe, -1.0 unsafe. */
export function ethicalValue(text: string): number {
  if (!text) return 1.0;
  const lowered = text.toLowerCase();
  const hits = TOXIC_TERMS.filter((term) => lowered.includes(term)).length;
  return Math.max(-1.0, 1.0 - 0.5 * hits);
}

/** Heuristic decision complexity in [1, 100] from text structure. */
export function textComplexity(text: string): number {
  if (!text) return 1.0;
  const tokens = text.split(/\s+/).filter(Boolean).length;
  const clauses = (text.toLowerCase().match(/[.!?;]|\band\b|\bor\b|\bif\b|\bthen\b/g) ?? []).length;
  const raw = 1.0 + tokens / 20.0 + clauses * 2.0;
  return Math.max(1.0, Math.min(100.0, raw));
}

export interface RiskScore {
  riskScore: number;
  ethicalValue: number;
  complexity: number;
}

/** Map ethical value + complexity onto the 0-100 guardian risk scale. */
export function guardianRisk(text: string): RiskScore {
  const v = ethicalValue(text);
  const x = textComplexity(text);
  const baseRisk = ((1.0 - v) / 2.0) * 100.0;
  // Higher-complexity decisions get a mild risk uplift (up to +20).
  const uplift = Math.min(20.0, x / 5.0);
  const riskScore = Math.min(100.0, baseRisk + (baseRisk > 0 ? uplift : 0.0));
  return { riskScore, ethicalValue: v, complexity: x };
}

export interface GateProfile {
  riskThreshold: number;
  protectedTopics: string[];
  autoApproveTools: string[];
}

export interface GateDecision extends RiskScore {
  toolName: string;
  actionText: string;
  threshold: number;
  protectedTopic: string | null;
  autoApprovedTool: boolean;
  needsApproval: boolean;
  matchedTerms: string[];
}

/** Pure gate decision: score the proposed action against the profile. */
export function decide(profile: GateProfile, toolName: string, actionText: string): GateDecision {
  const scored = guardianRisk(actionText);
  const lowered = actionText.toLowerCase();
  const autoApprovedTool = profile.autoApproveTools.includes(toolName);
  const protectedTopic = autoApprovedTool
    ? null
    : (profile.protectedTopics.find((t) => lowered.includes(t.toLowerCase())) ?? null);
  const needsApproval = autoApprovedTool
    ? false
    : protectedTopic !== null || scored.riskScore > profile.riskThreshold;

  return {
    ...scored,
    toolName,
    actionText,
    threshold: profile.riskThreshold,
    protectedTopic,
    autoApprovedTool,
    needsApproval,
    matchedTerms: TOXIC_TERMS.filter((term) => lowered.includes(term)),
  };
}
