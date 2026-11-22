import {
  AudioLines,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Focus,
  HelpCircle,
  History,
  Keyboard,
  Loader2,
  Mic,
  RotateCcw,
  Ruler,
  Send,
  Square,
  Sun,
  Trash2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import type { LongitudinalComparison, SkinScanRecord, VoicePersonality } from '../types';
import { SUPPORTED_LANGUAGES, VOICE_PERSONALITIES } from '../types';
import { api } from '../utils/api';
import { getVoiceBundle } from '../utils/i18nVoice';
import { PLAYBACK_SPEED_OPTIONS, useMultilingualSpeaker } from '../utils/voicePlayer';

interface VoiceMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  languageCode: string;
  timestamp: string;
}

interface VoiceInteractionLogEntry {
  id: string;
  timestamp: string;
  languageCode: string;
  languageName: string;
  inputMode: 'voice' | 'text' | 'summary' | 'walkthrough';
  personality?: VoicePersonality;
  userPrompt: string;
  assistantResponse: string;
  scanLabel?: string;
}

type WalkthroughStepId = 'framing' | 'lighting' | 'angle' | 'distance';

interface GuidedWalkthroughStep {
  id: WalkthroughStepId;
  stepNumber: number;
  title: string;
  subtitle: string;
  targets: [string, string];
  checklist: [string, string];
  avoidTip: string;
  spokenPrompt: string;
}

const GUIDED_WALKTHROUGH_STEPS: GuidedWalkthroughStep[] = [
  {
    id: 'framing',
    stepNumber: 1,
    title: 'Preparation & Framing',
    subtitle: 'Clear the skin surface & center the lesion',
    targets: ['40–60% frame fill', 'Healthy margin visible'],
    checklist: [
      'Gently part hair and remove jewelry, bandages, or thick creams around the spot.',
      'Center the lesion so a clear ring of surrounding healthy skin stays visible for contrast.',
    ],
    avoidTip: 'Avoid zooming in digitally so far that surrounding skin tone disappears.',
    spokenPrompt:
      'Step 1: Preparation and framing. Gently move aside hair, jewelry, or thick ointment around the spot. Center the lesion inside your camera frame so it fills roughly half the view, with a clear border of healthy skin around it. Say Next or tap Next when ready for lighting.',
  },
  {
    id: 'lighting',
    stepNumber: 2,
    title: 'Optimal Lighting',
    subtitle: 'Bright, even, indirect daylight or diffuse indoor light',
    targets: ['Camera flash OFF', 'Zero harsh shadows'],
    checklist: [
      'Face a bright window with indirect daylight or stand under even, diffuse overhead room lighting.',
      'Disable camera flash to prevent bright white glare, and tilt your body so your phone casts no shadow.',
    ],
    avoidTip: 'Avoid direct flash, yellow dim lamps, or harsh midday sun casting hard shadows.',
    spokenPrompt:
      'Step 2: Optimal lighting. Position yourself near bright, indirect daylight or even room lighting. Turn off your camera flash so it does not create white glare or wash out pigment color, and make sure your hand or phone does not cast a shadow over the spot. Say Next when your lighting is even.',
  },
  {
    id: 'angle',
    stepNumber: 3,
    title: 'Camera Angle & Stability',
    subtitle: 'Perpendicular 90° lens alignment with steady wrist',
    targets: ['90° flat overhead', 'Braced wrist / elbow'],
    checklist: [
      'Hold the phone screen flat and directly parallel to the skin surface at a 90-degree angle.',
      'Brace your wrist, forearm, or elbow against a desk, chair, or your own body to prevent motion blur.',
    ],
    avoidTip: 'Avoid shooting from a sharp side angle, which distorts lesion border symmetry.',
    spokenPrompt:
      'Step 3: Camera angle and stability. Hold your phone flat and perpendicular at a 90-degree angle directly over the skin spot, avoiding any side tilt. Brace your wrist or elbow gently so borders and pigment patterns capture crisply without blur. Say Next when your angle feels steady.',
  },
  {
    id: 'distance',
    stepNumber: 4,
    title: 'Target Distance & Focus Lock',
    subtitle: '10–15 cm (4–6 in) macro focus & capture readiness',
    targets: ['10–15 cm (4–6 in)', 'Tap lesion to lock focus'],
    checklist: [
      'Keep the lens 10 to 15 centimeters (4 to 6 inches) from the skin—close enough for texture without macro blur.',
      'Tap directly on the lesion on screen to lock sharp focus, place a millimeter scale nearby if handy, and capture.',
    ],
    avoidTip: 'If the preview looks blurry, pull back 2–3 cm before locking focus again.',
    spokenPrompt:
      'Step 4: Target distance and focus lock. Hold the lens 10 to 15 centimeters, or 4 to 6 inches, away from your skin. Tap directly on the lesion on your screen to lock sharp focus, optionally include a millimeter ruler beside it, and take your photo. Say Finish when done or tap Open Skin Scanner.',
  },
];

type WalkthroughVoiceCommand = 'next' | 'prev' | 'repeat' | 'finish' | 'restart' | 'open_scanner' | 'exit';

