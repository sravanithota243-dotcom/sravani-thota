import type { LesionCase, SeverityLevel, SkinScanRecord } from '../types';

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  routine: 1,
  monitor: 2,
  urgent: 3,
};

export interface LesionTrendAlert {
  caseId: string;
  caseTitle: string;
  bodyLocation: string;
  hasAlert: boolean;
  rapidConfidenceIncrease: boolean;
  worseningSeverity: boolean;
  confidenceDelta: number;
  confidenceSequence: number[];
  severitySequence: SeverityLevel[];
  flaggedScanIds: string[];
  latestScanId: string;
  reasons: string[];
  summaryText: string;
}

export function evaluateLesionTrendAlert(
  lesionCase: Pick<LesionCase, 'id' | 'title' | 'bodyLocation'>,
  caseScans: SkinScanRecord[]
): LesionTrendAlert | null {
  const sorted = [...caseScans]
    .filter((s) => s.caseId === lesionCase.id)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (sorted.length < 3) {
    return null;
  }

  const lastThree = sorted.slice(-3);
  const [s0, s1, s2] = lastThree;

  const c0 = s0.analysis.confidenceScore;
  const c1 = s1.analysis.confidenceScore;
  const c2 = s2.analysis.confidenceScore;
  const confidenceDelta = c2 - c0;

  // Rapidly increasing confidence over last 3 scans:
  // either monotonic climb of >= 8 pts, or non-decreasing climb of >= 12 pts
  const rapidConfidenceIncrease =
    (c2 > c1 && c1 > c0 && confidenceDelta >= 8) ||
    (c2 >= c1 && c1 >= c0 && confidenceDelta >= 12);

  const sev0 = SEVERITY_RANK[s0.analysis.severityLevel];
  const sev1 = SEVERITY_RANK[s1.analysis.severityLevel];
  const sev2 = SEVERITY_RANK[s2.analysis.severityLevel];

  // Worsening severity trend over last 3 scans:
  // monotonic escalation (e.g. routine -> monitor -> urgent or routine -> routine -> monitor)
  // or sharp jump to urgent on latest scan
  const worseningSeverity =
    (sev2 >= sev1 && sev1 >= sev0 && sev2 > sev0) ||
    (sev2 === 3 && sev2 > sev1);

  const hasAlert = rapidConfidenceIncrease || worseningSeverity;
  if (!hasAlert) {
    return null;
  }

  const reasons: string[] = [];
  if (rapidConfidenceIncrease) {
    reasons.push(`Rapid confidence increase (+${confidenceDelta}%: ${c0}% -> ${c1}% -> ${c2}%)`);
  }
  if (worseningSeverity) {
    reasons.push(
      `Worsening severity trend (${s0.analysis.severityLevel.toUpperCase()} -> ${s1.analysis.severityLevel.toUpperCase()} -> ${s2.analysis.severityLevel.toUpperCase()})`
    );
  }

  return {
    caseId: lesionCase.id,
    caseTitle: lesionCase.title,
    bodyLocation: lesionCase.bodyLocation,
    hasAlert: true,
    rapidConfidenceIncrease,
    worseningSeverity,
    confidenceDelta,
    confidenceSequence: [c0, c1, c2],
    severitySequence: [
      s0.analysis.severityLevel,
      s1.analysis.severityLevel,
      s2.analysis.severityLevel,
    ],
    flaggedScanIds: lastThree.map((s) => s.id),
    latestScanId: s2.id,
    reasons,
    summaryText: reasons.join(' · '),
  };
}

export function computeTrendAlertsMap(
  cases: LesionCase[],
  scans: SkinScanRecord[]
): Map<string, LesionTrendAlert> {
  const alerts = new Map<string, LesionTrendAlert>();
  for (const lesionCase of cases) {
    const alert = evaluateLesionTrendAlert(lesionCase, scans);
    if (alert) {
      alerts.set(lesionCase.id, alert);
    }
  }
  return alerts;
}
