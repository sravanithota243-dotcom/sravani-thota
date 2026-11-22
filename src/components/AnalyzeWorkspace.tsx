import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  FileDown,
  Focus,
  GitCompareArrows,
  Image as ImageIcon,
  Info,
  Layers,
  Loader2,
  RotateCcw,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Upload,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  DailyCheckInTask,
  ImageQualityMetrics,
  LesionCase,
  LongitudinalComparison,
  SkinScanRecord,
  UserProfile,
} from '../types';
import { SUPPORTED_LANGUAGES } from '../types';
import { api } from '../utils/api';
import { formatDurationLabel, formatTimerClock } from '../utils/duration';
import {
  analyzeAndPreprocessImage,
  DEFAULT_PREPROCESS_OPTIONS,
  type PreprocessOptions,
} from '../utils/imageQuality';
import {
  generateAnalyzeClinicalSummaryPdf,
  generateScanPdfReport,
} from '../utils/pdfReport';
import { useMultilingualSpeaker } from '../utils/voicePlayer';
import { CameraCaptureModal } from './CameraCaptureModal';
import { ComparisonSummarySidebar } from './ComparisonSummarySidebar';
import { ConfidenceHeatmapOverlay } from './ConfidenceHeatmapOverlay';

interface AnalyzeWorkspaceProps {
  user: UserProfile;
  cases: LesionCase[];
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
  initialCaseId?: string | null;
  initialCheckInDraft?: DailyCheckInTask | null;
  selectedLanguage: string;
  onLanguageChange: (code: string) => void;
  onScanCreated: (scan: SkinScanRecord, lesionCase: LesionCase) => void;
  onJumpToCompare: (scanId: string) => void;
  onOpenVoiceWithScan: (scanId: string) => void;
}

