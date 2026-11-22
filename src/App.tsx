/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Activity, Eye, EyeOff, Loader2, Printer, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AnalyzeWorkspace } from './components/AnalyzeWorkspace';
import { AuthGate } from './components/AuthGate';
import { CompareWorkspace } from './components/CompareWorkspace';
import { DailyCheckInModal } from './components/DailyCheckInModal';
import { HistoryWorkspace } from './components/HistoryWorkspace';
import { LongitudinalPublicView } from './components/LongitudinalPublicView';
import { VoiceAssistantPanel } from './components/VoiceAssistantPanel';
import type {
  DailyCheckInTask,
  FollowUpReminder,
  LesionCase,
  LongitudinalComparison,
  SkinScanRecord,
  UserProfile,
} from './types';
import { SUPPORTED_LANGUAGES } from './types';
import { api } from './utils/api';
import { getVoiceBundle } from './utils/i18nVoice';
import { useMultilingualSpeaker } from './utils/voicePlayer';

type WorkspaceTab = 'analyze' | 'compare' | 'history' | 'voice';

function getTodayLocalDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function computeSkinHealthScore(scan: SkinScanRecord): {
  score: number;
  label: 'Routine' | 'Monitor' | 'Urgent';
  toneClass: string;
} {
  const conf = Math.max(0, Math.min(100, scan.analysis.confidenceScore));
  const margin = Math.max(0, Math.min(30, scan.analysis.uncertaintyMargin));
  const severity = scan.analysis.severityLevel;

  if (severity === 'routine') {
    const score = Math.max(70, Math.min(99, Math.round(conf - margin * 0.25)));
    return { score, label: 'Routine', toneClass: 'text-emerald-700' };
  }
  if (severity === 'monitor') {
    const score = Math.max(45, Math.min(79, Math.round(78 - margin * 0.5 - (100 - conf) * 0.2)));
    return { score, label: 'Monitor', toneClass: 'text-amber-700' };
  }
  const score = Math.max(15, Math.min(49, Math.round(45 - conf * 0.2)));
  return { score, label: 'Urgent', toneClass: 'text-rose-700' };
}

function getTempTasksStorageKey(userId: string): string {
  return `skinsense_temp_checkin_tasks_${userId}`;
}

function getDailyCheckInSeenKey(userId: string): string {
  return `skinsense_daily_checkin_seen_${userId}`;
}

function readTempCheckInTasks(userId: string, todayDate: string): DailyCheckInTask[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(getTempTasksStorageKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is DailyCheckInTask =>
        Boolean(t) &&
        typeof t.id === 'string' &&
        t.userId === userId &&
        t.checkInDate === todayDate
    );
  } catch {
    return [];
  }
}