function parseWalkthroughVoiceCommand(transcript: string): WalkthroughVoiceCommand | null {
  const normalized = transcript
    .trim()
    .toLowerCase()
    .replace(/[.,!?¿¡"'()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized || normalized.split(' ').length > 6) {
    return null;
  }

  const matchesAny = (phrases: string[]) =>
    phrases.some((phrase) => normalized === phrase || normalized.includes(phrase));

  if (
    matchesAny([
      'restart',
      'start over',
      'from the beginning',
      'reiniciar',
      'recommencer',
      'neu starten',
    ])
  ) {
    return 'restart';
  }
  if (
    matchesAny([
      'open scanner',
      'open skin scanner',
      'go to scanner',
      'start scan',
      'abrir escáner',
      'ouvrir scanner',
    ])
  ) {
    return 'open_scanner';
  }
  if (
    matchesAny([
      'repeat',
      'say again',
      'again',
      'replay',
      'repetir',
      'otra vez',
      'répéter',
      'wiederholen',
      'إعادة',
      '重播',
      'दोहराएं',
      '다시',
    ])
  ) {
    return 'repeat';
  }
  if (
    matchesAny([
      'previous',
      'go back',
      'back',
      'anterior',
      'atrás',
      'précédent',
      'retour',
      'zurück',
      'voltar',
      'السابق',
      '上一步',
      'पिछला',
    ])
  ) {
    return 'prev';
  }
  if (
    matchesAny([
      'exit walkthrough',
      'stop walkthrough',
      'close walkthrough',
      'cancel walkthrough',
      'exit guide',
      'stop guide',
    ])
  ) {
    return 'exit';
  }
  if (
    matchesAny([
      'finish',
      'complete',
      'take photo',
      'capture',
      'terminar',
      'finalizar',
      'terminer',
      'abschließen',
      'إنهاء',
      '完成',
      'समाप्त',
    ])
  ) {
    return 'finish';
  }
  if (
    matchesAny([
      'next',
      'next step',
      'continue',
      'ready',
      'done',
      'proceed',
      'move on',
      'ok next',
      'siguiente',
      'listo',
      'continuar',
      'suivant',
      'prêt',
      'weiter',
      'próximo',
      'التالي',
      '下一步',
      '继续',
      'अगला',
      'आगे',
    ])
  ) {
    return 'next';
  }
  return null;
}

const VOICE_TRANSCRIPT_STORAGE_KEY = 'skinsense_voice_transcript_log';
const MAX_TRANSCRIPT_ENTRIES = 10;

function readStoredTranscriptLog(): VoiceInteractionLogEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(VOICE_TRANSCRIPT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (item): item is VoiceInteractionLogEntry =>
          Boolean(item) &&
          typeof item.id === 'string' &&
          typeof item.timestamp === 'string' &&
          typeof item.assistantResponse === 'string'
      )
      .slice(0, MAX_TRANSCRIPT_ENTRIES);
  } catch {
    return [];
  }
}

interface VoiceAssistantPanelProps {
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
  initialScanId?: string | null;
  selectedLanguage: string;
  onLanguageChange: (code: string) => void;
  focusMicSignal?: number;
  onOpenScanner?: () => void;
}

