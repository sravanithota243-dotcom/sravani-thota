import {
  Activity,
  AlertTriangle,
  BellRing,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardCheck,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  FileJson,
  FileSpreadsheet,
  GitCompareArrows,
  Info,
  LayoutGrid,
  Link2,
  List,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Shield,
  Stethoscope,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  DailyCheckInTask,
  FollowUpReminder,
  LesionCase,
  LongitudinalComparison,
  SeverityLevel,
  SkinScanRecord,
  UserProfile,
} from '../types';
import { api } from '../utils/api';
import { downloadClinicalProgressionCsv } from '../utils/csvExport';
import { formatDurationLabel } from '../utils/duration';
import {
  generateCasePdfReport,
  generateMonthlySummaryPdfReport,
  generateScanPdfReport,
} from '../utils/pdfReport';
import { computePredictiveRiskNotifications } from '../utils/predictiveRisk';
import { computeTrendAlertsMap } from '../utils/trendAlert';
import { useMultilingualSpeaker } from '../utils/voicePlayer';
import { FollowUpScheduleWidget } from './FollowUpScheduleWidget';
import { LesionProgressionChart } from './LesionProgressionChart';

interface HistoryWorkspaceProps {
  user: UserProfile;
  scans: SkinScanRecord[];
  cases: LesionCase[];
  comparisons: LongitudinalComparison[];
  reminders: FollowUpReminder[];
  dailyCheckInTasks: DailyCheckInTask[];
  selectedLanguage: string;
  onCaseUpdated: (updated: LesionCase) => void;
  onScanDeleted: (scanId: string) => void;
  onJumpToCompare: (scanId: string) => void;
  onOpenLongitudinalLink: (shareToken: string) => void;
  onReminderCreated: (reminder: FollowUpReminder) => void;
  onReminderUpdated: (reminder: FollowUpReminder) => void;
  onReminderDeleted: (reminderId: string) => void;
  onStartFollowUpScan: (caseId: string) => void;
  onToggleCheckInTask: (taskId: string) => void;
  onDeleteCheckInTask: (taskId: string) => void;
  onClearCheckInTasks: () => void;
  onOpenDailyCheckIn: () => void;
  onStartCheckInScan: (task: DailyCheckInTask) => void;
}