export default function App() {
  const [publicCaseToken, setPublicCaseToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('case');
  });

  const [user, setUser] = useState<UserProfile | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('analyze');
  const [selectedLanguage, setSelectedLanguage] = useState<string>(() => {
    try {
      const saved = localStorage.getItem('skinsense_language');
      if (saved && SUPPORTED_LANGUAGES.some((l) => l.code === saved)) {
        return saved;
      }
    } catch {
      // Ignore storage access errors
    }
    return 'en';
  });
  const [autoSpeakOnLangChange, setAutoSpeakOnLangChange] = useState<boolean>(true);
  const [privacyBlur, setPrivacyBlur] = useState<boolean>(false);
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [justReconnected, setJustReconnected] = useState<boolean>(false);

  const { speak: speakGlobal, stop: stopGlobalVoice, isSpeaking: isSpeakingGlobal } =
    useMultilingualSpeaker();

  useEffect(() => {
    document.documentElement.lang = selectedLanguage;
    try {
      localStorage.setItem('skinsense_language', selectedLanguage);
    } catch {
      // Ignore storage errors
    }
  }, [selectedLanguage]);

  const handleLanguageChange = useCallback(
    (newLanguageCode: string) => {
      if (newLanguageCode === selectedLanguage) return;
      setSelectedLanguage(newLanguageCode);
      if (autoSpeakOnLangChange && user) {
        const bundle = getVoiceBundle(newLanguageCode);
        void speakGlobal(bundle.switchAnnouncement, newLanguageCode, newLanguageCode);
      }
    },
    [selectedLanguage, autoSpeakOnLangChange, user, speakGlobal]
  );

  const [cases, setCases] = useState<LesionCase[]>([]);
  const [scans, setScans] = useState<SkinScanRecord[]>([]);
  const [comparisons, setComparisons] = useState<LongitudinalComparison[]>([]);
  const [reminders, setReminders] = useState<FollowUpReminder[]>([]);
  const [dailyCheckInTasks, setDailyCheckInTasks] = useState<DailyCheckInTask[]>([]);
  const [isDailyCheckInOpen, setIsDailyCheckInOpen] = useState(false);

  const [analyzeTargetCaseId, setAnalyzeTargetCaseId] = useState<string | null>(null);
  const [analyzeCheckInDraft, setAnalyzeCheckInDraft] = useState<DailyCheckInTask | null>(null);
  const [compareTargetScanId, setCompareTargetScanId] = useState<string | null>(null);
  const [voiceContextScanId, setVoiceContextScanId] = useState<string | null>(null);
  const [voiceMicFocusNonce, setVoiceMicFocusNonce] = useState<number>(0);
  const lastNonVoiceTabRef = useRef<Exclude<WorkspaceTab, 'voice'>>('analyze');
  const todayDate = getTodayLocalDateStr();

  useEffect(() => {
    if (activeTab !== 'voice') {
      lastNonVoiceTabRef.current = activeTab;
    }
  }, [activeTab]);

  useEffect(() => {
    if (!user || publicCaseToken || isCheckingAuth) return;

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const isCtrlSpace =
        event.ctrlKey &&
        !event.altKey &&
        !event.metaKey &&
        !event.shiftKey &&
        (event.code === 'Space' || event.key === ' ');

      if (isCtrlSpace) {
        event.preventDefault();
        if (activeTab === 'voice') {
          setActiveTab(lastNonVoiceTabRef.current || 'analyze');
        } else {
          setActiveTab('voice');
          setVoiceMicFocusNonce((prev) => prev + 1);
        }
        return;
      }

      if (event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        const tabByKey: Record<string, WorkspaceTab> = {
          '1': 'analyze',
          '2': 'compare',
          '3': 'history',
          '4': 'voice',
        };
        const targetTab = tabByKey[event.key];
        if (targetTab) {
          event.preventDefault();
          setActiveTab(targetTab);
          if (targetTab === 'voice') {
            setVoiceMicFocusNonce((prev) => prev + 1);
          }
          return;
        }
      }

      if (event.key === 'Escape' && isSpeakingGlobal) {
        stopGlobalVoice();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [activeTab, user, publicCaseToken, isCheckingAuth, isSpeakingGlobal, stopGlobalVoice]);

  const loadWorkspaceData = useCallback(async () => {
    const [casesRes, scansRes, cmpRes, remRes] = await Promise.all([
      api.listCases(),
      api.listScans(),
      api.listComparisons(),
      api.listReminders(),
    ]);
    setCases(casesRes.cases);
    setScans(scansRes.scans);
    setComparisons(cmpRes.comparisons);
    setReminders(remRes.reminders);
  }, []);

  useEffect(() => {
    let reconnectTimer: number | undefined;

    const handleOnline = () => {
      setIsOnline(true);
      setJustReconnected(true);
      if (user) {
        loadWorkspaceData().catch(() => {
          // Ignore transient sync errors immediately on reconnect
        });
      }
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
      reconnectTimer = window.setTimeout(() => {
        setJustReconnected(false);
      }, 4000);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setJustReconnected(false);
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      if (reconnectTimer !== undefined) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [user, loadWorkspaceData]);

  const initUserDailyCheckIn = useCallback(
    (userId: string) => {
      setDailyCheckInTasks(readTempCheckInTasks(userId, todayDate));
      try {
        const lastSeenDate = window.localStorage.getItem(getDailyCheckInSeenKey(userId));
        if (lastSeenDate !== todayDate) {
          setIsDailyCheckInOpen(true);
        }
      } catch {
        setIsDailyCheckInOpen(true);
      }
    },
    [todayDate]
  );

  const persistDailyTasks = useCallback((userId: string, tasks: DailyCheckInTask[]) => {
    try {
      window.sessionStorage.setItem(getTempTasksStorageKey(userId), JSON.stringify(tasks));
    } catch {
      // Ignore storage errors
    }
  }, []);

  const markDailyCheckInSeenToday = useCallback(
    (userId: string) => {
      try {
        window.localStorage.setItem(getDailyCheckInSeenKey(userId), todayDate);
      } catch {
        // Ignore storage errors
      }
    },
    [todayDate]
  );

  useEffect(() => {
    let active = true;
    api
      .getMe()
      .then(async ({ user: profile }) => {
        if (!active) return;
        setUser(profile);
        await loadWorkspaceData();
        if (active) {
          initUserDailyCheckIn(profile.id);
        }
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setIsCheckingAuth(false);
      });

    return () => {
      active = false;
    };
  }, [loadWorkspaceData, initUserDailyCheckIn]);

  const handleAuthenticated = async (loggedInUser: UserProfile) => {
    setUser(loggedInUser);
    await loadWorkspaceData();
    initUserDailyCheckIn(loggedInUser.id);
  };

  const handleSignOut = async () => {
    const activeUserId = user?.id;
    await api.logout();
    if (activeUserId) {
      try {
        window.sessionStorage.removeItem(getTempTasksStorageKey(activeUserId));
      } catch {
        // Ignore storage errors
      }
    }
    setUser(null);
    setCases([]);
    setScans([]);
    setComparisons([]);
    setReminders([]);
    setDailyCheckInTasks([]);
    setIsDailyCheckInOpen(false);
    setAnalyzeCheckInDraft(null);
  };

  const handleLogCheckInTask = (task: DailyCheckInTask) => {
    if (!user) return;
    setDailyCheckInTasks((prev) => {
      const updated = [task, ...prev];
      persistDailyTasks(user.id, updated);
      return updated;
    });
    markDailyCheckInSeenToday(user.id);
    setIsDailyCheckInOpen(false);
  };

  const handleCompleteOrDismissDailyCheckIn = () => {
    if (user) {
      markDailyCheckInSeenToday(user.id);
    }
    setIsDailyCheckInOpen(false);
  };

  const handleToggleCheckInTask = (taskId: string) => {
    if (!user) return;
    setDailyCheckInTasks((prev) => {
      const updated = prev.map((t) => (t.id === taskId ? { ...t, completed: !t.completed } : t));
      persistDailyTasks(user.id, updated);
      return updated;
    });
  };

  const handleDeleteCheckInTask = (taskId: string) => {
    if (!user) return;
    setDailyCheckInTasks((prev) => {
      const updated = prev.filter((t) => t.id !== taskId);
      persistDailyTasks(user.id, updated);
      return updated;
    });
  };

  const handleClearCheckInTasks = () => {
    if (!user) return;
    setDailyCheckInTasks([]);
    try {
      window.sessionStorage.removeItem(getTempTasksStorageKey(user.id));
    } catch {
      // Ignore storage errors
    }
  };

  const handleOpenLongitudinalLink = (shareToken: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('case', shareToken);
    window.history.pushState({}, '', url.toString());
    setPublicCaseToken(shareToken);
  };

  const handleExitPublicView = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('case');
    window.history.pushState({}, '', url.toString());
    setPublicCaseToken(null);
  };

  // Public Longitudinal URL View takes precedence when ?case= is in URL
  if (publicCaseToken) {
    return (
      <LongitudinalPublicView
        shareToken={publicCaseToken}
        onExitPublicView={handleExitPublicView}
      />
    );
  }

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center gap-3 text-sm text-slate-600">
        <Loader2 className="w-5 h-5 animate-spin text-teal-700" aria-hidden="true" />
        <span>Verifying secure session...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthGate onAuthenticated={handleAuthenticated} />;
  }

  const currentWorkspaceLabel =
    activeTab === 'analyze'
      ? 'Analyze · Skin Lesion Screening'
      : activeTab === 'compare'
        ? 'Compare · Longitudinal Progression'
        : activeTab === 'history'
          ? 'History · Clinical Reports & Trends'
          : 'Voice Assistant · Multilingual Session';

  const currentLangMeta =
    SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];

  const latestScanForHeader = scans.reduce<SkinScanRecord | null>((latest, current) => {
    if (!latest) return current;
    return new Date(current.createdAt).getTime() > new Date(latest.createdAt).getTime()
      ? current
      : latest;
  }, null);

  const latestHealthForHeader = latestScanForHeader
    ? computeSkinHealthScore(latestScanForHeader)
    : null;

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-6 lg:px-10 py-4 sticky top-0 z-30 print:hidden">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-8">
          <button
            type="button"
            onClick={() => setActiveTab('analyze')}
            className="text-xl font-bold tracking-tight text-indigo-700 hover:text-indigo-800 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            SkinSense
          </button>

          <nav className="flex items-center gap-6 overflow-x-auto text-sm font-medium">
            {(
              [
                { id: 'analyze', label: 'Analyze' },
                { id: 'compare', label: 'Compare' },
                { id: 'history', label: 'History' },
                { id: 'voice', label: 'Voice Assistant' },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                title={
                  item.id === 'voice'
                    ? 'Toggle Voice Assistant and focus microphone (Ctrl+Space)'
                    : undefined
                }
                aria-keyshortcuts={item.id === 'voice' ? 'Control+Space' : undefined}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === item.id
                    ? 'border-teal-700 text-slate-900 font-semibold'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              aria-label="Print current workspace session"
              title="Print current workspace session (browser-native print view)"
              className="p-2 text-slate-700 hover:text-teal-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer shrink-0"
            >
              <Printer className="w-4 h-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={handleSignOut}
              className="px-4 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Sub-header Workspace Utility Strip */}
      <div className="bg-slate-100/80 border-b border-slate-200 px-6 lg:px-10 py-2.5 print:hidden">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-semibold text-slate-900 truncate">{user.fullName}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono truncate">{user.email}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {isOnline ? (
              <span
                role="status"
                aria-live="polite"
                title="Connected — scan data syncs automatically"
                className="flex items-center gap-1.5 text-slate-600 whitespace-nowrap"
              >
                <Wifi className="w-3.5 h-3.5 text-emerald-700 shrink-0" aria-hidden="true" />
                <span className={justReconnected ? 'font-semibold text-emerald-700' : undefined}>
                  {justReconnected ? 'Back Online · Synced' : 'Online'}
                </span>
              </span>
            ) : (
              <span
                role="status"
                aria-live="polite"
                title="No network connection detected. Scan data and changes are held locally and will sync when back online."
                className="flex items-center gap-1.5 text-amber-800 font-semibold whitespace-nowrap"
              >
                <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                <span>Offline · Scan data will sync later</span>
              </span>
            )}

            <span aria-hidden="true" className="text-slate-300">
              |
            </span>

            {(() => {
              const latestScan = scans.reduce<SkinScanRecord | null>((latest, current) => {
                if (!latest) return current;
                return new Date(current.createdAt).getTime() > new Date(latest.createdAt).getTime()
                  ? current
                  : latest;
              }, null);

              if (!latestScan) {
                return (
                  <button
                    type="button"
                    onClick={() => setActiveTab('analyze')}
                    title="Run your first skin scan to compute a Skin Health Score"
                    className="flex items-center gap-1.5 text-slate-500 hover:text-slate-800 cursor-pointer whitespace-nowrap"
                  >
                    <Activity className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    <span>Skin Health Score:</span>
                    <span className="font-mono tabular-nums">—</span>
                  </button>
                );
              }

              const health = computeSkinHealthScore(latestScan);
              return (
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  title={`Latest scan (${latestScan.bodyLocation} · ${latestScan.analysis.primaryCondition}): ${latestScan.analysis.confidenceScore}% confidence ±${latestScan.analysis.uncertaintyMargin}%, severity ${health.label}. Click to inspect History.`}
                  className="flex items-center gap-1.5 text-slate-700 hover:text-slate-950 cursor-pointer whitespace-nowrap"
                >
                  <Activity className={`w-3.5 h-3.5 ${health.toneClass}`} aria-hidden="true" />
                  <span>Skin Health Score:</span>
                  <span className={`font-mono font-semibold tabular-nums ${health.toneClass}`}>
                    {health.score}/100
                  </span>
                  <span className={`font-medium ${health.toneClass}`}>({health.label})</span>
                </button>
              );
            })()}

            <span aria-hidden="true" className="text-slate-300">
              |
            </span>
            {(() => {
              const pending = reminders.filter((r) => !r.completed);
              const dueCount = pending.filter((r) => r.dueDate <= todayDate).length;
              const pendingCheckIns = dailyCheckInTasks.filter((t) => !t.completed).length;
              if (pending.length === 0 && pendingCheckIns === 0) return null;
              return (
                <>
                  {pendingCheckIns > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className="font-semibold text-teal-800 hover:text-teal-950 cursor-pointer whitespace-nowrap"
                    >
                      {pendingCheckIns} Check-in Task{pendingCheckIns === 1 ? '' : 's'}
                    </button>
                  )}
                  {pendingCheckIns > 0 && pending.length > 0 && (
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                  )}
                  {pending.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('history')}
                      className={`font-medium cursor-pointer whitespace-nowrap ${
                        dueCount > 0
                          ? 'text-amber-700 hover:text-amber-900 font-semibold'
                          : 'text-teal-800 hover:text-teal-950'
                      }`}
                    >
                      {dueCount > 0
                        ? `${dueCount} Follow-Up Due`
                        : `${pending.length} Upcoming Follow-Up${pending.length === 1 ? '' : 's'}`}
                    </button>
                  )}
                  <span aria-hidden="true" className="text-slate-300">
                    |
                  </span>
                </>
              );
            })()}

            <button
              type="button"
              onClick={() => setPrivacyBlur((prev) => !prev)}
              className="flex items-center gap-1.5 text-slate-700 hover:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              {privacyBlur ? (
                <EyeOff className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
              ) : (
                <Eye className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
              )}
              <span>{privacyBlur ? 'Privacy Blur Active' : 'Privacy Blur Off'}</span>
            </button>

            <span aria-hidden="true" className="text-slate-300">
              |
            </span>

            <button
              type="button"
              onClick={() => {
                if (isSpeakingGlobal) {
                  stopGlobalVoice();
                } else {
                  setAutoSpeakOnLangChange((prev) => !prev);
                }
              }}
              title="Automatically speak Voice Assistant greeting when switching language"
              className="flex items-center gap-1 text-slate-700 hover:text-slate-900 cursor-pointer whitespace-nowrap"
            >
              {isSpeakingGlobal ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-rose-700" aria-hidden="true" />
                  <span className="text-rose-700 font-semibold">Stop Voice</span>
                </>
              ) : (
                <>
                  <Volume2
                    className={`w-3.5 h-3.5 ${autoSpeakOnLangChange ? 'text-teal-700' : 'text-slate-400'}`}
                    aria-hidden="true"
                  />
                  <span>{autoSpeakOnLangChange ? 'Voice Sync On' : 'Voice Sync Off'}</span>
                </>
              )}
            </button>

            <select
              aria-label="Global workspace language"
              value={selectedLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="bg-transparent text-xs font-medium text-slate-800 focus:outline-none cursor-pointer"
            >
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name} ({l.nativeName})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Print-Only Clinical Session Header */}
      <div className="hidden print:block border-b-2 border-slate-900 pb-4 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xl font-bold tracking-tight text-indigo-700">
              SkinSense · Clinical Workspace Session Report
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Workspace: <span className="font-semibold text-slate-900">{currentWorkspaceLabel}</span> ·
              Language: <span className="font-semibold text-slate-900">{currentLangMeta.name} ({currentLangMeta.nativeName})</span>
            </div>
          </div>
          <div className="text-right text-xs text-slate-600 font-mono">
            <div>Printed: {new Date().toLocaleString()}</div>
            <div>
              {scans.length} Scans · {comparisons.length} Comparisons · {cases.length} Cases
            </div>
          </div>
        </div>
        <div className="mt-2 pt-2 border-t border-slate-200 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-700">
          <div>
            Patient: <span className="font-semibold text-slate-900">{user.fullName}</span> ({user.email})
          </div>
          {latestHealthForHeader && (
            <div className="font-mono">
              Latest Skin Health Score:{' '}
              <span className="font-bold text-slate-900">
                {latestHealthForHeader.score}/100 ({latestHealthForHeader.label})
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Stage */}
      <main
        className={`flex-1 max-w-7xl w-full mx-auto px-6 lg:px-10 py-8 print:px-0 print:py-0 print:blur-none transition-[filter] duration-150 ${
          privacyBlur ? 'blur-md select-none pointer-events-none' : ''
        }`}
      >
        {activeTab === 'analyze' && (
          <AnalyzeWorkspace
            user={user}
            cases={cases}
            scans={scans}
            comparisons={comparisons}
            initialCaseId={analyzeTargetCaseId}
            initialCheckInDraft={analyzeCheckInDraft}
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
            onScanCreated={(newScan, lesionCase) => {
              setScans((prev) => [newScan, ...prev]);
              setCases((prev) => {
                const exists = prev.some((c) => c.id === lesionCase.id);
                return exists
                  ? prev.map((c) => (c.id === lesionCase.id ? lesionCase : c))
                  : [lesionCase, ...prev];
              });
              if (analyzeCheckInDraft) {
                const completedDraftId = analyzeCheckInDraft.id;
                setDailyCheckInTasks((prev) => {
                  const updated = prev.map((t) =>
                    t.id === completedDraftId ? { ...t, completed: true, caseId: lesionCase.id } : t
                  );
                  persistDailyTasks(user.id, updated);
                  return updated;
                });
                setAnalyzeCheckInDraft(null);
              }
            }}
            onJumpToCompare={(scanId) => {
              setCompareTargetScanId(scanId);
              setActiveTab('compare');
            }}
            onOpenVoiceWithScan={(scanId) => {
              setVoiceContextScanId(scanId);
              setActiveTab('voice');
            }}
          />
        )}

        {activeTab === 'compare' && (
          <CompareWorkspace
            scans={scans}
            cases={cases}
            comparisons={comparisons}
            initialCurrentScanId={compareTargetScanId}
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
            onComparisonCreated={(cmp) => setComparisons((prev) => [cmp, ...prev])}
          />
        )}

        {activeTab === 'history' && (
          <HistoryWorkspace
            user={user}
            scans={scans}
            cases={cases}
            comparisons={comparisons}
            reminders={reminders}
            dailyCheckInTasks={dailyCheckInTasks}
            selectedLanguage={selectedLanguage}
            onCaseUpdated={(updated) =>
              setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
            }
            onScanDeleted={(scanId) => {
              setScans((prev) => prev.filter((s) => s.id !== scanId));
              setComparisons((prev) =>
                prev.filter((c) => c.previousScanId !== scanId && c.currentScanId !== scanId)
              );
            }}
            onJumpToCompare={(scanId) => {
              setCompareTargetScanId(scanId);
              setActiveTab('compare');
            }}
            onOpenLongitudinalLink={handleOpenLongitudinalLink}
            onReminderCreated={(rem) => setReminders((prev) => [rem, ...prev])}
            onReminderUpdated={(updated) =>
              setReminders((prev) => prev.map((r) => (r.id === updated.id ? updated : r)))
            }
            onReminderDeleted={(remId) =>
              setReminders((prev) => prev.filter((r) => r.id !== remId))
            }
            onStartFollowUpScan={(caseId) => {
              setAnalyzeCheckInDraft(null);
              setAnalyzeTargetCaseId(caseId);
              setActiveTab('analyze');
            }}
            onToggleCheckInTask={handleToggleCheckInTask}
            onDeleteCheckInTask={handleDeleteCheckInTask}
            onClearCheckInTasks={handleClearCheckInTasks}
            onOpenDailyCheckIn={() => setIsDailyCheckInOpen(true)}
            onStartCheckInScan={(task) => {
              setAnalyzeTargetCaseId(task.caseId || null);
              setAnalyzeCheckInDraft(task);
              setActiveTab('analyze');
            }}
          />
        )}

        {activeTab === 'voice' && (
          <VoiceAssistantPanel
            scans={scans}
            comparisons={comparisons}
            initialScanId={voiceContextScanId}
            selectedLanguage={selectedLanguage}
            onLanguageChange={handleLanguageChange}
            focusMicSignal={voiceMicFocusNonce}
            onOpenScanner={() => {
              setAnalyzeCheckInDraft(null);
              setActiveTab('analyze');
            }}
          />
        )}
      </main>

      <DailyCheckInModal
        isOpen={isDailyCheckInOpen}
        user={user}
        cases={cases}
        todayDate={todayDate}
        onLogTask={handleLogCheckInTask}
        onNoChangesToday={handleCompleteOrDismissDailyCheckIn}
        onDismiss={handleCompleteOrDismissDailyCheckIn}
      />

      <footer className="bg-white border-t border-slate-200 px-6 lg:px-10 py-4 text-xs text-slate-500 print:mt-8 print:px-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>SkinSense · Dermatological Screening &amp; Longitudinal Documentation</span>
          <span>For educational &amp; clinical screening support only — not a substitute for medical diagnosis.</span>
        </div>
      </footer>
    </div>
  );
}
