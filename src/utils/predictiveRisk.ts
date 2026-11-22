import type {
  LesionCase,
  LongitudinalComparison,
  ProgressionStatus,
  SeverityLevel,
  SkinScanRecord,
} from '../types';

const PROGRESSION_WEIGHT: Record<ProgressionStatus, number> = {
  improving: 0,
  stable: 10,
  evolving: 65,
  worsening: 95,
};

const SEVERITY_RANK: Record<SeverityLevel, number> = {
  routine: 1,
  monitor: 2,
  urgent: 3,
};

export interface ComparisonVelocitySample {
  comparisonId: string;
  previousScanId: string;
  currentScanId: string;
  createdAt: string;
  intervalDays: number;
  progressionStatus: ProgressionStatus;
  confidenceScore: number;
  changeScore: number;
  rateOfChangePerWeek: number;
}

export interface PredictiveRiskNotification {
  caseId: string;
  caseTitle: string;
  bodyLocation: string;
  comparisonCount: number;
  latestComparisonId: string;
  latestScanId: string;
  previousScanId: string;
  latestProgressionStatus: ProgressionStatus;
  rateOfChangePerWeek: number;
  peakRateOfChangePerWeek: number;
  thresholdPerWeek: number;
  intervalDays: number;
  changeScore: number;
  trendDirection: 'accelerating' | 'elevated' | 'steady';
  reviewUrgency: 'recommended' | 'priority';
  summaryReason: string;
  visualChangeHighlight: string;
  samples: ComparisonVelocitySample[];
}

export function evaluateComparisonVelocities(
  caseComparisons: LongitudinalComparison[],
  scanById: Map<string, SkinScanRecord>
): ComparisonVelocitySample[] {
  const sorted = [...caseComparisons].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  return sorted.map((cmp) => {
    const prevScan = scanById.get(cmp.previousScanId);
    const currScan = scanById.get(cmp.currentScanId);

    let intervalDays = 14;
    if (prevScan && currScan) {
      const diffMs =
        new Date(currScan.createdAt).getTime() - new Date(prevScan.createdAt).getTime();
      if (Number.isFinite(diffMs) && diffMs > 0) {
        intervalDays = Math.max(1, Math.round((diffMs / (1000 * 60 * 60 * 24)) * 10) / 10);
      }
    }

    const baseScore =
      PROGRESSION_WEIGHT[cmp.progressionStatus] *
      (Math.max(40, Math.min(100, cmp.confidenceScore)) / 100);

    let severityShiftBoost = 0;
    if (prevScan && currScan) {
      const prevRank = SEVERITY_RANK[prevScan.analysis.severityLevel];
      const currRank = SEVERITY_RANK[currScan.analysis.severityLevel];
      if (currRank > prevRank) {
        severityShiftBoost = (currRank - prevRank) * 20;
      }
    }

    const changeScore = Math.round((baseScore + severityShiftBoost) * 10) / 10;
    const weeks = Math.max(0.5, intervalDays / 7);
    const rateOfChangePerWeek = Math.round((changeScore / weeks) * 10) / 10;

    return {
      comparisonId: cmp.id,
      previousScanId: cmp.previousScanId,
      currentScanId: cmp.currentScanId,
      createdAt: cmp.createdAt,
      intervalDays,
      progressionStatus: cmp.progressionStatus,
      confidenceScore: cmp.confidenceScore,
      changeScore,
      rateOfChangePerWeek,
    };
  });
}