export function VoiceAssistantPanel({
  scans,
  comparisons,
  initialScanId,
  selectedLanguage,
  onLanguageChange,
  focusMicSignal,
  onOpenScanner,
}: VoiceAssistantPanelProps) {
  const [contextScanId, setContextScanId] = useState<string>(initialScanId || scans[0]?.id || '');
  const [inputText, setInputText] = useState('');
  const [messages, setMessages] = useState<VoiceMessage[]>(() => [
    {
      id: 'welcome',
      role: 'assistant',
      text: getVoiceBundle(selectedLanguage).welcomeGreeting,
      languageCode: selectedLanguage,
      timestamp: new Date().toISOString(),
    },
  ]);

  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [autoSpeakReplies, setAutoSpeakReplies] = useState(true);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [transcriptLog, setTranscriptLog] = useState<VoiceInteractionLogEntry[]>(readStoredTranscriptLog);
  const [isGuideOpen, setIsGuideOpen] = useState(false);

  // Guided Scan Walkthrough state
  const [isWalkthroughActive, setIsWalkthroughActive] = useState(false);
  const [walkthroughStepIndex, setWalkthroughStepIndex] = useState(0);
  const [walkthroughCompleted, setWalkthroughCompleted] = useState(false);
  const [walkthroughAutoSpeak, setWalkthroughAutoSpeak] = useState(true);
  const [walkthroughLastHeard, setWalkthroughLastHeard] = useState<string | null>(null);

  const walkthroughActiveRef = useRef(isWalkthroughActive);
  const walkthroughStepIndexRef = useRef(walkthroughStepIndex);
  const walkthroughCompletedRef = useRef(walkthroughCompleted);

  useEffect(() => {
    walkthroughActiveRef.current = isWalkthroughActive;
    walkthroughStepIndexRef.current = walkthroughStepIndex;
    walkthroughCompletedRef.current = walkthroughCompleted;
  }, [isWalkthroughActive, walkthroughStepIndex, walkthroughCompleted]);

  const prevLangRef = useRef<string>(selectedLanguage);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const micButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isUnmountedRef = useRef<boolean>(false);
  const {
    speak,
    stop,
    isSpeaking,
    isLoadingAudio,
    playbackRate,
    setPlaybackRate,
    voicePersonality,
    setVoicePersonality,
    volumeBoost,
    setVolumeBoost,
  } = useMultilingualSpeaker();

  const currentLang = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];
  const currentBundle = getVoiceBundle(selectedLanguage);
  const selectedContextScan = scans.find((s) => s.id === contextScanId) || null;
  const activePersonalityCfg =
    VOICE_PERSONALITIES.find((p) => p.id === voicePersonality) || VOICE_PERSONALITIES[1];

  useEffect(() => {
    if (prevLangRef.current === selectedLanguage) return;
    prevLangRef.current = selectedLanguage;
    const bundle = getVoiceBundle(selectedLanguage);
    setMessages((prev) => [
      ...prev,
      {
        id: `lang_${Date.now()}`,
        role: 'assistant',
        text: bundle.switchAnnouncement,
        languageCode: selectedLanguage,
        timestamp: new Date().toISOString(),
      },
    ]);
  }, [selectedLanguage]);

  useEffect(() => {
    if (!focusMicSignal) return;
    const timer = window.setTimeout(() => {
      if (micButtonRef.current && !micButtonRef.current.disabled) {
        micButtonRef.current.focus();
      } else {
        inputRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [focusMicSignal]);

  useEffect(() => {
    isUnmountedRef.current = false;
    return () => {
      isUnmountedRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isGuideOpen) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setIsGuideOpen(false);
      }
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [isGuideOpen]);

  const appendTranscriptEntry = (entry: Omit<VoiceInteractionLogEntry, 'id' | 'timestamp'>) => {
    const nextEntry: VoiceInteractionLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    setTranscriptLog((prev) => {
      const updated = [nextEntry, ...prev].slice(0, MAX_TRANSCRIPT_ENTRIES);
      try {
        window.localStorage.setItem(VOICE_TRANSCRIPT_STORAGE_KEY, JSON.stringify(updated));
      } catch {
        // Ignore storage errors
      }
      return updated;
    });
  };

  const clearTranscriptLog = () => {
    setTranscriptLog([]);
    try {
      window.localStorage.removeItem(VOICE_TRANSCRIPT_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  };

  const sendQuestion = async (
    questionText: string,
    inputMode: 'voice' | 'text' = 'text',
    options?: { walkthroughStep?: GuidedWalkthroughStep }
  ) => {
    const trimmed = questionText.trim();
    if (!trimmed) return;
    setVoiceError(null);

    const userMsg: VoiceMessage = {
      id: `u_${Date.now()}`,
      role: 'user',
      text: trimmed,
      languageCode: selectedLanguage,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsThinking(true);

    try {
      const latestComparison = comparisons.find(
        (c) => c.currentScanId === contextScanId || c.previousScanId === contextScanId
      );
      const questionPayload = options?.walkthroughStep
        ? `[Guided Skin Scan Capture Walkthrough · Step ${options.walkthroughStep.stepNumber} of ${GUIDED_WALKTHROUGH_STEPS.length}: ${options.walkthroughStep.title} (${options.walkthroughStep.targets.join(', ')})] User question while positioning camera for a new skin scan: ${trimmed}`
        : trimmed;

      const { answer } = await api.askVoiceAssistant({
        question: questionPayload,
        languageCode: selectedLanguage,
        scanId: contextScanId || undefined,
        comparisonId: latestComparison?.id,
        personality: voicePersonality,
      });

      const assistantMsg: VoiceMessage = {
        id: `a_${Date.now()}`,
        role: 'assistant',
        text: answer,
        languageCode: selectedLanguage,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMsg]);

      const langMeta = SUPPORTED_LANGUAGES.find((l) => l.code === selectedLanguage) || SUPPORTED_LANGUAGES[0];
      appendTranscriptEntry({
        languageCode: selectedLanguage,
        languageName: langMeta.name,
        inputMode: options?.walkthroughStep ? 'walkthrough' : inputMode,
        personality: voicePersonality,
        userPrompt: options?.walkthroughStep
          ? `[Walkthrough Step ${options.walkthroughStep.stepNumber}: ${options.walkthroughStep.title}] ${trimmed}`
          : trimmed,
        assistantResponse: answer,
        scanLabel: options?.walkthroughStep
          ? `Guided Scan Coaching · ${options.walkthroughStep.title}`
          : selectedContextScan
            ? `${selectedContextScan.analysis.primaryCondition} (${selectedContextScan.analysis.confidenceScore}%)`
            : 'General Dermatology Guidance',
      });

      if (autoSpeakReplies || Boolean(options?.walkthroughStep)) {
        void speak(answer, selectedLanguage);
      }
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Unable to reach voice assistant.');
    } finally {
      setIsThinking(false);
    }
  };

  const speakWalkthroughStep = (step: GuidedWalkthroughStep, forceSpeak = false) => {
    if (!walkthroughAutoSpeak && !forceSpeak) return;
    void speak(step.spokenPrompt, selectedLanguage, 'en');
  };

  const startWalkthrough = () => {
    const firstStep = GUIDED_WALKTHROUGH_STEPS[0];
    setVoiceError(null);
    setWalkthroughLastHeard(null);
    setWalkthroughCompleted(false);
    setWalkthroughStepIndex(0);
    setIsWalkthroughActive(true);

    appendTranscriptEntry({
      languageCode: selectedLanguage,
      languageName: currentLang.name,
      inputMode: 'walkthrough',
      personality: voicePersonality,
      userPrompt: 'Start Guided Scan Walkthrough',
      assistantResponse: `${firstStep.title}: ${firstStep.checklist.join(' ')}`,
      scanLabel: `Guided Scan Coaching · Step 1/${GUIDED_WALKTHROUGH_STEPS.length}`,
    });

    speakWalkthroughStep(firstStep, true);
  };

  const goToWalkthroughStep = (nextIndex: number, forceSpeak = false) => {
    const clamped = Math.max(0, Math.min(GUIDED_WALKTHROUGH_STEPS.length - 1, nextIndex));
    const step = GUIDED_WALKTHROUGH_STEPS[clamped];
    setWalkthroughCompleted(false);
    setWalkthroughStepIndex(clamped);
    setWalkthroughLastHeard(null);
    speakWalkthroughStep(step, forceSpeak);
  };

  const completeWalkthrough = () => {
    setWalkthroughCompleted(true);
    setWalkthroughLastHeard(null);
    const completionPrompt =
      'Walkthrough complete. Your framing, lighting, angle, and distance are set. You can now open the skin scanner to capture and analyze your photo.';
    appendTranscriptEntry({
      languageCode: selectedLanguage,
      languageName: currentLang.name,
      inputMode: 'walkthrough',
      personality: voicePersonality,
      userPrompt: 'Complete Guided Scan Walkthrough',
      assistantResponse: completionPrompt,
      scanLabel: 'Guided Scan Coaching · Ready to Capture',
    });
    if (walkthroughAutoSpeak) {
      void speak(completionPrompt, selectedLanguage, 'en');
    }
  };

  const exitWalkthrough = () => {
    stop();
    setIsWalkthroughActive(false);
    setWalkthroughCompleted(false);
    setWalkthroughLastHeard(null);
  };

  const handleWalkthroughNext = () => {
    const currentIdx = walkthroughStepIndexRef.current;
    if (currentIdx >= GUIDED_WALKTHROUGH_STEPS.length - 1) {
      completeWalkthrough();
    } else {
      goToWalkthroughStep(currentIdx + 1);
    }
  };

  const handleWalkthroughPrev = () => {
    const currentIdx = walkthroughStepIndexRef.current;
    if (walkthroughCompletedRef.current) {
      setWalkthroughCompleted(false);
      speakWalkthroughStep(GUIDED_WALKTHROUGH_STEPS[GUIDED_WALKTHROUGH_STEPS.length - 1]);
      return;
    }
    if (currentIdx > 0) {
      goToWalkthroughStep(currentIdx - 1);
    }
  };

  const handleWalkthroughTranscript = async (transcript: string) => {
    setWalkthroughLastHeard(transcript);
    const command = parseWalkthroughVoiceCommand(transcript);
    const currentStep = GUIDED_WALKTHROUGH_STEPS[walkthroughStepIndexRef.current] || GUIDED_WALKTHROUGH_STEPS[0];

    if (command === 'next') {
      handleWalkthroughNext();
      return;
    }
    if (command === 'prev') {
      handleWalkthroughPrev();
      return;
    }
    if (command === 'repeat') {
      speakWalkthroughStep(currentStep, true);
      return;
    }
    if (command === 'restart') {
      goToWalkthroughStep(0, true);
      return;
    }
    if (command === 'open_scanner') {
      if (onOpenScanner) {
        stop();
        onOpenScanner();
      } else {
        completeWalkthrough();
      }
      return;
    }
    if (command === 'finish') {
      completeWalkthrough();
      return;
    }
    if (command === 'exit') {
      exitWalkthrough();
      return;
    }

    await sendQuestion(transcript, 'voice', { walkthroughStep: currentStep });
  };

  const handleToggleRecording = async () => {
    setVoiceError(null);

    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setVoiceError('Microphone recording is not available in this browser. You can type your question below.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      audioChunksRef.current = [];

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) {
          audioChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (mediaStreamRef.current === stream) {
          mediaStreamRef.current = null;
        }
        if (isUnmountedRef.current) return;
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        if (blob.size < 400) {
          setVoiceError('Recording was too short. Please hold or speak clearly and try again.');
          return;
        }

        setIsTranscribing(true);
        try {
          const base64Audio = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
              const result = typeof reader.result === 'string' ? reader.result : '';
              const base64 = result.split(',')[1] || '';
              resolve(base64);
            };
            reader.onerror = () => reject(new Error('Failed to encode audio.'));
            reader.readAsDataURL(blob);
          });

          const { transcript } = await api.transcribeAudio(base64Audio, mimeType, selectedLanguage);
          setIsTranscribing(false);
          if (transcript) {
            if (walkthroughActiveRef.current) {
              await handleWalkthroughTranscript(transcript);
            } else {
              await sendQuestion(transcript, 'voice');
            }
          } else {
            setVoiceError('Could not detect speech in the recording. Please try again.');
          }
        } catch (err) {
          setIsTranscribing(false);
          setVoiceError(err instanceof Error ? err.message : 'Audio transcription failed.');
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setVoiceError(
        err instanceof Error
          ? `Microphone permission denied or unavailable: ${err.message}`
          : 'Unable to access microphone.'
      );
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const activeStep = isWalkthroughActive ? GUIDED_WALKTHROUGH_STEPS[walkthroughStepIndex] : undefined;
    void sendQuestion(inputText, 'text', activeStep ? { walkthroughStep: activeStep } : undefined);
  };

  const promptsForLang = currentBundle.quickPrompts;
  const activeWalkthroughStep =
    GUIDED_WALKTHROUGH_STEPS[walkthroughStepIndex] || GUIDED_WALKTHROUGH_STEPS[0];

  const renderStepIcon = (stepId: WalkthroughStepId, className: string) => {
    switch (stepId) {
      case 'framing':
        return <Camera className={className} aria-hidden="true" />;
      case 'lighting':
        return <Sun className={className} aria-hidden="true" />;
      case 'angle':
        return <Compass className={className} aria-hidden="true" />;
      case 'distance':
        return <Ruler className={className} aria-hidden="true" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="pb-6 border-b border-slate-200 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Multilingual Voice Assistant
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Speak or type in {currentLang.name} ({currentLang.nativeName}) to discuss your skin screening results and
            problem checking alerts.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSpeakReplies}
              onChange={(e) => setAutoSpeakReplies(e.target.checked)}
              className="accent-teal-700 rounded"
            />
            <span>Auto-speak replies</span>
          </label>

          <button
            type="button"
            onClick={() => (isWalkthroughActive ? exitWalkthrough() : startWalkthrough())}
            aria-pressed={isWalkthroughActive}
            className={`px-3 py-2 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isWalkthroughActive
                ? 'bg-teal-700 text-white border-teal-700 hover:bg-teal-800'
                : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
            }`}
          >
            <Focus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{isWalkthroughActive ? 'Exit Scan Walkthrough' : 'Guided Scan Walkthrough'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsGuideOpen(true)}
            className="px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <HelpCircle className="w-3.5 h-3.5 text-teal-700" aria-hidden="true" />
            <span>Voice Assistant Guide</span>
          </button>

          <select
            aria-label="Voice assistant language"
            value={selectedLanguage}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-slate-800"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name} ({l.nativeName})
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              if (isSpeaking) {
                stop();
                return;
              }
              void speak(currentBundle.switchAnnouncement, selectedLanguage, selectedLanguage);
            }}
            disabled={isLoadingAudio}
            title={`Speak voice assistant greeting in ${currentLang.name}`}
            className="px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            {isSpeaking ? (
              <>
                <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Stop Speech</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Speak in {currentLang.nativeName}</span>
              </>
            )}
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-8 items-start">
        {/* Left: Language & Scan Context Controls */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div>
            <label htmlFor="voice-scan-context" className="block text-xs font-semibold text-slate-700 mb-1.5">
              Active Scan Context
            </label>
            <select
              id="voice-scan-context"
              value={contextScanId}
              onChange={(e) => setContextScanId(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
            >
              <option value="">General Dermatology Guidance</option>
              {scans.map((s) => (
                <option key={s.id} value={s.id}>
                  {new Date(s.createdAt).toLocaleDateString()} · {s.analysis.primaryCondition} (
                  {s.analysis.confidenceScore}%)
                </option>
              ))}
            </select>

            {selectedContextScan && (
              <button
                type="button"
                onClick={() => {
                  if (isSpeaking) {
                    stop();
                    return;
                  }
                  const summaryText = `${selectedContextScan.analysis.voiceSummary} ${selectedContextScan.analysis.problemCheckingMessage}`;
                  appendTranscriptEntry({
                    languageCode: selectedLanguage,
                    languageName: currentLang.name,
                    inputMode: 'summary',
                    personality: voicePersonality,
                    userPrompt: 'Speak Scan Summary',
                    assistantResponse: summaryText,
                    scanLabel: `${selectedContextScan.analysis.primaryCondition} (${selectedContextScan.analysis.confidenceScore}%)`,
                  });
                  void speak(summaryText, selectedLanguage, selectedContextScan.analysis.languageCode);
                }}
                disabled={isLoadingAudio}
                className="mt-2.5 w-full px-3 py-2 text-xs font-semibold text-teal-800 bg-teal-50 border border-teal-200 hover:bg-teal-100 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSpeaking ? (
                  <>
                    <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Stop Scan Audio</span>
                  </>
                ) : (
                  <>
                    <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Speak Scan Summary ({currentLang.nativeName})</span>
                  </>
                )}
              </button>
            )}
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">Guided Scan Capture Coach</span>
              <span className="text-[11px] font-mono text-teal-700 font-semibold">4 Steps</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Voice-guided coaching for framing, indirect lighting, 90° camera angle, and 10–15 cm focus distance before
              capturing a new skin scan.
            </p>
            <button
              type="button"
              onClick={() => (isWalkthroughActive ? exitWalkthrough() : startWalkthrough())}
              className={`w-full px-3 py-2 text-xs font-semibold rounded-lg border flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                isWalkthroughActive
                  ? 'bg-slate-900 text-white border-slate-900 hover:bg-slate-800'
                  : 'bg-teal-700 text-white border-teal-700 hover:bg-teal-800'
              }`}
            >
              <Focus className="w-3.5 h-3.5" aria-hidden="true" />
              <span>
                {isWalkthroughActive
                  ? `Walkthrough Active (Step ${activeWalkthroughStep.stepNumber}/4) · Exit`
                  : `Start Voice Walkthrough (${currentLang.nativeName})`}
              </span>
            </button>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span id="voice-personality-label" className="text-xs font-semibold text-slate-700">
                Voice Personality
              </span>
              <span className="text-[11px] font-mono text-slate-500">
                Voice: {activePersonalityCfg.voiceName}
              </span>
            </div>
            <div
              role="group"
              aria-labelledby="voice-personality-label"
              className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg border border-slate-200"
            >
              {VOICE_PERSONALITIES.map((option) => {
                const isSelected = voicePersonality === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setVoicePersonality(option.id)}
                    aria-pressed={isSelected}
                    className={`py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      isSelected
                        ? 'bg-white text-teal-800 font-semibold shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">{activePersonalityCfg.description}</p>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="text-xs font-semibold text-slate-700">Suggested Questions</div>
            <div className="space-y-2">
              {promptsForLang.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => void sendQuestion(p)}
                  disabled={isThinking}
                  className="w-full text-left p-3 text-xs text-slate-700 bg-slate-50 hover:bg-teal-50/70 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700">
                Multilingual Voice Languages (10)
              </span>
              <span className="text-[11px] font-mono text-slate-500">{currentLang.bcp47}</span>
            </div>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Select voice output language">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = lang.code === selectedLanguage;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => {
                      if (isActive) {
                        void speak(
                          getVoiceBundle(lang.code).switchAnnouncement,
                          lang.code,
                          lang.code
                        );
                      } else {
                        onLanguageChange(lang.code);
                      }
                    }}
                    title={`Switch to and speak in ${lang.name} (${lang.nativeName})`}
                    className={`px-2.5 py-1 text-xs rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
                      isActive
                        ? 'bg-teal-700 text-white border-teal-700 font-semibold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-teal-50 hover:text-teal-900'
                    }`}
                  >
                    {lang.nativeName}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Click any language to switch spoken output, transcribe speech, and translate scan readouts automatically.
            </p>
          </div>
        </div>

        {/* Right: Voice & Text Conversation Stage */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl flex flex-col min-h-[520px]">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-medium text-slate-600 flex flex-wrap items-center gap-2">
              <span>
                Active Language: <span className="font-semibold text-slate-900">{currentLang.name}</span>
              </span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="text-slate-500">
                <kbd className="font-mono text-[11px] text-slate-700">Ctrl+Space</kbd> toggles &amp; focuses mic
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <span id="voice-speed-label" className="text-xs font-medium text-slate-600 whitespace-nowrap">
                  Speech Speed
                </span>
                <div
                  role="group"
                  aria-labelledby="voice-speed-label"
                  className="inline-flex items-center gap-0.5 p-0.5 bg-slate-100 rounded-lg border border-slate-200"
                >
                  {PLAYBACK_SPEED_OPTIONS.map((rate) => {
                    const isActive = Math.abs(playbackRate - rate) < 0.01;
                    const label =
                      rate === 0.5 || rate === 1 || rate === 1.5 ? `${rate.toFixed(1)}x` : `${rate}x`;
                    return (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        aria-pressed={isActive}
                        title={`Set speech playback speed to ${label}`}
                        className={`px-2.5 py-1 text-xs font-mono tabular-nums rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          isActive
                            ? 'bg-white text-teal-800 font-semibold shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={volumeBoost}
                onClick={() => setVolumeBoost(!volumeBoost)}
                title="Enhance speech clarity (high-pass filter, vocal presence EQ, dynamic compression, and +volume gain via Web Audio API) for noisy environments"
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  volumeBoost
                    ? 'bg-teal-50 text-teal-800 border-teal-300'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <AudioLines
                  className={`w-3.5 h-3.5 ${volumeBoost ? 'text-teal-700' : 'text-slate-500'}`}
                  aria-hidden="true"
                />
                <span>Volume Boost: {volumeBoost ? 'On' : 'Off'}</span>
              </button>

              {(isSpeaking || isLoadingAudio) && (
                <button
                  type="button"
                  onClick={stop}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 rounded-md flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Stop Audio</span>
                </button>
              )}
            </div>
          </div>

          {isWalkthroughActive && (
            <section
              aria-label="Guided Scan Voice Walkthrough"
              aria-live="polite"
              className="border-b border-teal-200 bg-teal-50/40 p-5 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-teal-700 text-white flex items-center justify-center shrink-0">
                    {walkthroughCompleted ? (
                      <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
                    ) : (
                      renderStepIcon(activeWalkthroughStep.id, 'w-5 h-5')
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold uppercase tracking-wide text-teal-800">
                        {walkthroughCompleted
                          ? 'Walkthrough Complete · 4 / 4'
                          : `Guided Capture · Step ${activeWalkthroughStep.stepNumber} of ${GUIDED_WALKTHROUGH_STEPS.length}`}
                      </span>
                      <span className="text-slate-300" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[11px] text-slate-600">
                        Speaking in {currentLang.name} ({activePersonalityCfg.label})
                      </span>
                    </div>
                    <h2 className="text-base font-bold text-slate-900 mt-0.5">
                      {walkthroughCompleted
                        ? 'Ready to Capture Your Skin Scan'
                        : activeWalkthroughStep.title}
                    </h2>
                    <p className="text-xs text-slate-600">
                      {walkthroughCompleted
                        ? 'Framing, lighting, 90° angle, and 10–15 cm focus distance checks completed.'
                        : activeWalkthroughStep.subtitle}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer mr-1">
                    <input
                      type="checkbox"
                      checked={walkthroughAutoSpeak}
                      onChange={(e) => setWalkthroughAutoSpeak(e.target.checked)}
                      className="accent-teal-700 rounded"
                    />
                    <span>Auto-speak steps</span>
                  </label>

                  <button
                    type="button"
                    onClick={exitWalkthrough}
                    className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                  >
                    Exit
                  </button>
                </div>
              </div>

              {/* Step progress bar */}
              <div
                role="tablist"
                aria-label="Walkthrough capture steps"
                className="grid grid-cols-2 sm:grid-cols-4 gap-2"
              >
                {GUIDED_WALKTHROUGH_STEPS.map((step, idx) => {
                  const isCurrent = !walkthroughCompleted && idx === walkthroughStepIndex;
                  const isDone = walkthroughCompleted || idx < walkthroughStepIndex;
                  return (
                    <button
                      key={step.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      aria-current={isCurrent ? 'step' : undefined}
                      onClick={() => goToWalkthroughStep(idx, true)}
                      className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                        isCurrent
                          ? 'bg-white border-teal-600 ring-1 ring-teal-600/30'
                          : isDone
                            ? 'bg-teal-100/60 border-teal-200 text-teal-900 hover:bg-teal-100'
                            : 'bg-white/70 border-slate-200 text-slate-600 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-[11px] font-mono font-semibold text-teal-800">
                          0{step.stepNumber}
                        </span>
                        {isDone ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-teal-700 shrink-0" aria-hidden="true" />
                        ) : (
                          renderStepIcon(step.id, 'w-3.5 h-3.5 text-slate-500 shrink-0')
                        )}
                      </div>
                      <div className="text-xs font-semibold text-slate-900 truncate mt-1">{step.title}</div>
                    </button>
                  );
                })}
              </div>

              {!walkthroughCompleted ? (
                <div className="bg-white border border-teal-200/80 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-teal-900">
                      <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 font-semibold">
                        {activeWalkthroughStep.targets[0]}
                      </span>
                      <span className="px-2 py-0.5 rounded bg-teal-50 border border-teal-200 font-semibold">
                        {activeWalkthroughStep.targets[1]}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (isSpeaking) {
                          stop();
                        } else {
                          speakWalkthroughStep(activeWalkthroughStep, true);
                        }
                      }}
                      disabled={isLoadingAudio}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md border flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                        isSpeaking
                          ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border-rose-200'
                          : 'text-teal-800 bg-teal-50 hover:bg-teal-100 border-teal-200'
                      }`}
                    >
                      {isSpeaking ? (
                        <>
                          <VolumeX className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>Stop Audio</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>{isLoadingAudio ? 'Loading Audio...' : 'Repeat Guidance'}</span>
                        </>
                      )}
                    </button>
                  </div>

                  <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed">
                    {activeWalkthroughStep.checklist.map((item, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2
                          className="w-3.5 h-3.5 text-teal-700 mt-0.5 shrink-0"
                          aria-hidden="true"
                        />
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="text-[11px] text-amber-900 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                    <span className="font-semibold">Tip:</span> {activeWalkthroughStep.avoidTip}
                  </div>
                </div>
              ) : (
                <div className="bg-white border border-teal-200 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <p className="text-xs font-semibold text-slate-900">
                      Capture conditions verified (Framing · Lighting · 90° Angle · 10–15 cm Distance)
                    </p>
                    <p className="text-xs text-slate-600">
                      Take your photo with the camera flash disabled, then upload or capture it in the Skin Scanner.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => goToWalkthroughStep(0, true)}
                      className="px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                    >
                      Restart Steps
                    </button>
                    {onOpenScanner && (
                      <button
                        type="button"
                        onClick={() => {
                          stop();
                          onOpenScanner();
                        }}
                        className="px-3.5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      >
                        <Camera className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Open Skin Scanner</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Hands-free voice command bar + step navigation */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleRecording}
                    disabled={isTranscribing || isThinking}
                    className={`px-3 py-2 text-xs font-semibold rounded-lg flex items-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 ${
                      isRecording
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-slate-900 hover:bg-slate-800 text-white'
                    }`}
                  >
                    {isRecording ? (
                      <>
                        <Square className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Stop Voice Command</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Speak Command or Question</span>
                      </>
                    )}
                  </button>
                  <span className="text-[11px] text-slate-600">
                    Say <span className="font-semibold text-slate-800">&ldquo;Next&rdquo;</span>,{' '}
                    <span className="font-semibold text-slate-800">&ldquo;Repeat&rdquo;</span>,{' '}
                    <span className="font-semibold text-slate-800">&ldquo;Back&rdquo;</span>, or ask a lighting/focus
                    question.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleWalkthroughPrev}
                    disabled={!walkthroughCompleted && walkthroughStepIndex === 0}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Previous</span>
                  </button>

                  {!walkthroughCompleted && (
                    <button
                      type="button"
                      onClick={handleWalkthroughNext}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg flex items-center gap-1 cursor-pointer"
                    >
                      <span>
                        {walkthroughStepIndex === GUIDED_WALKTHROUGH_STEPS.length - 1
                          ? 'Finish Walkthrough'
                          : 'Next Step'}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              </div>

              {walkthroughLastHeard && (
                <div className="text-[11px] text-slate-600 font-mono">
                  Heard: &ldquo;{walkthroughLastHeard}&rdquo;
                </div>
              )}
            </section>
          )}

          <div className="flex-1 p-5 space-y-4 overflow-y-auto max-h-[420px]">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-teal-700 text-white'
                      : 'bg-slate-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  <p>{msg.text}</p>
                  {msg.role === 'assistant' && (
                    <div className="mt-2 pt-2 border-t border-slate-200/70 flex items-center justify-between gap-4">
                      <span className="text-[11px] font-mono text-slate-400">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button
                        type="button"
                        onClick={() => void speak(msg.text, selectedLanguage, msg.languageCode)}
                        className="text-xs font-medium text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer"
                      >
                        <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>Play in {currentLang.name}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {(isTranscribing || isThinking) && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin text-teal-700" aria-hidden="true" />
                <span>
                  {isTranscribing
                    ? `Transcribing ${currentLang.name} speech...`
                    : `Generating response in ${currentLang.name}...`}
                </span>
              </div>
            )}
          </div>

          {voiceError && (
            <div className="mx-5 mb-3 p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
              {voiceError}
            </div>
          )}

          {/* Voice Mic + Input Bar & Suggested Commands */}
          <div className="p-4 border-t border-slate-200 space-y-3">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-3">
              <button
                ref={micButtonRef}
                type="button"
                onClick={handleToggleRecording}
                disabled={isTranscribing || isThinking}
                aria-keyshortcuts="Control+Space"
                title="Toggle microphone recording (Ctrl+Space toggles Voice Assistant & focuses mic)"
                className={`px-4 py-2.5 text-sm font-semibold rounded-lg flex items-center gap-2 cursor-pointer shrink-0 whitespace-nowrap transition-colors focus:outline-none focus:ring-2 focus:ring-teal-600 focus:ring-offset-2 ${
                  isRecording
                    ? 'bg-rose-600 hover:bg-rose-700 text-white'
                    : 'bg-teal-700 hover:bg-teal-800 text-white'
                }`}
              >
                {isRecording ? (
                  <>
                    <Square className="w-4 h-4" aria-hidden="true" />
                    <span>Stop Mic</span>
                  </>
                ) : (
                  <>
                    <Mic className="w-4 h-4" aria-hidden="true" />
                    <span>Speak</span>
                  </>
                )}
              </button>

              <input
                ref={inputRef}
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`Ask a question in ${currentLang.name}...`}
                className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-600"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isThinking || isTranscribing}
                aria-label="Send question"
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-medium rounded-lg flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
              >
                <Send className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>

            <div
              role="group"
              aria-label="Suggested Commands"
              className="flex flex-wrap items-center gap-2"
            >
              <span className="text-xs font-medium text-slate-500 whitespace-nowrap">
                Suggested Commands:
              </span>
              {currentBundle.suggestedCommands.map((cmd, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => void sendQuestion(cmd, 'text')}
                  disabled={isThinking || isTranscribing}
                  className="px-3 py-1.5 text-xs font-medium text-teal-800 bg-teal-50/70 hover:bg-teal-100 border border-teal-200 rounded-full transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  {cmd}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Transcript Log of Last 10 Voice Interactions */}
      <section
        aria-labelledby="voice-transcript-heading"
        className="bg-white border border-slate-200 rounded-xl overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <History className="w-4 h-4 text-teal-700 mt-0.5 shrink-0" aria-hidden="true" />
            <div>
              <h2 id="voice-transcript-heading" className="text-base font-semibold text-slate-900">
                Recent Voice Interaction Transcript
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Review the last 10 assistant communications, voice queries, and scan audio readouts.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs font-mono tabular-nums text-slate-500">
              {transcriptLog.length} / {MAX_TRANSCRIPT_ENTRIES} logged
            </span>
            {transcriptLog.length > 0 && (
              <button
                type="button"
                onClick={clearTranscriptLog}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-rose-700 bg-slate-50 hover:bg-rose-50 border border-slate-200 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Clear Log</span>
              </button>
            )}
          </div>
        </div>

        {transcriptLog.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              No voice interactions logged yet. Ask a question using the microphone or text bar, or play a scan summary
              to record a transcript entry.
            </div>
            <button
              type="button"
              onClick={() => micButtonRef.current?.focus()}
              className="px-3.5 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg whitespace-nowrap shrink-0 cursor-pointer"
            >
              Focus Microphone
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {transcriptLog.map((entry, idx) => {
              const modeLabel =
                entry.inputMode === 'voice'
                  ? 'Voice Mic'
                  : entry.inputMode === 'summary'
                    ? 'Scan Readout'
                    : entry.inputMode === 'walkthrough'
                      ? 'Guided Walkthrough'
                      : 'Text Query';
              return (
                <article key={entry.id} className="p-5 space-y-2.5 hover:bg-slate-50/70 transition-colors">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono tabular-nums font-semibold text-slate-700">
                        #{String(idx + 1).padStart(2, '0')}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {new Date(entry.timestamp).toLocaleString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700">{modeLabel}</span>
                      {entry.personality && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {VOICE_PERSONALITIES.find((p) => p.id === entry.personality)?.label ||
                              entry.personality}
                          </span>
                        </>
                      )}
                      <span aria-hidden="true">·</span>
                      <span>{entry.languageName}</span>
                      {entry.scanLabel && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate max-w-xs">{entry.scanLabel}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() => void speak(entry.assistantResponse, selectedLanguage, entry.languageCode)}
                      disabled={isLoadingAudio}
                      className="text-xs font-medium text-teal-700 hover:text-teal-900 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-50"
                    >
                      <Volume2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Replay in {currentLang.name}</span>
                    </button>
                  </div>

                  <div className="text-xs text-slate-500">
                    <span className="font-medium text-slate-700">Prompt:</span> {entry.userPrompt}
                  </div>
                  <p className="text-sm text-slate-800 leading-relaxed">{entry.assistantResponse}</p>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {isGuideOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setIsGuideOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="voice-guide-modal-title"
            className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-6 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <Keyboard className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <h2 id="voice-guide-modal-title" className="text-lg font-bold text-slate-900">
                    Voice Assistant Guide
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Global keyboard shortcuts and voice-command tips for rapid hands-free navigation.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                aria-label="Close Voice Assistant Guide"
                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Global Keyboard Shortcuts</h3>
                <div className="border border-slate-200 rounded-lg divide-y divide-slate-200">
                  {[
                    {
                      keys: 'Ctrl + Space',
                      action: 'Toggle the Voice Assistant tab from any workspace and focus the microphone button.',
                    },
                    {
                      keys: 'Space / Enter',
                      action: 'Start or stop recording immediately when the Speak microphone button is focused.',
                    },
                    {
                      keys: 'Alt + 1',
                      action: 'Jump directly to the Analyze skin screening workspace.',
                    },
                    {
                      keys: 'Alt + 2',
                      action: 'Jump directly to the Compare longitudinal progression workspace.',
                    },
                    {
                      keys: 'Alt + 3',
                      action: 'Jump directly to the History reports, search, and follow-up schedule.',
                    },
                    {
                      keys: 'Alt + 4',
                      action: 'Open the Voice Assistant workspace and focus the microphone input.',
                    },
                    {
                      keys: 'Esc',
                      action: 'Close open dialogs or immediately stop active voice playback.',
                    },
                  ].map((shortcut) => (
                    <div
                      key={shortcut.keys}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-6"
                    >
                      <kbd className="font-mono text-xs font-semibold text-slate-800 bg-slate-100 border border-slate-300 rounded px-2.5 py-1 whitespace-nowrap shrink-0 self-start sm:self-auto">
                        {shortcut.keys}
                      </kbd>
                      <span className="text-xs text-slate-600 leading-relaxed flex-1">{shortcut.action}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-900 mb-3">Voice-Command &amp; Navigation Tips</h3>
                <ul className="space-y-3 text-xs text-slate-600 leading-relaxed">
                  <li>
                    <span className="font-semibold text-slate-800">1. Ground Questions in Scan Context:</span> Choose a
                    specific scan under <span className="font-medium text-slate-800">Active Scan Context</span> before
                    speaking so replies cite its confidence score, severity level, and interval comparison.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">2. Use Quick-Start Commands:</span> Click any chip
                    under <span className="font-medium text-slate-800">Suggested Commands</span>—or speak phrases like{' '}
                    <span className="font-medium text-slate-800">&ldquo;Check my recent scans&rdquo;</span> or{' '}
                    <span className="font-medium text-slate-800">&ldquo;Explain current progress&rdquo;</span>—for an
                    instant overview.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">3. Adjust Voice Personality, Speed &amp; Clarity:</span>{' '}
                    Switch between <span className="font-medium text-slate-800">Clinical</span>,{' '}
                    <span className="font-medium text-slate-800">Empathetic</span>, and{' '}
                    <span className="font-medium text-slate-800">Concise</span> personas, adjust{' '}
                    <span className="font-medium text-slate-800">Speech Speed</span> (0.5x–1.5x), and enable{' '}
                    <span className="font-medium text-slate-800">Volume Boost</span> for clearer audio in noisy
                    environments.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">4. Review &amp; Replay Past Interactions:</span>{' '}
                    Your last 10 voice queries and scan readouts are saved in the{' '}
                    <span className="font-medium text-slate-800">Recent Voice Interaction Transcript</span> below so you
                    can review or replay them anytime in your active language.
                  </li>
                  <li>
                    <span className="font-semibold text-slate-800">5. Use Guided Scan Walkthrough Mode:</span>{' '}
                    Launch <span className="font-medium text-slate-800">Guided Scan Walkthrough</span> for step-by-step
                    spoken coaching on framing, indirect lighting, perpendicular 90° angle, and 10–15 cm focus distance.
                    Say <span className="font-medium text-slate-800">&ldquo;Next&rdquo;</span>,{' '}
                    <span className="font-medium text-slate-800">&ldquo;Repeat&rdquo;</span>,{' '}
                    <span className="font-medium text-slate-800">&ldquo;Back&rdquo;</span>, or{' '}
                    <span className="font-medium text-slate-800">&ldquo;Restart&rdquo;</span> to navigate hands-free.
                  </li>
                </ul>
              </div>
            </div>

            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setIsGuideOpen(false);
                  window.setTimeout(() => micButtonRef.current?.focus(), 0);
                }}
                className="px-4 py-2 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 border border-teal-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Focus Microphone
              </button>
              <button
                type="button"
                onClick={() => setIsGuideOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