export function AnalyzeWorkspace({
  user,
  cases,
  scans,
  comparisons,
  initialCaseId,
  initialCheckInDraft,
  selectedLanguage,
  onLanguageChange,
  onScanCreated,
  onJumpToCompare,
  onOpenVoiceWithScan,
}: AnalyzeWorkspaceProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const proTipsRef = useRef<HTMLDivElement | null>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isProTipsPinned, setIsProTipsPinned] = useState(false);
  const [isProTipsHovered, setIsProTipsHovered] = useState(false);
  const showProTips = isProTipsPinned || isProTipsHovered;

  const [rawImageUrl, setRawImageUrl] = useState<string | null>(null);
  const [preprocessedUrl, setPreprocessedUrl] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'processed' | 'raw'>('processed');
  const [showHeatmap, setShowHeatmap] = useState<boolean>(false);

  const [preprocessOpts, setPreprocessOpts] = useState<PreprocessOptions>(DEFAULT_PREPROCESS_OPTIONS);
  const [rawMetrics, setRawMetrics] = useState<ImageQualityMetrics | null>(null);
  const [processedMetrics, setProcessedMetrics] = useState<ImageQualityMetrics | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);

  const [selectedCaseId, setSelectedCaseId] = useState<string>(
    initialCaseId || cases[0]?.id || 'new'
  );
  const [newCaseTitle, setNewCaseTitle] = useState('');
  const [bodyLocation, setBodyLocation] = useState(() => {
    const matched = initialCaseId ? cases.find((c) => c.id === initialCaseId) : cases[0];
    return matched?.bodyLocation || 'Left Forearm';
  });
  const [symptoms, setSymptoms] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [isAutoTagging, setIsAutoTagging] = useState(false);
  const [autoTagError, setAutoTagError] = useState<string | null>(null);
  const [autoTagSuggestion, setAutoTagSuggestion] = useState<{
    primaryLocation: string;
    suggestedTags: string[];
    visualCues: string;
  } | null>(null);
  const [activeScan, setActiveScan] = useState<SkinScanRecord | null>(null);
  const [activeCase, setActiveCase] = useState<LesionCase | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const lesionDurationMapRef = useRef<Record<string, number>>({});
  const lastTickAtRef = useRef<number | null>(null);
  const [sessionSeconds, setSessionSeconds] = useState<number>(0);

  const { speak, stop, isLoadingAudio, isSpeaking } = useMultilingualSpeaker();

  useEffect(() => {
    if (initialCaseId) {
      const target = cases.find((c) => c.id === initialCaseId);
      if (target) {
        setSelectedCaseId(target.id);
        setBodyLocation(target.bodyLocation);
      }
    }
  }, [initialCaseId, cases]);

  useEffect(() => {
    if (!initialCheckInDraft) return;
    if (initialCheckInDraft.caseId) {
      const target = cases.find((c) => c.id === initialCheckInDraft.caseId);
      if (target) {
        setSelectedCaseId(target.id);
        setBodyLocation(target.bodyLocation);
      } else {
        setSelectedCaseId('new');
        setNewCaseTitle(initialCheckInDraft.title);
        setBodyLocation(initialCheckInDraft.bodyLocation);
      }
    } else {
      setSelectedCaseId('new');
      setNewCaseTitle(initialCheckInDraft.title);
      setBodyLocation(initialCheckInDraft.bodyLocation);
    }
    setSymptoms(initialCheckInDraft.observedChange);
  }, [initialCheckInDraft, cases]);

  useEffect(() => {
    if (cases.length > 0 && selectedCaseId === 'new' && !newCaseTitle) {
      setSelectedCaseId(cases[0].id);
      setBodyLocation(cases[0].bodyLocation);
    }
  }, [cases, selectedCaseId, newCaseTitle]);

  useEffect(() => {
    if (!isProTipsPinned) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (proTipsRef.current && !proTipsRef.current.contains(e.target as Node)) {
        setIsProTipsPinned(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsProTipsPinned(false);
        setIsProTipsHovered(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isProTipsPinned]);

  // Per-lesion session timer: tracks active analysis time per selected lesion and pauses when tab is hidden or scan is completed
  useEffect(() => {
    setSessionSeconds(Math.floor(lesionDurationMapRef.current[selectedCaseId] || 0));

    if (activeScan) {
      lastTickAtRef.current = null;
      return;
    }

    const syncElapsed = () => {
      if (document.visibilityState !== 'visible') {
        lastTickAtRef.current = null;
        return;
      }
      const now = Date.now();
      if (lastTickAtRef.current !== null) {
        const deltaSec = (now - lastTickAtRef.current) / 1000;
        if (deltaSec > 0 && deltaSec < 15) {
          const next = (lesionDurationMapRef.current[selectedCaseId] || 0) + deltaSec;
          lesionDurationMapRef.current[selectedCaseId] = next;
          setSessionSeconds(Math.floor(next));
        }
      }
      lastTickAtRef.current = now;
    };

    lastTickAtRef.current = document.visibilityState === 'visible' ? Date.now() : null;
    const intervalId = window.setInterval(syncElapsed, 1000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        lastTickAtRef.current = Date.now();
      } else {
        syncElapsed();
        lastTickAtRef.current = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      syncElapsed();
      lastTickAtRef.current = null;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedCaseId, activeScan]);

  const runPreprocessing = useCallback(
    async (sourceUrl: string, opts: PreprocessOptions) => {
      setIsProcessingImage(true);
      setAnalyzeError(null);
      try {
        const result = await analyzeAndPreprocessImage(sourceUrl, opts);
        setPreprocessedUrl(result.preprocessedDataUrl);
        setRawMetrics(result.rawMetrics);
        setProcessedMetrics(result.processedMetrics);
      } catch (err) {
        setAnalyzeError(err instanceof Error ? err.message : 'Failed to process image.');
      } finally {
        setIsProcessingImage(false);
      }
    },
    []
  );

  useEffect(() => {
    if (rawImageUrl) {
      void runPreprocessing(rawImageUrl, preprocessOpts);
    }
  }, [rawImageUrl, preprocessOpts, runPreprocessing]);

  const handleFileChange = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setAnalyzeError('Please select a valid image file (PNG, JPG, WEBP).');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        if (activeScan) {
          lesionDurationMapRef.current[selectedCaseId] = 0;
          setSessionSeconds(0);
        }
        setActiveScan(null);
        setAutoTagSuggestion(null);
        setAutoTagError(null);
        setRawImageUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    handleFileChange(file);
  };

  const handleLoadSample = (samplePath: string, defaultLocation: string) => {
    if (activeScan) {
      lesionDurationMapRef.current[selectedCaseId] = 0;
      setSessionSeconds(0);
    }
    setActiveScan(null);
    setAnalyzeError(null);
    setAutoTagSuggestion(null);
    setAutoTagError(null);
    setBodyLocation(defaultLocation);
    setRawImageUrl(samplePath);
  };

  const PRESET_TAGS = [
    'Baseline',
    'Follow-Up',
    'Itching',
    'Scaling',
    'Painful',
    'Bleeding',
    'Sun-Exposed',
    'Post-Treatment',
  ];

  const handleToggleTag = (tag: string) => {
    const clean = tag.trim();
    if (!clean) return;
    setTags((prev) =>
      prev.includes(clean) ? prev.filter((t) => t !== clean) : [...prev, clean].slice(0, 12)
    );
  };

  const handleAddCustomTag = () => {
    const clean = tagInput.trim().slice(0, 32);
    if (!clean) return;
    if (!tags.includes(clean)) {
      setTags((prev) => [...prev, clean].slice(0, 12));
    }
    setTagInput('');
  };

  const handleAutoTagBodyLocation = async () => {
    const sourceImage = preprocessedUrl || rawImageUrl;
    if (!sourceImage) return;
    setIsAutoTagging(true);
    setAutoTagError(null);
    try {
      const suggestion = await api.autoTagBodyLocation({
        imageDataUrl: sourceImage,
        languageCode: selectedLanguage,
      });
      setAutoTagSuggestion(suggestion);
      if (suggestion.primaryLocation) {
        setBodyLocation(suggestion.primaryLocation);
      }
      if (suggestion.suggestedTags.length > 0) {
        setTags((prev) => {
          const merged = [...prev];
          for (const tag of suggestion.suggestedTags) {
            if (!merged.includes(tag) && merged.length < 12) {
              merged.push(tag);
            }
          }
          return merged;
        });
      }
    } catch (err) {
      setAutoTagError(
        err instanceof Error ? err.message : 'Unable to auto-tag body location from image.'
      );
    } finally {
      setIsAutoTagging(false);
    }
  };

  const handleResetSessionTimer = () => {
    lesionDurationMapRef.current[selectedCaseId] = 0;
    lastTickAtRef.current = document.visibilityState === 'visible' ? Date.now() : null;
    setSessionSeconds(0);
  };

  const handleRunAnalysis = async () => {
    if (!preprocessedUrl || !processedMetrics) return;
    setIsAnalyzing(true);
    setAnalyzeError(null);

    let pendingDelta = 0;
    if (lastTickAtRef.current !== null && document.visibilityState === 'visible') {
      const delta = (Date.now() - lastTickAtRef.current) / 1000;
      if (delta > 0 && delta < 15) pendingDelta = delta;
    }
    const recordedDurationSeconds = Math.max(
      1,
      Math.round((lesionDurationMapRef.current[selectedCaseId] || 0) + pendingDelta)
    );

    try {
      const { scan, lesionCase } = await api.analyzeScan({
        imageDataUrl: preprocessedUrl,
        qualityMetrics: processedMetrics,
        caseId: selectedCaseId !== 'new' ? selectedCaseId : undefined,
        newCaseTitle: selectedCaseId === 'new' ? newCaseTitle : undefined,
        bodyLocation,
        symptoms,
        customNotes: customNotes.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        languageCode: selectedLanguage,
        sessionDurationSeconds: recordedDurationSeconds,
      });
      if (selectedCaseId === 'new') {
        lesionDurationMapRef.current['new'] = 0;
      }
      lesionDurationMapRef.current[lesionCase.id] = recordedDurationSeconds;
      setSessionSeconds(recordedDurationSeconds);
      setActiveScan(scan);
      setActiveCase(lesionCase);
      setSelectedCaseId(lesionCase.id);
      onScanCreated(scan, lesionCase);
    } catch (err) {
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const buildLongitudinalUrl = (shareToken: string) => {
    return `${window.location.origin}/?case=${encodeURIComponent(shareToken)}`;
  };

  const handleCopyLongitudinalUrl = async (shareToken: string) => {
    const url = buildLongitudinalUrl(shareToken);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      setCopiedLink(false);
    }
  };

  const displayedMetrics = previewMode === 'raw' ? rawMetrics : processedMetrics;
  const displayedImage = previewMode === 'raw' ? rawImageUrl : preprocessedUrl || rawImageUrl;

  const currentCaseObj =
    selectedCaseId === 'new'
      ? activeCase
      : cases.find((c) => c.id === selectedCaseId) || activeCase || null;

  const isCreatingNewCase = selectedCaseId === 'new' && !activeCase;
  const activeLesionCaseId = currentCaseObj?.id || '';
  const currentCaseScans = activeLesionCaseId
    ? scans.filter((s) => s.caseId === activeLesionCaseId)
    : [];
  const currentCaseComparisons = activeLesionCaseId
    ? comparisons.filter((c) => c.caseId === activeLesionCaseId)
    : [];

  const sortedCaseScans = [...currentCaseScans].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  const latestCaseScan =
    activeScan || (sortedCaseScans.length > 0 ? sortedCaseScans[sortedCaseScans.length - 1] : null);
  const canDownloadSummary = Boolean(
    currentCaseObj || latestCaseScan || displayedImage || displayedMetrics
  );

  const handleDownloadClinicalSummary = async () => {
    if (!canDownloadSummary) return;
    setIsDownloadingSummary(true);
    setSummaryError(null);
    try {
      const resolvedTitle =
        currentCaseObj?.title || newCaseTitle.trim() || `${bodyLocation || 'Skin'} Screening Case`;
      const resolvedLocation = currentCaseObj?.bodyLocation || bodyLocation || 'Unspecified Area';
      const activeDuration =
        latestCaseScan?.metadata?.sessionDurationSeconds ??
        (sessionSeconds > 0 ? sessionSeconds : undefined);

      const { summaryParagraph } = await api.generateClinicalSummary({
        caseId: currentCaseObj?.id,
        caseTitle: resolvedTitle,
        bodyLocation: resolvedLocation,
        symptoms: symptoms.trim() || undefined,
        customNotes: customNotes.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        latestScanId: latestCaseScan?.id,
        qualityOnlyMetrics: !latestCaseScan ? displayedMetrics : null,
        sessionDurationSeconds: activeDuration,
        languageCode: selectedLanguage,
      });

      const mergedScans =
        latestCaseScan && !currentCaseScans.some((s) => s.id === latestCaseScan.id)
          ? [...currentCaseScans, latestCaseScan]
          : currentCaseScans;

      await generateAnalyzeClinicalSummaryPdf({
        lesionCase: currentCaseObj,
        caseTitle: resolvedTitle,
        bodyLocation: resolvedLocation,
        patientName: user.fullName,
        patientEmail: user.email,
        longitudinalUrl:
          currentCaseObj && currentCaseObj.shareEnabled
            ? buildLongitudinalUrl(currentCaseObj.shareToken)
            : undefined,
        latestScan: latestCaseScan,
        caseScans: mergedScans,
        caseComparisons: currentCaseComparisons,
        previewImageUrl: displayedImage,
        previewMetrics: displayedMetrics,
        symptoms: symptoms.trim() || undefined,
        customNotes: customNotes.trim() || undefined,
        tags: tags.length > 0 ? tags : undefined,
        sessionDurationSeconds: activeDuration,
        geminiSummaryParagraph: summaryParagraph,
      });
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : 'Unable to generate clinical summary PDF.'
      );
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Title & Quick Context */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Skin Lesion Screening &amp; Quality Workbench
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Upload or capture a photograph, verify focus and lighting quality, and run multilingual AI screening.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-2 text-slate-700"
            title="Active analysis duration for the selected lesion (automatically appended to scan record metadata)"
          >
            <Clock className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
            <span className="font-medium text-slate-500">Session</span>
            <span className="font-mono font-semibold text-slate-900 tabular-nums">
              {activeScan?.metadata?.sessionDurationSeconds
                ? `Saved · ${formatDurationLabel(activeScan.metadata.sessionDurationSeconds)}`
                : formatTimerClock(sessionSeconds)}
            </span>
            {!activeScan && sessionSeconds > 0 && (
              <button
                type="button"
                onClick={handleResetSessionTimer}
                aria-label="Reset current lesion session timer"
                title="Reset session timer"
                className="p-0.5 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" aria-hidden="true" />
              </button>
            )}
          </div>

          <label htmlFor="analyze-lang-select" className="text-xs font-medium text-slate-500 whitespace-nowrap">
            Report &amp; Voice Language
          </label>
          <select
            id="analyze-lang-select"
            value={selectedLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-600"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name} ({lang.nativeName})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void handleDownloadClinicalSummary()}
            disabled={!canDownloadSummary || isDownloadingSummary}
            title="Generate Gemini clinical summary paragraph and download formatted PDF with lesion metadata, latest scan metrics, and progression charts"
            className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-45 whitespace-nowrap"
          >
            {isDownloadingSummary ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Compiling PDF...</span>
              </>
            ) : (
              <>
                <FileDown className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Download Clinical Summary</span>
              </>
            )}
          </button>
        </div>
      </div>

      {summaryError && (
        <div
          role="alert"
          className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between gap-3"
        >
          <span>{summaryError}</span>
          <button
            type="button"
            onClick={() => setSummaryError(null)}
            aria-label="Dismiss summary error"
            className="p-0.5 text-rose-700 hover:text-rose-950 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Main Three-Column Console with Comparison Summary Sidebar */}
      <div className="grid lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Image Capture, Quality Checking & Preprocessing */}
        <div className="lg:col-span-6 xl:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-900">01. Capture or Upload Image</h2>
              <div className="flex items-center gap-2">
                <div
                  ref={proTipsRef}
                  className="relative flex items-center gap-1.5"
                  onMouseEnter={() => setIsProTipsHovered(true)}
                  onMouseLeave={() => setIsProTipsHovered(false)}
                >
                  <button
                    type="button"
                    onClick={() => setIsCameraOpen(true)}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Camera</span>
                  </button>

                  <button
                    type="button"
                    aria-label="Camera imaging pro-tips"
                    aria-expanded={showProTips}
                    aria-controls="camera-pro-tips-popover"
                    onClick={() => setIsProTipsPinned((prev) => !prev)}
                    onFocus={() => setIsProTipsHovered(true)}
                    onBlur={(e) => {
                      if (!proTipsRef.current?.contains(e.relatedTarget as Node)) {
                        setIsProTipsHovered(false);
                      }
                    }}
                    className={`px-2.5 py-2 text-xs font-medium border rounded-lg flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                      showProTips
                        ? 'text-teal-900 bg-teal-50 border-teal-300'
                        : 'text-slate-600 hover:text-teal-800 bg-slate-50 hover:bg-teal-50 border-slate-200'
                    }`}
                  >
                    <Info className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
                    <span>Pro-tips</span>
                  </button>

                  {showProTips && (
                    <div
                      id="camera-pro-tips-popover"
                      role="dialog"
                      aria-label="Camera imaging pro-tips"
                      className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 z-30 w-72 sm:w-96 max-w-[calc(100vw-3rem)] bg-white border border-slate-200 rounded-xl shadow-lg p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                        <span className="text-xs font-bold text-slate-900">
                          Optimal Lesion Imaging Pro-Tips
                        </span>
                        <button
                          type="button"
                          aria-label="Close imaging pro-tips"
                          onClick={() => {
                            setIsProTipsPinned(false);
                            setIsProTipsHovered(false);
                          }}
                          className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>

                      <div className="space-y-2.5 text-xs text-slate-700 leading-relaxed">
                        <div className="flex items-start gap-2.5">
                          <Sun className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" aria-hidden="true" />
                          <div>
                            <span className="font-semibold text-slate-900">Even, Diffuse Lighting: </span>
                            Use bright indirect daylight or balanced room light. Avoid direct camera flash or harsh shadows that cause glare and distort skin tone.
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <Focus className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" aria-hidden="true" />
                          <div>
                            <span className="font-semibold text-slate-900">
                              Distance (<span className="font-mono tabular-nums">10–15 cm</span> / 4–6 in):{' '}
                            </span>
                            Hold the lens perpendicular (<span className="font-mono tabular-nums">90°</span>) so the lesion and a margin of surrounding healthy skin fill{' '}
                            <span className="font-mono tabular-nums">40–60%</span> of the frame.
                          </div>
                        </div>

                        <div className="flex items-start gap-2.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700 mt-0.5 shrink-0" aria-hidden="true" />
                          <div>
                            <span className="font-semibold text-slate-900">Sharp Focus &amp; Scale: </span>
                            Brace your wrist, tap the lesion on screen to lock macro focus, and place a millimeter ruler nearby for consistent follow-ups.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Upload</span>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange(e.target.files?.[0])}
                />
              </div>
            </div>

            {/* Viewport / Dropzone */}
            {!displayedImage ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                className="border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 p-10 text-center flex flex-col items-center justify-center min-h-[300px]"
              >
                <ImageIcon className="w-10 h-10 text-slate-400 mb-3" aria-hidden="true" />
                <p className="text-sm font-medium text-slate-800">
                  Drag and drop a skin lesion image here, or open Camera
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  Supports PNG, JPG, and WEBP. Automated sharpness, brightness, and contrast quality checks run locally
                  before screening.
                </p>
                <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleLoadSample('/src/assets/images/sample_lesion_baseline_1795185793387.jpg', 'Left Forearm')
                    }
                    className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-md cursor-pointer"
                  >
                    Load Baseline Reference Sample
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleLoadSample('/src/assets/images/sample_lesion_followup_1795185793686.jpg', 'Left Forearm')
                    }
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-md cursor-pointer"
                  >
                    Load Follow-Up Reference Sample
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('processed')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                        previewMode === 'processed'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Preprocessed View
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('raw')}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                        previewMode === 'raw'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Raw Input
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showHeatmap}
                      onClick={() => setShowHeatmap((prev) => !prev)}
                      title="Toggle D3.js confidence interval & uncertainty heatmap overlay on the scanned lesion image"
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                        showHeatmap
                          ? 'bg-rose-50 text-rose-800 border-rose-300'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <Layers
                        className={`w-3.5 h-3.5 ${showHeatmap ? 'text-rose-700' : 'text-teal-700'}`}
                        aria-hidden="true"
                      />
                      <span>Heatmap: {showHeatmap ? 'On' : 'Off'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setRawImageUrl(null);
                        setPreprocessedUrl(null);
                        setRawMetrics(null);
                        setProcessedMetrics(null);
                        setAutoTagSuggestion(null);
                        setAutoTagError(null);
                        setShowHeatmap(false);
                      }}
                      className="text-xs font-medium text-slate-500 hover:text-slate-900 cursor-pointer whitespace-nowrap"
                    >
                      Clear Image
                    </button>
                  </div>
                </div>

                <ConfidenceHeatmapOverlay
                  imageUrl={displayedImage}
                  qualityMetrics={displayedMetrics}
                  confidenceScore={activeScan?.analysis.confidenceScore}
                  uncertaintyMargin={activeScan?.analysis.uncertaintyMargin}
                  visible={showHeatmap}
                >
                  <img
                    src={displayedImage}
                    alt="Skin region preview"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-contain"
                  />
                  {isProcessingImage && (
                    <div className="absolute inset-0 z-20 bg-slate-950/50 flex items-center justify-center text-white text-xs font-medium gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                      <span>Running preprocessing filters...</span>
                    </div>
                  )}
                </ConfidenceHeatmapOverlay>
              </div>
            )}

            {/* Image Quality Checking & Preprocessing Controls */}
            {displayedMetrics && (
              <div className="pt-5 border-t border-slate-200 space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-teal-700" aria-hidden="true" />
                    <h3 className="text-sm font-bold text-slate-900">Image Quality Checking &amp; Preprocessing</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreprocessOpts(DEFAULT_PREPROCESS_OPTIONS)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" aria-hidden="true" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* Quality Telemetry Grid */}
                <div className="grid grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3.5">
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">Overall</div>
                    <div className="text-lg font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                      {displayedMetrics.overallScore}
                      <span className="text-xs text-slate-400 font-normal">/100</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">Sharpness</div>
                    <div className="text-lg font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {displayedMetrics.sharpnessScore}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">Lighting</div>
                    <div className="text-lg font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {displayedMetrics.brightnessScore}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] font-medium text-slate-500">Contrast</div>
                    <div className="text-lg font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                      {displayedMetrics.contrastScore}
                    </div>
                  </div>
                </div>

                {/* Pre-Scan Quality Problem Checking Message */}
                <div
                  className={`p-3.5 rounded-lg border text-xs leading-relaxed flex items-start gap-2.5 ${
                    displayedMetrics.status === 'pass'
                      ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                      : displayedMetrics.status === 'warning'
                      ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                      : 'bg-rose-50/70 border-rose-200 text-rose-900'
                  }`}
                >
                  {displayedMetrics.status === 'pass' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" aria-hidden="true" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  )}
                  <div>
                    <span className="font-semibold">
                      {displayedMetrics.status === 'pass'
                        ? 'Quality Check Passed'
                        : displayedMetrics.status === 'warning'
                        ? 'Quality Warning'
                        : 'Quality Check Failed'}
                      :{' '}
                    </span>
                    {displayedMetrics.problemCheckingMessage}
                  </div>
                </div>

                {/* Preprocessing Filters */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap gap-4 text-xs text-slate-700">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preprocessOpts.autoNormalize}
                        onChange={(e) =>
                          setPreprocessOpts((o) => ({ ...o, autoNormalize: e.target.checked }))
                        }
                        className="accent-teal-700 rounded"
                      />
                      <span>White-Balance &amp; Contrast Normalization</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preprocessOpts.sharpenEdges}
                        onChange={(e) =>
                          setPreprocessOpts((o) => ({ ...o, sharpenEdges: e.target.checked }))
                        }
                        className="accent-teal-700 rounded"
                      />
                      <span>Border Micro-Sharpening</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preprocessOpts.glareMitigation}
                        onChange={(e) =>
                          setPreprocessOpts((o) => ({ ...o, glareMitigation: e.target.checked }))
                        }
                        className="accent-teal-700 rounded"
                      />
                      <span>Glare Compression</span>
                    </label>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4 pt-1">
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <label htmlFor="preprocess-brightness-slider">Brightness</label>
                        <span className="font-mono tabular-nums">
                          {preprocessOpts.brightnessOffset > 0 ? '+' : ''}
                          {preprocessOpts.brightnessOffset}
                        </span>
                      </div>
                      <input
                        id="preprocess-brightness-slider"
                        type="range"
                        min="-40"
                        max="40"
                        step="2"
                        value={preprocessOpts.brightnessOffset}
                        onChange={(e) =>
                          setPreprocessOpts((o) => ({
                            ...o,
                            brightnessOffset: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full accent-teal-700"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <label htmlFor="preprocess-contrast-slider">Contrast</label>
                        <span className="font-mono tabular-nums">
                          {preprocessOpts.contrastOffset > 0 ? '+' : ''}
                          {preprocessOpts.contrastOffset}%
                        </span>
                      </div>
                      <input
                        id="preprocess-contrast-slider"
                        type="range"
                        min="-50"
                        max="50"
                        step="5"
                        value={preprocessOpts.contrastOffset}
                        onChange={(e) =>
                          setPreprocessOpts((o) => ({
                            ...o,
                            contrastOffset: parseInt(e.target.value, 10),
                          }))
                        }
                        className="w-full accent-teal-700"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-xs text-slate-600 mb-1">
                        <label htmlFor="preprocess-zoom-slider">Center ROI Zoom</label>
                        <span className="font-mono tabular-nums">{preprocessOpts.cropZoom.toFixed(1)}x</span>
                      </div>
                      <input
                        id="preprocess-zoom-slider"
                        type="range"
                        min="1"
                        max="1.8"
                        step="0.1"
                        value={preprocessOpts.cropZoom}
                        onChange={(e) =>
                          setPreprocessOpts((o) => ({ ...o, cropZoom: parseFloat(e.target.value) }))
                        }
                        className="w-full accent-teal-700"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Patient & Longitudinal Case Context */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-base font-bold text-slate-900">02. Lesion Case &amp; Symptom Context</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="case-select" className="block text-xs font-medium text-slate-700 mb-1.5">
                  Tracked Longitudinal Case
                </label>
                <select
                  id="case-select"
                  value={selectedCaseId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSelectedCaseId(val);
                    const matched = cases.find((c) => c.id === val);
                    if (matched) setBodyLocation(matched.bodyLocation);
                  }}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                >
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title} ({c.bodyLocation})
                    </option>
                  ))}
                  <option value="new">+ Create New Tracked Case</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label htmlFor="body-location" className="block text-xs font-medium text-slate-700">
                    Anatomical Body Location
                  </label>
                  <button
                    type="button"
                    onClick={() => void handleAutoTagBodyLocation()}
                    disabled={!displayedImage || isAutoTagging || isProcessingImage}
                    title="Use AI vision to suggest anatomical body location & tags from the scan image"
                    className="px-2.5 py-0.5 text-[11px] font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-md flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
                  >
                    {isAutoTagging ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                        <span>Auto-tagging...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-3 h-3 text-teal-700" aria-hidden="true" />
                        <span>AI Auto-Tag</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  id="body-location"
                  type="text"
                  value={bodyLocation}
                  onChange={(e) => setBodyLocation(e.target.value)}
                  placeholder="e.g., Left Forearm, Upper Back"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            </div>

            {autoTagError && (
              <div role="alert" className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {autoTagError}
              </div>
            )}

            {autoTagSuggestion && (
              <div className="p-3.5 bg-teal-50/60 border border-teal-200 rounded-lg space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-teal-900">
                    <Sparkles className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
                    <span>
                      AI Suggested Body Location: {autoTagSuggestion.primaryLocation}
                    </span>
                  </div>
                  <button
                    type="button"
                    aria-label="Dismiss AI location suggestions"
                    onClick={() => setAutoTagSuggestion(null)}
                    className="p-0.5 text-teal-700 hover:text-teal-950 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>

                {autoTagSuggestion.visualCues && (
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {autoTagSuggestion.visualCues}
                  </p>
                )}

                {autoTagSuggestion.suggestedTags.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] font-medium text-slate-500 mr-1">
                      Suggested Location Tags:
                    </span>
                    {autoTagSuggestion.suggestedTags.map((suggestedTag) => {
                      const isActive = tags.includes(suggestedTag);
                      return (
                        <button
                          key={suggestedTag}
                          type="button"
                          onClick={() => handleToggleTag(suggestedTag)}
                          aria-pressed={isActive}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                            isActive
                              ? 'bg-teal-700 text-white border-teal-700'
                              : 'bg-white text-teal-800 border-teal-200 hover:bg-teal-100'
                          }`}
                        >
                          {isActive ? `✓ ${suggestedTag}` : `+ ${suggestedTag}`}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {selectedCaseId === 'new' && (
              <div>
                <label htmlFor="new-case-title" className="block text-xs font-medium text-slate-700 mb-1.5">
                  New Case Title (generates a longitudinal tracking URL)
                </label>
                <input
                  id="new-case-title"
                  type="text"
                  value={newCaseTitle}
                  onChange={(e) => setNewCaseTitle(e.target.value)}
                  placeholder="e.g., Right Shoulder Pigmented Spot"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
              </div>
            )}

            <div>
              <label htmlFor="symptoms-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                Symptoms &amp; Duration (Optional)
              </label>
              <textarea
                id="symptoms-input"
                rows={2}
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                placeholder="e.g., Mild itching for 1 week, slightly darker edge..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div>
              <label htmlFor="custom-notes-input" className="block text-xs font-medium text-slate-700 mb-1.5">
                Custom Clinical Notes (Saved with Scan &amp; PDF Report)
              </label>
              <textarea
                id="custom-notes-input"
                rows={2}
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="e.g., Captured in morning indirect daylight; applied hydrocortisone 3 days ago..."
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />
            </div>

            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label htmlFor="custom-tag-input" className="text-xs font-medium text-slate-700">
                  Scan Tags ({tags.length}/12)
                </label>
                {tags.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setTags([])}
                    className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
                  >
                    Clear Tags
                  </button>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {PRESET_TAGS.map((preset) => {
                  const active = tags.includes(preset);
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleToggleTag(preset)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                        active
                          ? 'bg-teal-700 text-white border-teal-700'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="custom-tag-input"
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  placeholder="Add custom tag (e.g., Biopsy Scheduled)..."
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
                />
                <button
                  type="button"
                  onClick={handleAddCustomTag}
                  disabled={!tagInput.trim()}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  Add Tag
                </button>
              </div>

              {tags.some((t) => !PRESET_TAGS.includes(t)) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {tags
                    .filter((t) => !PRESET_TAGS.includes(t))
                    .map((customTag) => (
                      <button
                        key={customTag}
                        type="button"
                        onClick={() => handleToggleTag(customTag)}
                        className="px-2.5 py-1 text-xs font-medium bg-teal-50 text-teal-800 border border-teal-200 rounded-md hover:bg-teal-100 cursor-pointer whitespace-nowrap"
                      >
                        {customTag} ×
                      </button>
                    ))}
                </div>
              )}
            </div>

            {analyzeError && (
              <div role="alert" className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {analyzeError}
              </div>
            )}

            <button
              type="button"
              onClick={handleRunAnalysis}
              disabled={!preprocessedUrl || isAnalyzing || isProcessingImage}
              className="w-full py-3 px-5 bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Analyzing Lesion &amp; Scoring Confidence...</span>
                </>
              ) : (
                <span>Run SkinSense AI Analysis</span>
              )}
            </button>
          </div>
        </div>

        {/* Center Column: Screening Output, Confidence Score, Problem Checking Message & Actions */}
        <div className="lg:col-span-6 xl:col-span-4">
          {!activeScan ? (
            <div className="bg-white border border-slate-200 rounded-xl p-10 text-center min-h-[420px] flex flex-col items-center justify-center">
              <ShieldAlert className="w-10 h-10 text-slate-300 mb-3" aria-hidden="true" />
              <h3 className="text-base font-bold text-slate-900">Screening Results Panel</h3>
              <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
                Capture or upload a skin image on the left, verify its focus and brightness quality metrics, and run
                analysis to view the confidence score, problem checking message, PDF export, and longitudinal link.
              </p>
            </div>
          ) : (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-7 space-y-6">
              {/* Top Result Header + Confidence Score */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-5 pb-5 border-b border-slate-200">
                <div className="space-y-1">
                  <div className="text-xs text-slate-500">
                    {activeScan.caseTitle} · {activeScan.bodyLocation} ·{' '}
                    <span className="font-mono">{new Date(activeScan.createdAt).toLocaleString()}</span>
                    {activeScan.metadata?.sessionDurationSeconds ? (
                      <>
                        {' '}
                        ·{' '}
                        <span className="font-mono text-teal-700 font-medium">
                          Session {formatDurationLabel(activeScan.metadata.sessionDurationSeconds)}
                        </span>
                      </>
                    ) : null}
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                    {activeScan.analysis.primaryCondition}
                  </h2>
                </div>

                {/* Confidence Score Metric */}
                <div className="shrink-0 bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-right">
                  <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                    Confidence Score
                  </div>
                  <div className="text-2xl font-mono font-bold text-teal-700 tabular-nums">
                    {activeScan.analysis.confidenceScore}%
                  </div>
                  <div className="text-[11px] font-mono text-slate-500 tabular-nums">
                    ±{activeScan.analysis.uncertaintyMargin}% margin
                  </div>
                </div>
              </div>

              {/* Confidence Visual Progress Bar */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 mb-1.5">
                  <span>Model Visual Confidence</span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowHeatmap((prev) => !prev)}
                      className="text-xs font-medium text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
                    >
                      <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{showHeatmap ? 'Hide Uncertainty Heatmap' : 'Show Uncertainty Heatmap'}</span>
                    </button>
                    <span className="font-mono tabular-nums">
                      {activeScan.analysis.confidenceScore}% / 100%
                    </span>
                  </div>
                </div>
                <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-600 transition-all duration-300"
                    style={{ width: `${activeScan.analysis.confidenceScore}%` }}
                  />
                </div>
              </div>

              {/* Problem Checking Message (Clinical Alert) */}
              <div
                className={`p-4 rounded-xl border space-y-2 ${
                  activeScan.analysis.severityLevel === 'urgent'
                    ? 'bg-rose-50 border-rose-200 text-rose-950'
                    : activeScan.analysis.severityLevel === 'monitor'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider">
                    <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      Problem Checking Message ·{' '}
                      {activeScan.analysis.severityLevel === 'urgent'
                        ? 'Urgent Clinical Evaluation'
                        : activeScan.analysis.severityLevel === 'monitor'
                        ? 'Medical Review Recommended'
                        : 'Routine Monitoring'}
                    </span>
                  </div>
                </div>
                <p className="text-sm leading-relaxed">{activeScan.analysis.problemCheckingMessage}</p>
              </div>

              {/* Action Toolbar: Voice Read Aloud, PDF Report, Compare, Longitudinal Link */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() =>
                    isSpeaking
                      ? stop()
                      : speak(
                          `${activeScan.analysis.voiceSummary} ${activeScan.analysis.problemCheckingMessage}`,
                          selectedLanguage,
                          activeScan.analysis.languageCode
                        )
                  }
                  disabled={isLoadingAudio}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  {isLoadingAudio ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : isSpeaking ? (
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>{isSpeaking ? 'Stop Voice' : 'Read Aloud'}</span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    generateScanPdfReport(
                      activeScan,
                      currentCaseObj ? buildLongitudinalUrl(currentCaseObj.shareToken) : undefined,
                      user.fullName
                    )
                  }
                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <FileDown className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  <span>Generate PDF Report</span>
                </button>

                <button
                  type="button"
                  onClick={() => onJumpToCompare(activeScan.id)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                >
                  <GitCompareArrows className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
                  <span>Compare Previous</span>
                </button>

                <button
                  type="button"
                  onClick={() => onOpenVoiceWithScan(activeScan.id)}
                  className="px-3.5 py-2 text-xs font-medium text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  Ask Voice Assistant
                </button>
              </div>

              {/* Longitudinal URL Link Box */}
              {currentCaseObj && (
                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      Longitudinal URL Link
                    </div>
                    <div className="text-xs font-mono text-teal-800 truncate mt-0.5">
                      {buildLongitudinalUrl(currentCaseObj.shareToken)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyLongitudinalUrl(currentCaseObj.shareToken)}
                    className="px-3 py-1.5 text-xs font-medium bg-white border border-slate-300 rounded-md hover:bg-slate-100 flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                        <span>Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Copy Link</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Clinical Summary & Morphology */}
              <div className="space-y-3 pt-2 border-t border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Clinical Summary</h3>
                <p className="text-sm text-slate-700 leading-relaxed">{activeScan.analysis.clinicalSummary}</p>

                {(activeScan.customNotes || (activeScan.tags && activeScan.tags.length > 0)) && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    {activeScan.tags && activeScan.tags.length > 0 && (
                      <div className="text-xs font-mono text-teal-800">
                        Tags: {activeScan.tags.join(' · ')}
                      </div>
                    )}
                    {activeScan.customNotes && (
                      <div className="text-xs text-slate-700 leading-relaxed">
                        <span className="font-semibold text-slate-900">Custom Notes: </span>
                        {activeScan.customNotes}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid sm:grid-cols-2 gap-3 pt-2">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Asymmetry</div>
                    <div className="text-xs text-slate-800 mt-0.5">{activeScan.analysis.morphology.asymmetry}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Border Regularity</div>
                    <div className="text-xs text-slate-800 mt-0.5">
                      {activeScan.analysis.morphology.borderRegularity}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Color Variation</div>
                    <div className="text-xs text-slate-800 mt-0.5">{activeScan.analysis.morphology.colorVariation}</div>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[11px] font-medium text-slate-500">Erythema &amp; Texture</div>
                    <div className="text-xs text-slate-800 mt-0.5">
                      {activeScan.analysis.morphology.erythemaLevel} · {activeScan.analysis.morphology.surfaceTexture}
                    </div>
                  </div>
                </div>
              </div>

              {/* Differential Possibilities */}
              <div className="space-y-2.5 pt-2 border-t border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Differential Possibilities</h3>
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-lg">
                  {activeScan.analysis.differentials.map((diff, idx) => (
                    <div key={idx} className="p-3 flex items-start justify-between gap-4">
                      <div>
                        <div className="text-xs font-semibold text-slate-900">{diff.name}</div>
                        <div className="text-xs text-slate-600 mt-0.5">{diff.notes}</div>
                      </div>
                      <div className="text-xs font-mono font-semibold text-slate-700 tabular-nums shrink-0">
                        {diff.probability}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recommendations */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h3 className="text-sm font-bold text-slate-900">Recommended Next Steps</h3>
                <ul className="space-y-1.5 text-xs text-slate-700 list-disc pl-4">
                  {activeScan.analysis.recommendations.map((rec, i) => (
                    <li key={i} className="leading-relaxed">
                      {rec}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Comparison Summary & Historical Mini-Charts */}
        <div className="lg:col-span-12 xl:col-span-3">
          <ComparisonSummarySidebar
            selectedCase={currentCaseObj}
            isNewCase={isCreatingNewCase}
            caseScans={currentCaseScans}
            caseComparisons={currentCaseComparisons}
            latestFreshScanId={activeScan?.id || null}
            onJumpToCompare={onJumpToCompare}
          />
        </div>
      </div>

      <CameraCaptureModal
        isOpen={isCameraOpen}
        onClose={() => setIsCameraOpen(false)}
        onCapture={(dataUrl) => {
          if (activeScan) {
            lesionDurationMapRef.current[selectedCaseId] = 0;
            setSessionSeconds(0);
          }
          setActiveScan(null);
          setRawImageUrl(dataUrl);
        }}
      />
    </div>
  );
}