export function HistoryWorkspace({
  user,
  scans,
  cases,
  comparisons,
  reminders,
  dailyCheckInTasks,
  selectedLanguage,
  onCaseUpdated,
  onScanDeleted,
  onJumpToCompare,
  onOpenLongitudinalLink,
  onReminderCreated,
  onReminderUpdated,
  onReminderDeleted,
  onStartFollowUpScan,
  onToggleCheckInTask,
  onDeleteCheckInTask,
  onClearCheckInTasks,
  onOpenDailyCheckIn,
  onStartCheckInScan,
}: HistoryWorkspaceProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | SeverityLevel>('all');
  const [selectedScanId, setSelectedScanId] = useState<string>(scans[0]?.id || '');
  const [chartCaseId, setChartCaseId] = useState<string>(
    scans[0]?.caseId || cases[0]?.id || ''
  );
  const [copiedCaseId, setCopiedCaseId] = useState<string | null>(null);
  const [busyCaseId, setBusyCaseId] = useState<string | null>(null);
  const [generatingCasePdfId, setGeneratingCasePdfId] = useState<string | null>(null);
  const [isGeneratingMonthlyPdf, setIsGeneratingMonthlyPdf] = useState(false);
  const [scanViewMode, setScanViewMode] = useState<'list' | 'gallery'>('list');
  const [isBackupMenuOpen, setIsBackupMenuOpen] = useState(false);
  const [isBackupInfoOpen, setIsBackupInfoOpen] = useState(false);
  const [lastBackupNotice, setLastBackupNotice] = useState<string | null>(null);
  const [rateThresholdPerWeek, setRateThresholdPerWeek] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('skinsense_rate_threshold'));
      return Number.isFinite(saved) && saved >= 5 && saved <= 60 ? saved : 20;
    } catch {
      return 20;
    }
  });
  const [acknowledgedComparisonIds, setAcknowledgedComparisonIds] = useState<string[]>([]);
  const [schedulingCaseId, setSchedulingCaseId] = useState<string | null>(null);
  const [scheduledCaseNotice, setScheduledCaseNotice] = useState<string | null>(null);
  const backupMenuRef = useRef<HTMLDivElement | null>(null);
  const backupInfoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isBackupMenuOpen && !isBackupInfoOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (backupMenuRef.current && !backupMenuRef.current.contains(target)) {
        setIsBackupMenuOpen(false);
      }
      if (backupInfoRef.current && !backupInfoRef.current.contains(target)) {
        setIsBackupInfoOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsBackupMenuOpen(false);
        setIsBackupInfoOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBackupMenuOpen, isBackupInfoOpen]);

  const toLocalMonthKey = (isoDate: string): string => {
    const d = new Date(isoDate);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const formatMonthLabel = (monthKey: string): string => {
    const [yr, mo] = monthKey.split('-').map(Number);
    return new Date(yr, mo - 1, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  };

  const availableMonths = useMemo(() => {
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const counts = new Map<string, { scans: number; comparisons: number }>();

    for (const s of scans) {
      const k = toLocalMonthKey(s.createdAt);
      const entry = counts.get(k) || { scans: 0, comparisons: 0 };
      entry.scans += 1;
      counts.set(k, entry);
    }
    for (const cmp of comparisons) {
      const k = toLocalMonthKey(cmp.createdAt);
      const entry = counts.get(k) || { scans: 0, comparisons: 0 };
      entry.comparisons += 1;
      counts.set(k, entry);
    }
    if (!counts.has(currentKey)) {
      counts.set(currentKey, { scans: 0, comparisons: 0 });
    }

    return Array.from(counts.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, c]) => ({
        key,
        label: formatMonthLabel(key),
        scansCount: c.scans,
        comparisonsCount: c.comparisons,
      }));
  }, [scans, comparisons]);

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  const activeMonthKey = availableMonths.some((m) => m.key === selectedMonthKey)
    ? selectedMonthKey
    : availableMonths[0]?.key || '';
  const activeMonthMeta = availableMonths.find((m) => m.key === activeMonthKey);

  const trendAlertsByCase = useMemo(() => computeTrendAlertsMap(cases, scans), [cases, scans]);
  const activeTrendAlerts = useMemo(
    () => Array.from(trendAlertsByCase.values()),
    [trendAlertsByCase]
  );

  const predictiveRiskSummary = useMemo(
    () =>
      computePredictiveRiskNotifications({
        cases,
        scans,
        comparisons,
        rateThresholdPerWeek,
      }),
    [cases, scans, comparisons, rateThresholdPerWeek]
  );

  const visiblePredictiveAlerts = useMemo(
    () =>
      predictiveRiskSummary.notifications.filter(
        (n) => !acknowledgedComparisonIds.includes(n.latestComparisonId)
      ),
    [predictiveRiskSummary.notifications, acknowledgedComparisonIds]
  );

  const handleThresholdChange = (value: number) => {
    setRateThresholdPerWeek(value);
    try {
      localStorage.setItem('skinsense_rate_threshold', String(value));
    } catch {
      // Ignore storage errors
    }
  };

  const handleScheduleDermReview = async (caseId: string, ratePerWeek: number) => {
    setSchedulingCaseId(caseId);
    try {
      const targetDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { reminder } = await api.createReminder({
        caseId,
        dueDate: targetDate,
        note: `Predictive Risk Notification: Comparison rate of change reached ${ratePerWeek.toFixed(1)} pts/wk (threshold ${rateThresholdPerWeek} pts/wk). Schedule dermatologist evaluation.`,
        notifyEnabled: true,
      });
      onReminderCreated(reminder);
      setScheduledCaseNotice(caseId);
      window.setTimeout(() => {
        setScheduledCaseNotice((prev) => (prev === caseId ? null : prev));
      }, 3500);
    } finally {
      setSchedulingCaseId(null);
    }
  };

  const sessionDurationStats = useMemo(() => {
    const durations = scans
      .map((s) => s.metadata?.sessionDurationSeconds)
      .filter((d): d is number => typeof d === 'number' && Number.isFinite(d) && d > 0);
    if (durations.length === 0) return { avgSeconds: null as number | null, totalSeconds: 0 };
    const totalSeconds = durations.reduce((sum, d) => sum + d, 0);
    return {
      avgSeconds: Math.round(totalSeconds / durations.length),
      totalSeconds,
    };
  }, [scans]);

  const { speak, stop, isLoadingAudio, isSpeaking } = useMultilingualSpeaker();

  const filteredScans = scans.filter((scan) => {
    const matchesSeverity = severityFilter === 'all' || scan.analysis.severityLevel === severityFilter;
    const tokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return matchesSeverity;

    const createdDate = new Date(scan.createdAt);
    const searchableCorpus = [
      scan.createdAt.slice(0, 10),
      createdDate.toLocaleDateString(),
      createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      createdDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      scan.caseTitle,
      scan.bodyLocation,
      scan.analysis.primaryCondition,
      scan.customNotes || '',
      scan.symptoms || '',
      (scan.tags || []).join(' '),
      scan.analysis.clinicalSummary,
      scan.analysis.problemCheckingMessage,
      scan.analysis.recommendations.join(' '),
      scan.analysis.differentials.map((d) => d.name).join(' '),
    ]
      .join(' ')
      .toLowerCase();

    const matchesQuery = tokens.every((token) => searchableCorpus.includes(token));
    return matchesSeverity && matchesQuery;
  });

  const hasActiveFilter = searchQuery.trim().length > 0 || severityFilter !== 'all';
  const selectedScan =
    filteredScans.find((s) => s.id === selectedScanId) ||
    filteredScans[0] ||
    (hasActiveFilter ? null : scans[0] || null);

  const getLongitudinalUrl = (shareToken: string) =>
    `${window.location.origin}/?case=${encodeURIComponent(shareToken)}`;

  const handleCopyUrl = async (c: LesionCase) => {
    try {
      await navigator.clipboard.writeText(getLongitudinalUrl(c.shareToken));
      setCopiedCaseId(c.id);
      setTimeout(() => setCopiedCaseId(null), 2000);
    } catch {
      setCopiedCaseId(null);
    }
  };

  const handleToggleShare = async (c: LesionCase) => {
    setBusyCaseId(c.id);
    try {
      const { lesionCase } = await api.updateCase(c.id, { shareEnabled: !c.shareEnabled });
      onCaseUpdated(lesionCase);
    } finally {
      setBusyCaseId(null);
    }
  };

  const handleRegenerateToken = async (c: LesionCase) => {
    setBusyCaseId(c.id);
    try {
      const { lesionCase } = await api.updateCase(c.id, { regenerateToken: true });
      onCaseUpdated(lesionCase);
    } finally {
      setBusyCaseId(null);
    }
  };

  const handleDeleteScan = async (scanId: string) => {
    await api.deleteScan(scanId);
    onScanDeleted(scanId);
  };

  const handleExportBackup = (format: 'csv' | 'json') => {
    const dateStamp = new Date().toISOString().slice(0, 10);
    const caseMap = new Map(cases.map((c) => [c.id, c]));

    let content = '';
    let mimeType = '';
    let filename = '';

    if (format === 'json') {
      const backupPayload = {
        schemaVersion: '1.0',
        exportedAt: new Date().toISOString(),
        application: 'SkinSense',
        account: {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
        },
        summaryCounts: {
          cases: cases.length,
          scans: scans.length,
          comparisons: comparisons.length,
          reminders: reminders.length,
          averageSessionDurationSeconds: sessionDurationStats.avgSeconds,
          totalSessionDurationSeconds: sessionDurationStats.totalSeconds,
        },
        cases: cases.map((c) => ({
          ...c,
          longitudinalUrl: c.shareEnabled ? getLongitudinalUrl(c.shareToken) : null,
        })),
        scans,
        comparisons,
        reminders,
      };
      content = JSON.stringify(backupPayload, null, 2);
      mimeType = 'application/json;charset=utf-8';
      filename = `skinsense-backup-${dateStamp}.json`;
    } else {
      const escapeCsv = (value: unknown): string => {
        const str = value === null || value === undefined ? '' : String(value);
        if (/[",\r\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const headers = [
        'recordType',
        'id',
        'caseId',
        'caseTitle',
        'bodyLocation',
        'createdAt',
        'sessionDurationSeconds',
        'assessmentOrProgression',
        'confidenceScore',
        'uncertaintyMargin',
        'severityLevel',
        'qualityScore',
        'sharpnessScore',
        'brightnessScore',
        'contrastScore',
        'qualityStatus',
        'previousScanId',
        'currentScanId',
        'symptoms',
        'customNotes',
        'tags',
        'morphologySummary',
        'differentials',
        'redFlagChecklist',
        'problemCheckingMessage',
        'summary',
        'recommendationsOrNextSteps',
        'longitudinalUrl',
      ];

      const scanRows = scans.map((s) => {
        const parentCase = caseMap.get(s.caseId);
        const longitudinalUrl =
          parentCase && parentCase.shareEnabled ? getLongitudinalUrl(parentCase.shareToken) : '';
        const morphologyText = [
          `Asymmetry: ${s.analysis.morphology.asymmetry}`,
          `Border: ${s.analysis.morphology.borderRegularity}`,
          `Color: ${s.analysis.morphology.colorVariation}`,
          `Erythema: ${s.analysis.morphology.erythemaLevel}`,
          `Texture: ${s.analysis.morphology.surfaceTexture}`,
        ].join(' | ');
        const differentialsText = s.analysis.differentials
          .map((d) => `${d.name} (${d.probability}%)`)
          .join(' | ');

        return [
          'SCAN',
          s.id,
          s.caseId,
          s.caseTitle,
          s.bodyLocation,
          s.createdAt,
          s.metadata?.sessionDurationSeconds ?? '',
          s.analysis.primaryCondition,
          `${s.analysis.confidenceScore}%`,
          `+/-${s.analysis.uncertaintyMargin}%`,
          s.analysis.severityLevel,
          s.qualityMetrics.overallScore,
          s.qualityMetrics.sharpnessScore,
          s.qualityMetrics.brightnessScore,
          s.qualityMetrics.contrastScore,
          s.qualityMetrics.status,
          '',
          '',
          s.symptoms,
          s.customNotes || '',
          (s.tags || []).join(' | '),
          morphologyText,
          differentialsText,
          s.analysis.redFlagChecklist.join(' | '),
          s.analysis.problemCheckingMessage,
          s.analysis.clinicalSummary,
          s.analysis.recommendations.join(' | '),
          longitudinalUrl,
        ];
      });

      const comparisonRows = comparisons.map((cmp) => {
        const parentCase = caseMap.get(cmp.caseId);
        const longitudinalUrl =
          parentCase && parentCase.shareEnabled ? getLongitudinalUrl(parentCase.shareToken) : '';
        return [
          'COMPARISON',
          cmp.id,
          cmp.caseId,
          cmp.caseTitle,
          parentCase?.bodyLocation || '',
          cmp.createdAt,
          '',
          cmp.progressionStatus,
          `${cmp.confidenceScore}%`,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          cmp.previousScanId,
          cmp.currentScanId,
          '',
          '',
          '',
          `Size: ${cmp.visualDeltas.sizeAndArea} | Border: ${cmp.visualDeltas.borderEvolution} | Pigment: ${cmp.visualDeltas.pigmentationShift} | Inflammation: ${cmp.visualDeltas.inflammationChange}`,
          '',
          '',
          cmp.problemCheckingMessage,
          cmp.changeSummary,
          cmp.clinicalNextSteps.join(' | '),
          longitudinalUrl,
        ];
      });

      const lines = [headers, ...scanRows, ...comparisonRows].map((row) =>
        row.map(escapeCsv).join(',')
      );
      content = `\uFEFF${lines.join('\r\n')}`;
      mimeType = 'text/csv;charset=utf-8';
      filename = `skinsense-backup-${dateStamp}.csv`;
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setIsBackupMenuOpen(false);
    setLastBackupNotice(`Saved ${filename}`);
    window.setTimeout(() => {
      setLastBackupNotice((prev) => (prev === `Saved ${filename}` ? null : prev));
    }, 3500);
  };

  const handleExportClinicalCsv = (scope: 'all' | 'filtered') => {
    const targetScans = scope === 'filtered' ? filteredScans : scans;
    const activeCaseIds = new Set(targetScans.map((s) => s.caseId));
    const targetComparisons =
      scope === 'filtered' && hasActiveFilter
        ? comparisons.filter((cmp) => activeCaseIds.has(cmp.caseId))
        : comparisons;

    const result = downloadClinicalProgressionCsv({
      patientId: user.id,
      cases,
      scans: targetScans,
      comparisons: targetComparisons,
      trendAlertsByCase,
      filenamePrefix:
        scope === 'filtered' && hasActiveFilter
          ? 'skinsense-clinical-progression-filtered'
          : 'skinsense-clinical-progression',
    });

    setIsBackupMenuOpen(false);
    const notice = `Exported ${result.scanCount} scan${result.scanCount === 1 ? '' : 's'} & ${result.comparisonCount} progression record${result.comparisonCount === 1 ? '' : 's'} (${result.filename})`;
    setLastBackupNotice(notice);
    window.setTimeout(() => {
      setLastBackupNotice((prev) => (prev === notice ? null : prev));
    }, 4500);
  };

  const handleGenerateCasePdf = async (lesionCase: LesionCase) => {
    setGeneratingCasePdfId(lesionCase.id);
    try {
      const caseScans = scans.filter((s) => s.caseId === lesionCase.id);
      const caseComparisons = comparisons.filter((cmp) => cmp.caseId === lesionCase.id);
      const longitudinalUrl = lesionCase.shareEnabled
        ? getLongitudinalUrl(lesionCase.shareToken)
        : undefined;
      await generateCasePdfReport(
        lesionCase,
        caseScans,
        caseComparisons,
        longitudinalUrl,
        user.fullName
      );
    } finally {
      setGeneratingCasePdfId(null);
    }
  };

  const handleGenerateMonthlyPdf = async () => {
    if (!activeMonthKey) return;
    setIsGeneratingMonthlyPdf(true);
    try {
      const monthlyScans = scans.filter((s) => toLocalMonthKey(s.createdAt) === activeMonthKey);
      const monthlyComparisons = comparisons.filter(
        (cmp) => toLocalMonthKey(cmp.createdAt) === activeMonthKey
      );
      await generateMonthlySummaryPdfReport({
        monthKey: activeMonthKey,
        monthLabel: activeMonthMeta?.label || formatMonthLabel(activeMonthKey),
        scans: monthlyScans,
        comparisons: monthlyComparisons,
        cases,
        patientName: user.fullName,
        patientEmail: user.email,
      });
    } finally {
      setIsGeneratingMonthlyPdf(false);
    }
  };

  const hasExportableData = scans.length > 0 || comparisons.length > 0;
  const hasMonthlyData =
    (activeMonthMeta?.scansCount || 0) > 0 || (activeMonthMeta?.comparisonsCount || 0) > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-6 border-b border-slate-200 flex flex-col xl:flex-row xl:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            History Reports &amp; Longitudinal Links
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Review past dermatological screenings, manage shareable longitudinal case URLs, and export clinical PDFs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="text-xs font-mono text-slate-500 tabular-nums mr-1">
            {scans.length} Scan{scans.length === 1 ? '' : 's'} · {comparisons.length} Comparison
            {comparisons.length === 1 ? '' : 's'} · {cases.length} Case{cases.length === 1 ? '' : 's'}
            {sessionDurationStats.avgSeconds !== null
              ? ` · Avg Session ${formatDurationLabel(sessionDurationStats.avgSeconds)}`
              : ''}
          </div>

          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1">
            <Calendar className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
            <select
              aria-label="Select month for summary PDF report"
              value={activeMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              className="text-xs font-medium text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            >
              {availableMonths.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label} ({m.scansCount}s / {m.comparisonsCount}c)
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => void handleGenerateMonthlyPdf()}
            disabled={!hasMonthlyData || isGeneratingMonthlyPdf}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
          >
            {isGeneratingMonthlyPdf ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Monthly Summary PDF</span>
              </>
            )}
          </button>

          <div className="inline-flex items-center gap-1.5">
            <div ref={backupMenuRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsBackupInfoOpen(false);
                  setIsBackupMenuOpen((prev) => !prev);
                }}
                disabled={!hasExportableData}
                aria-haspopup="menu"
                aria-expanded={isBackupMenuOpen}
                title="Export all scanned data, cases, analysis records, and comparisons for local backup"
                className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                <span>Export Backup</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              </button>

              {isBackupMenuOpen && (
                <div
                  role="menu"
                  aria-label="Export local backup format"
                  className="absolute right-0 mt-1.5 w-72 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-30 space-y-1"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportBackup('json')}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 cursor-pointer transition-colors"
                  >
                    <FileJson className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">Export JSON Backup (.json)</div>
                      <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        Full structured archive of cases, scan images, morphology, reminders &amp; comparisons.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportBackup('csv')}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 cursor-pointer transition-colors"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">Export CSV Backup (.csv)</div>
                      <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        Tabular spreadsheet backup of all scan analysis &amp; progression comparison records.
                      </div>
                    </div>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => handleExportClinicalCsv('all')}
                    className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-slate-50 flex items-start gap-2.5 cursor-pointer transition-colors border-t border-slate-100"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-indigo-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-slate-900">
                        Export Clinical Research CSV (.csv)
                      </div>
                      <div className="text-[11px] text-slate-500 leading-snug mt-0.5">
                        Normalized longitudinal dataset with visit sequence, interval days, ABCDE morphology &amp; deltas for research/DB import.
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <div
              ref={backupInfoRef}
              className="relative"
              onMouseEnter={() => {
                if (!isBackupMenuOpen) setIsBackupInfoOpen(true);
              }}
              onMouseLeave={() => setIsBackupInfoOpen(false)}
            >
              <button
                type="button"
                onClick={() => {
                  setIsBackupMenuOpen(false);
                  setIsBackupInfoOpen((prev) => !prev);
                }}
                aria-label="What is included in JSON and CSV exports"
                aria-expanded={isBackupInfoOpen}
                aria-describedby={isBackupInfoOpen ? 'export-backup-format-info' : undefined}
                title="JSON exports include full cases, images, analysis, reminders, and comparisons. CSV exports provide a spreadsheet table of all scan and comparison records."
                className="p-1.5 text-slate-500 hover:text-teal-700 bg-white border border-slate-300 hover:border-teal-300 rounded-lg transition-colors cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" aria-hidden="true" />
              </button>

              {isBackupInfoOpen && (
                <div
                  id="export-backup-format-info"
                  role="tooltip"
                  className="absolute right-0 mt-1.5 w-80 bg-white border border-slate-200 rounded-xl shadow-lg p-3.5 z-30 text-xs text-slate-600 space-y-2"
                >
                  <div className="font-semibold text-slate-900">Export Backup Formats</div>
                  <div className="space-y-1.5 leading-relaxed">
                    <p>
                      <span className="font-semibold text-slate-800">JSON (.json):</span> Complete structured archive
                      containing cases, scan records &amp; images, full AI analysis (morphology, differentials, red
                      flags, quality metrics), comparisons, and follow-up reminders.
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">CSV Backup (.csv):</span> Spreadsheet-ready table of
                      all scans and progression comparisons with confidence, severity, image quality, session duration,
                      symptoms, notes, tags, and recommendations.
                    </p>
                    <p>
                      <span className="font-semibold text-slate-800">Clinical Research CSV (.csv):</span>{' '}
                      Database-normalized dataset with chronological visit numbers, days since baseline/previous scan,
                      numeric severity &amp; progression tiers, broken-out ABCDE morphology, and comparison deltas.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {lastBackupNotice && (
            <span className="text-xs font-medium text-emerald-700 flex items-center gap-1 whitespace-nowrap">
              <Check className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{lastBackupNotice}</span>
            </span>
          )}
        </div>
      </div>

      {/* Daily Skin Health Check-in Temporary Tasks Dashboard Widget */}
      <section
        aria-labelledby="daily-checkin-dashboard-heading"
        className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4 text-teal-700" aria-hidden="true" />
              <h2 id="daily-checkin-dashboard-heading" className="text-base font-bold text-slate-900">
                Daily Skin Health Check-in · Temporary Tasks
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Temporary session tasks for new or changed lesions logged during today&apos;s skin health check-in.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {dailyCheckInTasks.filter((t) => !t.completed).length} Pending · {dailyCheckInTasks.length} Total
            </span>
            <button
              type="button"
              onClick={onOpenDailyCheckIn}
              className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Log Check-in</span>
            </button>
            {dailyCheckInTasks.length > 0 && (
              <button
                type="button"
                onClick={onClearCheckInTasks}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 bg-slate-50 hover:bg-rose-50 border border-slate-200 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear Temporary</span>
              </button>
            )}
          </div>
        </div>

        {dailyCheckInTasks.length === 0 ? (
          <div className="p-4 border border-dashed border-slate-300 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
            <span>No new or changed lesions logged in today&apos;s temporary check-in queue.</span>
            <button
              type="button"
              onClick={onOpenDailyCheckIn}
              className="text-teal-700 hover:text-teal-900 font-semibold cursor-pointer whitespace-nowrap self-start sm:self-auto"
            >
              Open Daily Check-in
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {dailyCheckInTasks.map((task) => (
              <div
                key={task.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  task.completed ? 'bg-slate-50/70' : 'bg-white'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={() => onToggleCheckInTask(task.id)}
                    aria-label={task.completed ? 'Reopen temporary check-in task' : 'Complete temporary check-in task'}
                    className="mt-0.5 text-slate-500 hover:text-teal-700 cursor-pointer shrink-0"
                  >
                    {task.completed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />
                    ) : (
                      <Circle className="w-4 h-4" aria-hidden="true" />
                    )}
                  </button>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`font-semibold text-sm ${
                          task.completed ? 'line-through text-slate-500' : 'text-slate-900'
                        }`}
                      >
                        {task.title}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span
                        className={`font-medium ${
                          task.lesionStatus === 'new' ? 'text-teal-700' : 'text-amber-700'
                        }`}
                      >
                        {task.lesionStatus === 'new' ? 'New Lesion' : 'Changed Lesion'}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-slate-600">{task.bodyLocation}</span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="font-mono tabular-nums text-slate-500">
                        Temporary ({task.checkInDate})
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">{task.observedChange}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 pl-7 sm:pl-0">
                  {!task.completed && (
                    <button
                      type="button"
                      onClick={() => onStartCheckInScan(task)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Capture Scan</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onDeleteCheckInTask(task.id)}
                    aria-label="Remove temporary check-in task"
                    className="p-1.5 text-rose-700 hover:bg-rose-50 rounded-md cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Follow-Up Scheduling & Upcoming Tasks Dashboard Widget */}
      <FollowUpScheduleWidget
        cases={cases}
        reminders={reminders}
        onReminderCreated={onReminderCreated}
        onReminderUpdated={onReminderUpdated}
        onReminderDeleted={onReminderDeleted}
        onStartFollowUpScan={onStartFollowUpScan}
      />

      {/* Predictive Risk Notifications (Comparison Rate-of-Change Threshold Monitor) */}
      <section
        aria-label="Predictive Risk Notifications"
        className={`rounded-xl border p-5 space-y-4 ${
          visiblePredictiveAlerts.length > 0
            ? 'bg-amber-50/70 border-amber-300'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <BellRing
                className={`w-4 h-4 shrink-0 ${
                  visiblePredictiveAlerts.length > 0 ? 'text-amber-700' : 'text-teal-700'
                }`}
                aria-hidden="true"
              />
              <h2 className="text-base font-bold text-slate-900">
                Predictive Risk Monitor · Comparison Rate of Change
              </h2>
              {visiblePredictiveAlerts.length > 0 ? (
                <span className="text-xs font-semibold text-amber-800 font-mono tabular-nums">
                  · {visiblePredictiveAlerts.length} Lesion
                  {visiblePredictiveAlerts.length === 1 ? '' : 's'} Exceeding Threshold
                </span>
              ) : (
                <span className="text-xs font-medium text-emerald-700">
                  · Within Safe Threshold
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600">
              Monitors historical comparison velocity (change pts/week across interval duration &amp; severity transitions) to flag potential dermatologist review.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <label htmlFor="rate-threshold-select" className="text-xs font-medium text-slate-600 whitespace-nowrap">
              Rate Threshold:
            </label>
            <select
              id="rate-threshold-select"
              value={rateThresholdPerWeek}
              onChange={(e) => handleThresholdChange(Number(e.target.value))}
              className="px-2.5 py-1.5 text-xs font-mono font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600 cursor-pointer"
            >
              <option value={10}>10 pts/wk (Strict)</option>
              <option value={20}>20 pts/wk (Clinical Default)</option>
              <option value={30}>30 pts/wk (Moderate)</option>
              <option value={45}>45 pts/wk (High Velocity)</option>
            </select>

            {acknowledgedComparisonIds.length > 0 && (
              <button
                type="button"
                onClick={() => setAcknowledgedComparisonIds([])}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-300 rounded-lg cursor-pointer whitespace-nowrap"
              >
                Restore Acknowledged ({acknowledgedComparisonIds.length})
              </button>
            )}
          </div>
        </div>

        {predictiveRiskSummary.monitoredCaseCount === 0 ? (
          <div className="p-3.5 bg-slate-50 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
            No longitudinal comparisons recorded yet. Run a scan comparison in the Compare tab to activate rate-of-change risk predictions.
          </div>
        ) : visiblePredictiveAlerts.length === 0 ? (
          <div className="p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg flex items-center gap-2 text-xs text-emerald-900">
            <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
            <span>
              All {predictiveRiskSummary.monitoredCaseCount} monitored lesion case
              {predictiveRiskSummary.monitoredCaseCount === 1 ? '' : 's'} remain below the{' '}
              <span className="font-mono font-semibold">{rateThresholdPerWeek} pts/wk</span> rate-of-change threshold.
            </span>
          </div>
        ) : (
          <div className="divide-y divide-amber-200 border border-amber-200 bg-white rounded-lg">
            {visiblePredictiveAlerts.map((alert) => {
              const isPriority = alert.reviewUrgency === 'priority';
              return (
                <div
                  key={alert.caseId}
                  className={`p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-4 ${
                    isPriority ? 'bg-rose-50/40' : 'bg-amber-50/30'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider ${
                          isPriority ? 'text-rose-700' : 'text-amber-800'
                        }`}
                      >
                        <Stethoscope className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>
                          {isPriority
                            ? 'Priority Dermatologist Review'
                            : 'Dermatologist Review Recommended'}
                        </span>
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-sm font-bold text-slate-900">{alert.caseTitle}</span>
                      <span className="text-xs text-slate-500">({alert.bodyLocation})</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums">
                      <span
                        className={`font-bold flex items-center gap-1 ${
                          isPriority ? 'text-rose-700' : 'text-amber-800'
                        }`}
                      >
                        <Activity className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>Velocity: {alert.rateOfChangePerWeek.toFixed(1)} pts/wk</span>
                      </span>
                      <span className="text-slate-500">
                        Threshold: {alert.thresholdPerWeek} pts/wk
                      </span>
                      <span className="text-slate-500">
                        Interval: {alert.intervalDays}d ({alert.comparisonCount} cmp)
                      </span>
                      <span className="uppercase font-semibold text-slate-700">
                        {alert.latestProgressionStatus}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{alert.summaryReason}</p>
                    {alert.visualChangeHighlight && (
                      <p className="text-[11px] text-slate-500 truncate">
                        Observed Deltas: {alert.visualChangeHighlight}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onJumpToCompare(alert.latestScanId)}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <GitCompareArrows className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Review Comparison</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setChartCaseId(alert.caseId);
                        setSelectedScanId(alert.latestScanId);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      Inspect Chart
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleScheduleDermReview(alert.caseId, alert.rateOfChangePerWeek)}
                      disabled={schedulingCaseId === alert.caseId}
                      className="px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {schedulingCaseId === alert.caseId ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : scheduledCaseNotice === alert.caseId ? (
                        <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                      ) : (
                        <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {scheduledCaseNotice === alert.caseId
                          ? 'Review Scheduled'
                          : 'Schedule Derm Review'}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setAcknowledgedComparisonIds((prev) =>
                          prev.includes(alert.latestComparisonId)
                            ? prev
                            : [...prev, alert.latestComparisonId]
                        )
                      }
                      aria-label={`Acknowledge risk notification for ${alert.caseTitle}`}
                      title="Acknowledge notification"
                      className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md cursor-pointer"
                    >
                      <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Trend Alert Banner (Last 3 Scans Escalation) */}
      {activeTrendAlerts.length > 0 && (
        <section
          aria-label="Lesion Trend Alerts"
          className="bg-rose-50 border border-rose-300 rounded-xl p-5 space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-rose-900">
              <AlertTriangle className="w-5 h-5 text-rose-700 shrink-0" aria-hidden="true" />
              <h2 className="text-base font-bold">
                Trend Alert: Escalating Risk Across Last 3 Scans ({activeTrendAlerts.length} Lesion
                {activeTrendAlerts.length === 1 ? '' : 's'})
              </h2>
            </div>
            <span className="text-xs font-mono text-rose-800">
              Evaluated over most recent 3 scans per lesion
            </span>
          </div>

          <div className="divide-y divide-rose-200 border border-rose-200 bg-white rounded-lg">
            {activeTrendAlerts.map((alert) => (
              <div
                key={alert.caseId}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-rose-50/40"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-rose-950">
                    <span>{alert.caseTitle}</span>
                    <span className="text-xs font-normal text-rose-800">· {alert.bodyLocation}</span>
                  </div>
                  <p className="text-xs font-mono text-rose-800">{alert.summaryText}</p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setChartCaseId(alert.caseId);
                    setSelectedScanId(alert.latestScanId);
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-rose-700 hover:bg-rose-800 rounded-md cursor-pointer whitespace-nowrap shrink-0"
                >
                  Inspect Lesion &amp; Chart
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Longitudinal URL Links Directory */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-teal-700" aria-hidden="true" />
            <h2 className="text-base font-bold text-slate-900">Longitudinal Case URL Links</h2>
          </div>
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
            <span>Revocable tokenized clinician access</span>
          </span>
        </div>

        {cases.length === 0 ? (
          <p className="text-sm text-slate-500">No tracked lesion cases yet. Run a scan to generate a longitudinal URL.</p>
        ) : (
          <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
            {cases.map((c) => {
              const caseScansCount = scans.filter((s) => s.caseId === c.id).length;
              const url = getLongitudinalUrl(c.shareToken);
              const caseAlert = trendAlertsByCase.get(c.id);
              const casePredictiveAlert = predictiveRiskSummary.byCaseId.get(c.id);
              return (
                <div
                  key={c.id}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                    caseAlert ? 'bg-rose-50/70' : ''
                  }`}
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-900">
                      <span className={caseAlert ? 'text-rose-950' : ''}>{c.title}</span>
                      <span className="text-xs font-normal text-slate-500">
                        · {c.bodyLocation} · <span className="font-mono tabular-nums">{caseScansCount} scans</span>
                      </span>
                      {caseAlert && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700">
                          <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Trend Alert</span>
                        </span>
                      )}
                      {casePredictiveAlert && (
                        <span
                          className={`inline-flex items-center gap-1 text-xs font-semibold font-mono ${
                            casePredictiveAlert.reviewUrgency === 'priority'
                              ? 'text-rose-700'
                              : 'text-amber-700'
                          }`}
                        >
                          <Activity className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            Derm Review ({casePredictiveAlert.rateOfChangePerWeek.toFixed(1)} pts/wk)
                          </span>
                        </span>
                      )}
                    </div>
                    {caseAlert && (
                      <div className="text-xs font-medium text-rose-800">{caseAlert.summaryText}</div>
                    )}
                    <div className="text-xs font-mono text-teal-800 truncate">
                      {c.shareEnabled ? url : 'Sharing disabled (private to your account)'}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleCopyUrl(c)}
                      disabled={!c.shareEnabled}
                      className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-50 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {copiedCaseId === c.id ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Copy URL</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => onOpenLongitudinalLink(c.shareToken)}
                      disabled={!c.shareEnabled}
                      className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 rounded-md hover:bg-teal-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Open Timeline</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleGenerateCasePdf(c)}
                      disabled={generatingCasePdfId === c.id || caseScansCount === 0}
                      className="px-3 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-md flex items-center gap-1.5 cursor-pointer disabled:opacity-40 whitespace-nowrap"
                    >
                      {generatingCasePdfId === c.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Case PDF</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRegenerateToken(c)}
                      disabled={busyCaseId === c.id}
                      title="Rotate share link token"
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Rotate</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleToggleShare(c)}
                      disabled={busyCaseId === c.id}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer whitespace-nowrap"
                    >
                      {c.shareEnabled ? 'Disable Link' : 'Enable Link'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* D3.js Lesion Progression Chart */}
      <LesionProgressionChart
        cases={cases}
        scans={scans}
        selectedCaseId={chartCaseId || cases[0]?.id || ''}
        onSelectCaseId={setChartCaseId}
        onSelectScanId={(scanId) => setSelectedScanId(scanId)}
        trendAlertsByCase={trendAlertsByCase}
      />

      {/* Filter Bar & Reports Split */}
      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left List */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-4 border-b border-slate-200 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <label htmlFor="history-scan-search" className="text-xs font-bold text-slate-900">
                  {scanViewMode === 'gallery' ? 'Thumbnail Gallery' : 'Scan History List'}
                </label>
                <span className="text-xs font-mono text-slate-500 tabular-nums">
                  {filteredScans.length} of {scans.length} scan{scans.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleExportClinicalCsv('filtered')}
                  disabled={filteredScans.length === 0 && comparisons.length === 0}
                  title="Export the displayed scan list and historical lesion progression data as a research/clinical CSV file"
                  className="px-2.5 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>{hasActiveFilter ? 'Export Filtered CSV' : 'Export Clinical CSV'}</span>
                </button>

                <div
                  role="group"
                  aria-label="Scan history view mode"
                  className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                >
                  <button
                    type="button"
                    onClick={() => setScanViewMode('list')}
                    aria-pressed={scanViewMode === 'list'}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      scanViewMode === 'list'
                        ? 'bg-white text-slate-900 font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>List</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setScanViewMode('gallery')}
                    aria-pressed={scanViewMode === 'gallery'}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                      scanViewMode === 'gallery'
                        ? 'bg-white text-teal-800 font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Thumbnail Gallery</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="history-scan-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by date (YYYY-MM-DD), lesion name, or clinical note keywords..."
                className="w-full pl-9 pr-9 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
              {searchQuery && (
                <button
                  type="button"
                  aria-label="Clear scan search"
                  onClick={() => setSearchQuery('')}
                  className="p-1 text-slate-400 hover:text-slate-700 absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                >
                  <X className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              {(['all', 'routine', 'monitor', 'urgent'] as const).map((sev) => (
                <button
                  key={sev}
                  type="button"
                  onClick={() => setSeverityFilter(sev)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md capitalize cursor-pointer whitespace-nowrap ${
                    severityFilter === sev
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {sev}
                </button>
              ))}
            </div>
          </div>

          {filteredScans.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500 space-y-3">
              <p>No screening reports match your current search or severity filter.</p>
              {hasActiveFilter && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setSeverityFilter('all');
                  }}
                  className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md cursor-pointer"
                >
                  Reset Search &amp; Filters
                </button>
              )}
            </div>
          ) : scanViewMode === 'gallery' ? (
            <div
              role="region"
              aria-label="Lesion Thumbnail Gallery"
              className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[540px] overflow-y-auto"
            >
              {filteredScans.map((scan) => {
                const isSelected = selectedScan?.id === scan.id;
                const scanCaseAlert = trendAlertsByCase.get(scan.caseId);
                const severityColorClass =
                  scan.analysis.severityLevel === 'urgent'
                    ? 'text-rose-700'
                    : scan.analysis.severityLevel === 'monitor'
                      ? 'text-amber-700'
                      : 'text-emerald-700';

                return (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => {
                      setSelectedScanId(scan.id);
                      setChartCaseId(scan.caseId);
                    }}
                    aria-pressed={isSelected}
                    className={`group text-left rounded-xl border overflow-hidden transition-all cursor-pointer flex flex-col bg-white ${
                      isSelected
                        ? scanCaseAlert
                          ? 'border-rose-600 ring-2 ring-rose-500/30 bg-rose-50/40'
                          : 'border-teal-700 ring-2 ring-teal-700/25 bg-teal-50/30'
                        : scanCaseAlert
                          ? 'border-rose-300 bg-rose-50/30 hover:border-rose-400'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    <div className="w-full aspect-square bg-slate-100 overflow-hidden border-b border-slate-200/80">
                      <img
                        src={scan.imageDataUrl}
                        alt={`${scan.caseTitle} — ${scan.analysis.primaryCondition}`}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-200"
                      />
                    </div>
                    <div className="p-2.5 space-y-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-semibold text-slate-900 truncate">
                          {scan.analysis.primaryCondition}
                        </span>
                        {scanCaseAlert && (
                          <AlertTriangle
                            className="w-3.5 h-3.5 text-rose-600 shrink-0"
                            aria-label="Trend alert active"
                          />
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {scan.caseTitle} · {scan.bodyLocation}
                      </div>
                      <div className="flex items-center justify-between gap-1 text-[11px] font-mono tabular-nums pt-0.5">
                        <span className="text-slate-500">
                          {new Date(scan.createdAt).toLocaleDateString()}
                        </span>
                        <span className={`font-semibold uppercase ${severityColorClass}`}>
                          {scan.analysis.confidenceScore}% · {scan.analysis.severityLevel}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="divide-y divide-slate-200 max-h-[540px] overflow-y-auto">
              {filteredScans.map((scan) => {
                const isSelected = selectedScan?.id === scan.id;
                const scanCaseAlert = trendAlertsByCase.get(scan.caseId);
                const isFlaggedScan = Boolean(
                  scanCaseAlert && scanCaseAlert.flaggedScanIds.includes(scan.id)
                );
                return (
                  <button
                    key={scan.id}
                    type="button"
                    onClick={() => {
                      setSelectedScanId(scan.id);
                      setChartCaseId(scan.caseId);
                    }}
                    className={`w-full text-left p-4 flex items-center gap-4 transition-colors cursor-pointer ${
                      scanCaseAlert
                        ? isSelected
                          ? 'bg-rose-100/80'
                          : 'bg-rose-50/70 hover:bg-rose-100/60'
                        : isSelected
                          ? 'bg-teal-50/60'
                          : 'hover:bg-slate-50'
                    }`}
                  >
                    <img
                      src={scan.imageDataUrl}
                      alt={scan.analysis.primaryCondition}
                      referrerPolicy="no-referrer"
                      className={`w-16 h-16 rounded-lg object-cover border shrink-0 bg-slate-100 ${
                        scanCaseAlert ? 'border-rose-300' : 'border-slate-200'
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-sm font-semibold truncate ${
                            scanCaseAlert ? 'text-rose-950' : 'text-slate-900'
                          }`}
                        >
                          {scan.analysis.primaryCondition}
                        </span>
                        {scanCaseAlert && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{isFlaggedScan ? 'Trend Alert' : 'Case Alert'}</span>
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 truncate">
                        {scan.caseTitle} · {scan.bodyLocation}
                      </div>
                      <div className="text-xs font-mono text-slate-600 mt-1 tabular-nums">
                        {new Date(scan.createdAt).toLocaleDateString()} · Confidence{' '}
                        <span
                          className={`font-semibold ${
                            scanCaseAlert ? 'text-rose-700' : 'text-teal-700'
                          }`}
                        >
                          {scan.analysis.confidenceScore}%
                        </span>{' '}
                        · <span className="uppercase">{scan.analysis.severityLevel}</span>
                        {scan.metadata?.sessionDurationSeconds ? (
                          <span> · {formatDurationLabel(scan.metadata.sessionDurationSeconds)}</span>
                        ) : null}
                      </div>
                      {scan.tags && scan.tags.length > 0 && (
                        <div className="text-[11px] font-mono text-teal-800 mt-1 truncate">
                          {scan.tags.join(' · ')}
                        </div>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detail Inspector */}
        <div className="lg:col-span-6">
          {!selectedScan ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center text-sm text-slate-500">
              Select a report from your history list to inspect details or generate a PDF.
            </div>
          ) : (
            <div
              className={`bg-white border rounded-xl p-6 space-y-5 ${
                trendAlertsByCase.has(selectedScan.caseId)
                  ? 'border-rose-300'
                  : 'border-slate-200'
              }`}
            >
              {(() => {
                const detailAlert = trendAlertsByCase.get(selectedScan.caseId);
                if (!detailAlert) return null;
                return (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-start gap-2.5 text-xs text-rose-900">
                    <AlertTriangle className="w-4 h-4 text-rose-700 mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <div className="font-bold">Trend Alert Active for {detailAlert.caseTitle}</div>
                      <div className="text-rose-800 mt-0.5">{detailAlert.summaryText}</div>
                    </div>
                  </div>
                );
              })()}
              <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
                <div>
                  <div className="text-xs font-mono text-slate-500">
                    {new Date(selectedScan.createdAt).toLocaleString()} · ID {selectedScan.id}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mt-1">
                    {selectedScan.analysis.primaryCondition}
                  </h3>
                  <div className="text-xs text-slate-600 mt-0.5">
                    {selectedScan.caseTitle} · {selectedScan.bodyLocation}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-medium text-slate-500">Confidence</div>
                  <div
                    className={`text-2xl font-mono font-bold tabular-nums ${
                      trendAlertsByCase.has(selectedScan.caseId) ? 'text-rose-700' : 'text-teal-700'
                    }`}
                  >
                    {selectedScan.analysis.confidenceScore}%
                  </div>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 items-center">
                <img
                  src={selectedScan.imageDataUrl}
                  alt={selectedScan.analysis.primaryCondition}
                  referrerPolicy="no-referrer"
                  className="w-full aspect-square object-cover rounded-lg border border-slate-200 bg-slate-950"
                />
                <div className="space-y-3">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[11px] font-medium text-slate-500">Image Quality &amp; Session Metadata</div>
                    <div className="text-sm font-mono font-semibold text-slate-900 tabular-nums mt-1">
                      Overall {selectedScan.qualityMetrics.overallScore}/100 ({selectedScan.qualityMetrics.status})
                    </div>
                    <div className="text-xs font-mono text-slate-600 mt-1 tabular-nums">
                      Sharpness {selectedScan.qualityMetrics.sharpnessScore} · Light{' '}
                      {selectedScan.qualityMetrics.brightnessScore} · Contrast{' '}
                      {selectedScan.qualityMetrics.contrastScore}
                    </div>
                    <div className="text-xs font-mono text-teal-800 mt-1 tabular-nums">
                      Analysis Session Duration:{' '}
                      {formatDurationLabel(selectedScan.metadata?.sessionDurationSeconds)}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="text-[11px] font-medium text-slate-500">Problem Checking Message</div>
                    <p className="text-xs text-slate-800 mt-1 leading-relaxed">
                      {selectedScan.analysis.problemCheckingMessage}
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-700 leading-relaxed">{selectedScan.analysis.clinicalSummary}</p>

              {(selectedScan.symptoms ||
                selectedScan.customNotes ||
                (selectedScan.tags && selectedScan.tags.length > 0)) && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                  <div className="text-[11px] font-medium text-slate-500">
                    Recorded Symptoms, Custom Notes &amp; Tags
                  </div>
                  {selectedScan.tags && selectedScan.tags.length > 0 && (
                    <div className="text-xs font-mono text-teal-800">
                      Tags: {selectedScan.tags.join(' · ')}
                    </div>
                  )}
                  {selectedScan.symptoms && (
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <span className="font-semibold text-slate-900">Symptoms: </span>
                      {selectedScan.symptoms}
                    </p>
                  )}
                  {selectedScan.customNotes && (
                    <p className="text-xs text-slate-700 leading-relaxed">
                      <span className="font-semibold text-slate-900">Custom Notes: </span>
                      {selectedScan.customNotes}
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    const parentCase = cases.find((c) => c.id === selectedScan.caseId);
                    void generateScanPdfReport(
                      selectedScan,
                      parentCase ? getLongitudinalUrl(parentCase.shareToken) : undefined,
                      user.fullName
                    );
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Scan PDF</span>
                </button>

                {(() => {
                  const parentCase = cases.find((c) => c.id === selectedScan.caseId);
                  if (!parentCase) return null;
                  return (
                    <button
                      type="button"
                      onClick={() => void handleGenerateCasePdf(parentCase)}
                      disabled={generatingCasePdfId === parentCase.id}
                      className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {generatingCasePdfId === parentCase.id ? 'Generating...' : 'Full Case PDF'}
                      </span>
                    </button>
                  );
                })()}

                <button
                  type="button"
                  onClick={() =>
                    isSpeaking
                      ? stop()
                      : speak(
                          `${selectedScan.analysis.voiceSummary} ${selectedScan.analysis.problemCheckingMessage}`,
                          selectedLanguage,
                          selectedScan.analysis.languageCode
                        )
                  }
                  disabled={isLoadingAudio}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                  <span>{isSpeaking ? 'Stop Voice' : 'Read Aloud'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => onJumpToCompare(selectedScan.id)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <GitCompareArrows className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  <span>Compare</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteScan(selectedScan.id)}
                  className="ml-auto px-3 py-2 text-xs font-medium text-rose-700 hover:bg-rose-50 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