export function computePredictiveRiskNotifications(params: {
  cases: LesionCase[];
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
  rateThresholdPerWeek: number;
}): {
  notifications: PredictiveRiskNotification[];
  byCaseId: Map<string, PredictiveRiskNotification>;
  monitoredCaseCount: number;
} {
  const { cases, scans, comparisons, rateThresholdPerWeek } = params;
  const scanById = new Map(scans.map((s) => [s.id, s]));
  const comparisonsByCase = new Map<string, LongitudinalComparison[]>();

  for (const cmp of comparisons) {
    const list = comparisonsByCase.get(cmp.caseId) || [];
    list.push(cmp);
    comparisonsByCase.set(cmp.caseId, list);
  }

  const notifications: PredictiveRiskNotification[] = [];
  const byCaseId = new Map<string, PredictiveRiskNotification>();
  let monitoredCaseCount = 0;

  for (const lesionCase of cases) {
    const caseComparisons = comparisonsByCase.get(lesionCase.id) || [];
    if (caseComparisons.length === 0) continue;

    monitoredCaseCount += 1;
    const samples = evaluateComparisonVelocities(caseComparisons, scanById);
    const latestSample = samples[samples.length - 1];
    const peakRateOfChangePerWeek = Math.max(...samples.map((s) => s.rateOfChangePerWeek));

    // Check if either the latest comparison velocity or peak recent comparison velocity exceeds threshold
    const latestComparison = [...caseComparisons].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    )[caseComparisons.length - 1];

    const effectiveRate = latestSample.rateOfChangePerWeek;
    const isAccelerating =
      samples.length >= 2 &&
      latestSample.rateOfChangePerWeek > samples[samples.length - 2].rateOfChangePerWeek + 3;

    const exceedsThreshold =
      effectiveRate >= rateThresholdPerWeek ||
      (peakRateOfChangePerWeek >= rateThresholdPerWeek &&
        latestSample.progressionStatus !== 'improving');

    if (!exceedsThreshold) continue;

    const reviewUrgency: 'recommended' | 'priority' =
      latestSample.progressionStatus === 'worsening' ||
      effectiveRate >= rateThresholdPerWeek * 1.75
        ? 'priority'
        : 'recommended';

    const trendDirection: 'accelerating' | 'elevated' | 'steady' = isAccelerating
      ? 'accelerating'
      : effectiveRate >= rateThresholdPerWeek
        ? 'elevated'
        : 'steady';

    const prevScan = scanById.get(latestSample.previousScanId);
    const currScan = scanById.get(latestSample.currentScanId);
    const sevShiftText =
      prevScan &&
      currScan &&
      prevScan.analysis.severityLevel !== currScan.analysis.severityLevel
        ? ` · Severity ${prevScan.analysis.severityLevel.toUpperCase()} -> ${currScan.analysis.severityLevel.toUpperCase()}`
        : '';

    const summaryReason = `Comparison change rate of ${effectiveRate.toFixed(1)} pts/wk over ${latestSample.intervalDays}d exceeds ${rateThresholdPerWeek} pts/wk threshold (${latestSample.progressionStatus.toUpperCase()}${sevShiftText}).`;

    const notification: PredictiveRiskNotification = {
      caseId: lesionCase.id,
      caseTitle: lesionCase.title,
      bodyLocation: lesionCase.bodyLocation,
      comparisonCount: caseComparisons.length,
      latestComparisonId: latestSample.comparisonId,
      latestScanId: latestSample.currentScanId,
      previousScanId: latestSample.previousScanId,
      latestProgressionStatus: latestSample.progressionStatus,
      rateOfChangePerWeek: effectiveRate,
      peakRateOfChangePerWeek,
      thresholdPerWeek: rateThresholdPerWeek,
      intervalDays: latestSample.intervalDays,
      changeScore: latestSample.changeScore,
      trendDirection,
      reviewUrgency,
      summaryReason,
      visualChangeHighlight: `${latestComparison.visualDeltas.sizeAndArea} ${latestComparison.visualDeltas.borderEvolution}`.trim(),
      samples,
    };

    notifications.push(notification);
    byCaseId.set(lesionCase.id, notification);
  }

  notifications.sort((a, b) => b.rateOfChangePerWeek - a.rateOfChangePerWeek);

  return { notifications, byCaseId, monitoredCaseCount };
}
