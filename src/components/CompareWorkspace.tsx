import {
  AlertTriangle,
  FileDown,
  GitCompareArrows,
  Loader2,
  MoveHorizontal,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { LesionCase, LongitudinalComparison, SkinScanRecord } from '../types';
import { SUPPORTED_LANGUAGES } from '../types';
import { api } from '../utils/api';
import { generateComparisonPdfReport } from '../utils/pdfReport';
import { useMultilingualSpeaker } from '../utils/voicePlayer';

interface CompareWorkspaceProps {
  scans: SkinScanRecord[];
  cases: LesionCase[];
  comparisons: LongitudinalComparison[];
  initialCurrentScanId?: string | null;
  selectedLanguage: string;
  onLanguageChange: (code: string) => void;
  onComparisonCreated: (cmp: LongitudinalComparison) => void;
}

export function CompareWorkspace({
  scans,
  cases,
  comparisons,
  initialCurrentScanId,
  selectedLanguage,
  onLanguageChange,
  onComparisonCreated,
}: CompareWorkspaceProps) {
  const chronological = [...scans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  const [previousScanId, setPreviousScanId] = useState<string>(chronological[0]?.id || '');
  const [currentScanId, setCurrentScanId] = useState<string>(
    initialCurrentScanId || chronological[chronological.length - 1]?.id || ''
  );

  const [viewMode, setViewMode] = useState<'side-by-side' | 'slider'>('side-by-side');
  const [sliderPercent, setSliderPercent] = useState<number>(50);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [activeComparison, setActiveComparison] = useState<LongitudinalComparison | null>(
    comparisons[0] || null
  );

  const { speak, stop, isLoadingAudio, isSpeaking } = useMultilingualSpeaker();

  useEffect(() => {
    if (initialCurrentScanId) {
      setCurrentScanId(initialCurrentScanId);
      const curr = scans.find((s) => s.id === initialCurrentScanId);
      if (curr) {
        const earlier = chronological.find(
          (s) => s.id !== curr.id && s.caseId === curr.caseId
        ) || chronological.find((s) => s.id !== curr.id);
        if (earlier) setPreviousScanId(earlier.id);
      }
    }
  }, [initialCurrentScanId]);

  const prevScan = scans.find((s) => s.id === previousScanId);
  const currScan = scans.find((s) => s.id === currentScanId);

  const handleRunComparison = async () => {
    if (!prevScan || !currScan) return;
    if (prevScan.id === currScan.id) {
      setCompareError('Please select two different scans to compare progression.');
      return;
    }
    setCompareError(null);
    setIsComparing(true);
    try {
      const { comparison } = await api.compareScans({
        previousScanId: prevScan.id,
        currentScanId: currScan.id,
        languageCode: selectedLanguage,
      });
      setActiveComparison(comparison);
      onComparisonCreated(comparison);
    } catch (err) {
      setCompareError(err instanceof Error ? err.message : 'Comparison failed.');
    } finally {
      setIsComparing(false);
    }
  };

  if (scans.length < 2) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-2xl mx-auto mt-6">
        <GitCompareArrows className="w-10 h-10 text-slate-300 mx-auto mb-3" aria-hidden="true" />
        <h2 className="text-lg font-bold text-slate-900">Two Scans Required for Longitudinal Comparison</h2>
        <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
          You currently have {scans.length} saved scan{scans.length === 1 ? '' : 's'}. Capture or upload a second scan
          in the Analyze tab to compare visual progression over time.
        </p>
      </div>
    );
  }

  const matchedCase = currScan ? cases.find((c) => c.id === currScan.caseId) : undefined;
  const longitudinalUrl = matchedCase
    ? `${window.location.origin}/?case=${encodeURIComponent(matchedCase.shareToken)}`
    : undefined;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Longitudinal Image Comparison
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Compare a previous baseline photograph against a current follow-up scan to detect morphological evolution.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setViewMode('side-by-side')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                viewMode === 'side-by-side'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              onClick={() => setViewMode('slider')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                viewMode === 'slider'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Split Slider
            </button>
          </div>

          <select
            aria-label="Comparison language"
            value={selectedLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg text-slate-800"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Scan Selectors */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 grid md:grid-cols-12 gap-4 items-end">
        <div className="md:col-span-5">
          <label htmlFor="prev-scan-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Previous Baseline Scan
          </label>
          <select
            id="prev-scan-select"
            value={previousScanId}
            onChange={(e) => setPreviousScanId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          >
            {chronological.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.createdAt).toLocaleDateString()} · {s.caseTitle} · {s.analysis.primaryCondition}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-5">
          <label htmlFor="curr-scan-select" className="block text-xs font-semibold text-slate-700 mb-1.5">
            Current Follow-Up Scan
          </label>
          <select
            id="curr-scan-select"
            value={currentScanId}
            onChange={(e) => setCurrentScanId(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
          >
            {chronological.map((s) => (
              <option key={s.id} value={s.id}>
                {new Date(s.createdAt).toLocaleDateString()} · {s.caseTitle} · {s.analysis.primaryCondition}
              </option>
            ))}
          </select>
        </div>

        <div className="md:col-span-2">
          <button
            type="button"
            onClick={handleRunComparison}
            disabled={isComparing || !prevScan || !currScan}
            className="w-full py-2.5 px-4 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {isComparing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                <span>Comparing</span>
              </>
            ) : (
              <span>Compare AI</span>
            )}
          </button>
        </div>
      </div>

      {compareError && (
        <div role="alert" className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
          {compareError}
        </div>
      )}

      {/* Visual Comparison Stage */}
      {prevScan && currScan && (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          {viewMode === 'side-by-side' ? (
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">Previous Baseline</span>
                  <span className="font-mono text-slate-500">
                    {new Date(prevScan.createdAt).toLocaleDateString()} · {prevScan.analysis.confidenceScore}% conf.
                  </span>
                </div>
                <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                  <img
                    src={prevScan.imageDataUrl}
                    alt="Previous baseline skin image"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-xs text-slate-700">
                  <span className="font-semibold">{prevScan.analysis.primaryCondition}</span> · Quality{' '}
                  <span className="font-mono">{prevScan.qualityMetrics.overallScore}/100</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-900">Current Follow-Up</span>
                  <span className="font-mono text-slate-500">
                    {new Date(currScan.createdAt).toLocaleDateString()} · {currScan.analysis.confidenceScore}% conf.
                  </span>
                </div>
                <div className="aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-950">
                  <img
                    src={currScan.imageDataUrl}
                    alt="Current follow-up skin image"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="text-xs text-slate-700">
                  <span className="font-semibold">{currScan.analysis.primaryCondition}</span> · Quality{' '}
                  <span className="font-mono">{currScan.qualityMetrics.overallScore}/100</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Left: Previous Baseline ({new Date(prevScan.createdAt).toLocaleDateString()})</span>
                <span className="flex items-center gap-1 font-mono">
                  <MoveHorizontal className="w-3.5 h-3.5" aria-hidden="true" /> {sliderPercent}%
                </span>
                <span>Right: Current Follow-Up ({new Date(currScan.createdAt).toLocaleDateString()})</span>
              </div>

              <div className="relative max-w-xl mx-auto aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-950 select-none">
                <img
                  src={currScan.imageDataUrl}
                  alt="Current follow-up"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{ clipPath: `inset(0 ${100 - sliderPercent}% 0 0)` }}
                >
                  <img
                    src={prevScan.imageDataUrl}
                    alt="Previous baseline"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white shadow-md pointer-events-none"
                  style={{ left: `${sliderPercent}%` }}
                />
              </div>

              <div className="max-w-xl mx-auto">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPercent}
                  onChange={(e) => setSliderPercent(parseInt(e.target.value, 10))}
                  aria-label="Comparison split slider"
                  className="w-full accent-teal-700"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Comparison AI Report */}
      {activeComparison && prevScan && currScan && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-200">
            <div>
              <div className="text-xs text-slate-500">
                Longitudinal Delta Report · {activeComparison.caseTitle}
              </div>
              <h2 className="text-xl font-bold text-slate-900 mt-0.5 capitalize">
                Progression Status: {activeComparison.progressionStatus}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <div className="bg-slate-50 border border-slate-200 rounded-lg px-3.5 py-2 text-right">
                <div className="text-[10px] font-medium text-slate-500 uppercase">Confidence</div>
                <div className="text-lg font-mono font-bold text-teal-700 tabular-nums">
                  {activeComparison.confidenceScore}%
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  isSpeaking
                    ? stop()
                    : speak(
                        `${activeComparison.voiceSummary} ${activeComparison.problemCheckingMessage}`,
                        selectedLanguage,
                        activeComparison.languageCode
                      )
                }
                disabled={isLoadingAudio}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {isSpeaking ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                <span>{isSpeaking ? 'Stop' : 'Read Aloud'}</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  generateComparisonPdfReport(activeComparison, prevScan, currScan, longitudinalUrl)
                }
                className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <FileDown className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                <span>Export PDF</span>
              </button>
            </div>
          </div>

          {/* Problem Checking Message */}
          <div
            className={`p-4 rounded-xl border ${
              activeComparison.progressionStatus === 'worsening'
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : activeComparison.progressionStatus === 'evolving'
                ? 'bg-amber-50 border-amber-200 text-amber-950'
                : 'bg-emerald-50 border-emerald-200 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider mb-1">
              <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>Problem Checking Message</span>
            </div>
            <p className="text-sm leading-relaxed">{activeComparison.problemCheckingMessage}</p>
          </div>

          <p className="text-sm text-slate-700 leading-relaxed">{activeComparison.changeSummary}</p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-medium text-slate-500">Size &amp; Area</div>
              <div className="text-xs text-slate-800 mt-1 leading-relaxed">
                {activeComparison.visualDeltas.sizeAndArea}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-medium text-slate-500">Border Evolution</div>
              <div className="text-xs text-slate-800 mt-1 leading-relaxed">
                {activeComparison.visualDeltas.borderEvolution}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-medium text-slate-500">Pigmentation Shift</div>
              <div className="text-xs text-slate-800 mt-1 leading-relaxed">
                {activeComparison.visualDeltas.pigmentationShift}
              </div>
            </div>
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-[11px] font-medium text-slate-500">Inflammation Change</div>
              <div className="text-xs text-slate-800 mt-1 leading-relaxed">
                {activeComparison.visualDeltas.inflammationChange}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-2">Recommended Clinical Next Steps</h3>
            <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
              {activeComparison.clinicalNextSteps.map((step, idx) => (
                <li key={idx}>{step}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
