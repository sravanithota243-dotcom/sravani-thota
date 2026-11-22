import type { LesionCase, LongitudinalComparison, SkinScanRecord } from '../types';
import type { LesionTrendAlert } from './trendAlert';

export interface ClinicalCsvExportParams {
  patientId: string;
  cases: LesionCase[];
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
  trendAlertsByCase?: Map<string, LesionTrendAlert>;
  filenamePrefix?: string;
}

export interface ClinicalCsvExportResult {
  filename: string;
  scanCount: number;
  comparisonCount: number;
}

const SEVERITY_NUMERIC: Record<SkinScanRecord['analysis']['severityLevel'], number> = {
  routine: 1,
  monitor: 2,
  urgent: 3,
};

const PROGRESSION_NUMERIC: Record<LongitudinalComparison['progressionStatus'], number> = {
  improving: 1,
  stable: 2,
  evolving: 3,
  worsening: 4,
};

function escapeCsvCell(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function diffDays(earlierIso: string, laterIso: string): number {
  const t1 = new Date(earlierIso).getTime();
  const t2 = new Date(laterIso).getTime();
  if (!Number.isFinite(t1) || !Number.isFinite(t2)) return 0;
  return Math.max(0, Math.round(((t2 - t1) / (1000 * 60 * 60 * 24)) * 10) / 10);
}

export function buildClinicalProgressionCsv(params: ClinicalCsvExportParams): {
  csvContent: string;
  scanCount: number;
  comparisonCount: number;
} {
  const { patientId, cases, scans, comparisons, trendAlertsByCase } = params;
  const caseMap = new Map(cases.map((c) => [c.id, c]));

  // Sort all scans chronologically per case so visitNumber, interval days, and baseline deltas are accurate
  const scansByCase = new Map<string, SkinScanRecord[]>();
  for (const scan of scans) {
    const list = scansByCase.get(scan.caseId) || [];
    list.push(scan);
    scansByCase.set(scan.caseId, list);
  }
  for (const list of scansByCase.values()) {
    list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  const scanById = new Map(scans.map((s) => [s.id, s]));

  const headers = [
    'schemaVersion',
    'recordType',
    'patientId',
    'caseId',
    'caseTitle',
    'bodyLocation',
    'scanId',
    'visitNumber',
    'recordedAtIso',
    'recordedDate',
    'daysSinceBaseline',
    'daysSincePreviousScan',
    'previousScanId',
    'currentScanId',
    'primaryCondition',
    'confidenceScorePct',
    'uncertaintyMarginPct',
    'confidenceDeltaFromBaseline',
    'severityLevel',
    'severityNumericTier',
    'progressionStatus',
    'progressionNumericRank',
    'trendAlertActive',
    'sessionDurationSeconds',
    'qualityOverallScore',
    'sharpnessScore',
    'brightnessScore',
    'contrastScore',
    'qualityStatus',
    'asymmetry',
    'borderRegularity',
    'colorVariation',
    'erythemaLevel',
    'surfaceTexture',
    'sizeAndAreaDelta',
    'borderEvolutionDelta',
    'pigmentationShiftDelta',
    'inflammationChangeDelta',
    'symptoms',
    'customNotes',
    'tags',
    'differentials',
    'redFlagChecklist',
    'problemCheckingMessage',
    'clinicalSummary',
    'recommendationsOrNextSteps',
  ];

  const rows: unknown[][] = [];

  // Emit chronological scan visit rows grouped by lesion case
  const orderedCaseIds = Array.from(scansByCase.keys()).sort((a, b) => {
    const firstA = scansByCase.get(a)?.[0]?.createdAt || '';
    const firstB = scansByCase.get(b)?.[0]?.createdAt || '';
    return new Date(firstA).getTime() - new Date(firstB).getTime();
  });

  for (const caseId of orderedCaseIds) {
    const caseScans = scansByCase.get(caseId) || [];
    const baseline = caseScans[0];
    const hasTrendAlert = Boolean(trendAlertsByCase?.has(caseId));

    caseScans.forEach((scan, index) => {
      const prevScan = index > 0 ? caseScans[index - 1] : null;
      const daysSinceBaseline = baseline ? diffDays(baseline.createdAt, scan.createdAt) : 0;
      const daysSincePrevious = prevScan ? diffDays(prevScan.createdAt, scan.createdAt) : 0;
      const confidenceDelta = baseline
        ? scan.analysis.confidenceScore - baseline.analysis.confidenceScore
        : 0;

      const differentialsText = scan.analysis.differentials
        .map((d) => `${d.name} (${d.probability}%)`)
        .join(' | ');

      rows.push([
        'clinical-v1',
        'SCAN_VISIT',
        patientId,
        scan.caseId,
        scan.caseTitle,
        scan.bodyLocation,
        scan.id,
        index + 1,
        scan.createdAt,
        scan.createdAt.slice(0, 10),
        daysSinceBaseline,
        daysSincePrevious,
        prevScan ? prevScan.id : '',
        scan.id,
        scan.analysis.primaryCondition,
        scan.analysis.confidenceScore,
        scan.analysis.uncertaintyMargin,
        confidenceDelta,
        scan.analysis.severityLevel,
        SEVERITY_NUMERIC[scan.analysis.severityLevel],
        '',
        '',
        hasTrendAlert ? 'true' : 'false',
        scan.metadata?.sessionDurationSeconds ?? '',
        scan.qualityMetrics.overallScore,
        scan.qualityMetrics.sharpnessScore,
        scan.qualityMetrics.brightnessScore,
        scan.qualityMetrics.contrastScore,
        scan.qualityMetrics.status,
        scan.analysis.morphology.asymmetry,
        scan.analysis.morphology.borderRegularity,
        scan.analysis.morphology.colorVariation,
        scan.analysis.morphology.erythemaLevel,
        scan.analysis.morphology.surfaceTexture,
        '',
        '',
        '',
        '',
        scan.symptoms,
        scan.customNotes || '',
        (scan.tags || []).join(' | '),
        differentialsText,
        scan.analysis.redFlagChecklist.join(' | '),
        scan.analysis.problemCheckingMessage,
        scan.analysis.clinicalSummary,
        scan.analysis.recommendations.join(' | '),
      ]);
    });
  }

  // Emit longitudinal comparison progression rows ordered chronologically
  const sortedComparisons = [...comparisons].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  for (const cmp of sortedComparisons) {
    const parentCase = caseMap.get(cmp.caseId);
    const prevScan = scanById.get(cmp.previousScanId);
    const currScan = scanById.get(cmp.currentScanId);
    const caseScans = scansByCase.get(cmp.caseId) || [];
    const baseline = caseScans[0];
    const intervalDays =
      prevScan && currScan ? diffDays(prevScan.createdAt, currScan.createdAt) : '';
    const daysSinceBaseline =
      baseline && currScan ? diffDays(baseline.createdAt, currScan.createdAt) : '';
    const hasTrendAlert = Boolean(trendAlertsByCase?.has(cmp.caseId));

    rows.push([
      'clinical-v1',
      'PROGRESSION_COMPARISON',
      patientId,
      cmp.caseId,
      cmp.caseTitle,
      parentCase?.bodyLocation || currScan?.bodyLocation || prevScan?.bodyLocation || '',
      '',
      '',
      cmp.createdAt,
      cmp.createdAt.slice(0, 10),
      daysSinceBaseline,
      intervalDays,
      cmp.previousScanId,
      cmp.currentScanId,
      currScan?.analysis.primaryCondition || '',
      cmp.confidenceScore,
      '',
      prevScan && currScan
        ? currScan.analysis.confidenceScore - prevScan.analysis.confidenceScore
        : '',
      currScan?.analysis.severityLevel || '',
      currScan ? SEVERITY_NUMERIC[currScan.analysis.severityLevel] : '',
      cmp.progressionStatus,
      PROGRESSION_NUMERIC[cmp.progressionStatus],
      hasTrendAlert ? 'true' : 'false',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      cmp.visualDeltas.sizeAndArea,
      cmp.visualDeltas.borderEvolution,
      cmp.visualDeltas.pigmentationShift,
      cmp.visualDeltas.inflammationChange,
      '',
      '',
      '',
      '',
      '',
      cmp.problemCheckingMessage,
      cmp.changeSummary,
      cmp.clinicalNextSteps.join(' | '),
    ]);
  }

  const lines = [headers, ...rows].map((row) => row.map(escapeCsvCell).join(','));
  return {
    csvContent: `\uFEFF${lines.join('\r\n')}`,
    scanCount: scans.length,
    comparisonCount: sortedComparisons.length,
  };
}

export function downloadClinicalProgressionCsv(
  params: ClinicalCsvExportParams
): ClinicalCsvExportResult {
  const { csvContent, scanCount, comparisonCount } = buildClinicalProgressionCsv(params);
  const dateStamp = new Date().toISOString().slice(0, 10);
  const prefix = params.filenamePrefix || 'skinsense-clinical-progression';
  const filename = `${prefix}-${dateStamp}.csv`;

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  return { filename, scanCount, comparisonCount };
}
