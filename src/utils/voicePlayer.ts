import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoicePersonality } from '../types';
import { SUPPORTED_LANGUAGES } from '../types';
import { api } from './api';

const PLAYBACK_RATE_STORAGE_KEY = 'skinsense_playback_rate';
const PLAYBACK_RATE_EVENT = 'skinsense-playback-rate-change';
const VOICE_PERSONALITY_STORAGE_KEY = 'skinsense_voice_personality';
const VOICE_PERSONALITY_EVENT = 'skinsense-voice-personality-change';
const VOLUME_BOOST_STORAGE_KEY = 'skinsense_volume_boost';
const VOLUME_BOOST_EVENT = 'skinsense-volume-boost-change';
const VOICE_STOP_ALL_EVENT = 'skinsense-stop-all-voice';

export const PLAYBACK_SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25, 1.5] as const;

function clampPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1.0;
  return Math.min(2.0, Math.max(0.5, Math.round(rate * 100) / 100));
}

function readStoredPlaybackRate(): number {
  if (typeof window === 'undefined') return 1.0;
  try {
    const raw = window.localStorage.getItem(PLAYBACK_RATE_STORAGE_KEY);
    if (!raw) return 1.0;
    return clampPlaybackRate(parseFloat(raw));
  } catch {
    return 1.0;
  }
}

function normalizeVoicePersonality(value: unknown): VoicePersonality {
  if (value === 'clinical' || value === 'empathetic' || value === 'concise') {
    return value;
  }
  return 'empathetic';
}

function readStoredVoicePersonality(): VoicePersonality {
  if (typeof window === 'undefined') return 'empathetic';
  try {
    return normalizeVoicePersonality(window.localStorage.getItem(VOICE_PERSONALITY_STORAGE_KEY));
  } catch {
    return 'empathetic';
  }
}

function readStoredVolumeBoost(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(VOLUME_BOOST_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function getAudioContextConstructor(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null;
  const win = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || win.webkitAudioContext || null;
}

export function useMultilingualSpeaker() {
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakerError, setSpeakerError] = useState<string | null>(null);
  const [playbackRate, setPlaybackRateState] = useState<number>(readStoredPlaybackRate);
  const [voicePersonality, setVoicePersonalityState] =
    useState<VoicePersonality>(readStoredVoicePersonality);
  const [volumeBoost, setVolumeBoostState] = useState<boolean>(readStoredVolumeBoost);

  const playbackRateRef = useRef<number>(playbackRate);
  const voicePersonalityRef = useRef<VoicePersonality>(voicePersonality);
  const volumeBoostRef = useRef<boolean>(volumeBoost);
  const speakerInstanceIdRef = useRef<string>(
    `spk_${Math.random().toString(36).slice(2, 9)}`
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const highPassFilterRef = useRef<BiquadFilterNode | null>(null);
  const presenceFilterRef = useRef<BiquadFilterNode | null>(null);
  const compressorNodeRef = useRef<DynamicsCompressorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const applyVolumeBoostParams = useCallback((boosted: boolean) => {
    const ctx = audioCtxRef.current;
    const highPass = highPassFilterRef.current;
    const presence = presenceFilterRef.current;
    const compressor = compressorNodeRef.current;
    const gainNode = gainNodeRef.current;
    if (!ctx || !highPass || !presence || !compressor || !gainNode) return;

    const now = ctx.currentTime;
    if (boosted) {
      highPass.frequency.setTargetAtTime(125, now, 0.02);
      presence.gain.setTargetAtTime(4.5, now, 0.02);
      compressor.threshold.setTargetAtTime(-20, now, 0.02);
      compressor.ratio.setTargetAtTime(4, now, 0.02);
      gainNode.gain.setTargetAtTime(1.85, now, 0.02);
    } else {
      highPass.frequency.setTargetAtTime(20, now, 0.02);
      presence.gain.setTargetAtTime(0, now, 0.02);
      compressor.threshold.setTargetAtTime(0, now, 0.02);
      compressor.ratio.setTargetAtTime(1, now, 0.02);
      gainNode.gain.setTargetAtTime(1.0, now, 0.02);
    }
  }, []);

  const teardownAudioGraph = useCallback(() => {
    try {
      sourceNodeRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      highPassFilterRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      presenceFilterRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      compressorNodeRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    try {
      gainNodeRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    sourceNodeRef.current = null;
    highPassFilterRef.current = null;
    presenceFilterRef.current = null;
    compressorNodeRef.current = null;
    gainNodeRef.current = null;
  }, []);

  useEffect(() => {
    playbackRateRef.current = playbackRate;
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  useEffect(() => {
    voicePersonalityRef.current = voicePersonality;
  }, [voicePersonality]);

  useEffect(() => {
    volumeBoostRef.current = volumeBoost;
    applyVolumeBoostParams(volumeBoost);
  }, [volumeBoost, applyVolumeBoostParams]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleRateSync = (event: Event) => {
      const customEvent = event as CustomEvent<number>;
      if (typeof customEvent.detail === 'number') {
        const clamped = clampPlaybackRate(customEvent.detail);
        playbackRateRef.current = clamped;
        setPlaybackRateState(clamped);
      }
    };
    const handlePersonalitySync = (event: Event) => {
      const customEvent = event as CustomEvent<VoicePersonality>;
      if (customEvent.detail) {
        const normalized = normalizeVoicePersonality(customEvent.detail);
        voicePersonalityRef.current = normalized;
        setVoicePersonalityState(normalized);
      }
    };
    const handleVolumeBoostSync = (event: Event) => {
      const customEvent = event as CustomEvent<boolean>;
      if (typeof customEvent.detail === 'boolean') {
        volumeBoostRef.current = customEvent.detail;
        setVolumeBoostState(customEvent.detail);
        applyVolumeBoostParams(customEvent.detail);
      }
    };
    window.addEventListener(PLAYBACK_RATE_EVENT, handleRateSync);
    window.addEventListener(VOICE_PERSONALITY_EVENT, handlePersonalitySync);
    window.addEventListener(VOLUME_BOOST_EVENT, handleVolumeBoostSync);
    return () => {
      window.removeEventListener(PLAYBACK_RATE_EVENT, handleRateSync);
      window.removeEventListener(VOICE_PERSONALITY_EVENT, handlePersonalitySync);
      window.removeEventListener(VOLUME_BOOST_EVENT, handleVolumeBoostSync);
    };
  }, [applyVolumeBoostParams]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      teardownAudioGraph();
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        audioCtxRef.current.close().catch(() => {
          // Ignore close errors
        });
        audioCtxRef.current = null;
      }
    };
  }, [teardownAudioGraph]);

  const setPlaybackRate = useCallback((nextRate: number) => {
    const clamped = clampPlaybackRate(nextRate);
    playbackRateRef.current = clamped;
    setPlaybackRateState(clamped);
    if (audioRef.current) {
      audioRef.current.playbackRate = clamped;
    }
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(PLAYBACK_RATE_STORAGE_KEY, String(clamped));
      } catch {
        // Ignore storage errors
      }
      window.dispatchEvent(new CustomEvent<number>(PLAYBACK_RATE_EVENT, { detail: clamped }));
    }
  }, []);

  const setVoicePersonality = useCallback((nextPersonality: VoicePersonality) => {
    const normalized = normalizeVoicePersonality(nextPersonality);
    voicePersonalityRef.current = normalized;
    setVoicePersonalityState(normalized);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(VOICE_PERSONALITY_STORAGE_KEY, normalized);
      } catch {
        // Ignore storage errors
      }
      window.dispatchEvent(
        new CustomEvent<VoicePersonality>(VOICE_PERSONALITY_EVENT, { detail: normalized })
      );
    }
  }, []);

  const setVolumeBoost = useCallback(
    (nextBoost: boolean) => {
      const enabled = Boolean(nextBoost);
      volumeBoostRef.current = enabled;
      setVolumeBoostState(enabled);
      applyVolumeBoostParams(enabled);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(VOLUME_BOOST_STORAGE_KEY, String(enabled));
        } catch {
          // Ignore storage errors
        }
        window.dispatchEvent(new CustomEvent<boolean>(VOLUME_BOOST_EVENT, { detail: enabled }));
      }
    },
    [applyVolumeBoostParams]
  );

  const stopLocal = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    teardownAudioGraph();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setIsLoadingAudio(false);
  }, [teardownAudioGraph]);

  const stop = useCallback(() => {
    stopLocal();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent<string>(VOICE_STOP_ALL_EVENT, { detail: speakerInstanceIdRef.current })
      );
    }
  }, [stopLocal]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleGlobalStop = (event: Event) => {
      const customEvent = event as CustomEvent<string>;
      if (customEvent.detail !== speakerInstanceIdRef.current) {
        stopLocal();
      }
    };
    window.addEventListener(VOICE_STOP_ALL_EVENT, handleGlobalStop);
    return () => window.removeEventListener(VOICE_STOP_ALL_EVENT, handleGlobalStop);
  }, [stopLocal]);

  const attachWebAudioClarityChain = useCallback(
    async (audio: HTMLAudioElement) => {
      const AudioCtx = getAudioContextConstructor();
      if (!AudioCtx) return;

      try {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
          audioCtxRef.current = new AudioCtx();
        }
        const ctx = audioCtxRef.current;
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        teardownAudioGraph();

        const source = ctx.createMediaElementSource(audio);
        const highPass = ctx.createBiquadFilter();
        highPass.type = 'highpass';
        highPass.Q.value = 0.7;

        const presence = ctx.createBiquadFilter();
        presence.type = 'peaking';
        presence.frequency.value = 2800;
        presence.Q.value = 1.0;

        const compressor = ctx.createDynamicsCompressor();
        compressor.knee.value = 18;
        compressor.attack.value = 0.003;
        compressor.release.value = 0.2;

        const gainNode = ctx.createGain();

        source.connect(highPass);
        highPass.connect(presence);
        presence.connect(compressor);
        compressor.connect(gainNode);
        gainNode.connect(ctx.destination);

        sourceNodeRef.current = source;
        highPassFilterRef.current = highPass;
        presenceFilterRef.current = presence;
        compressorNodeRef.current = compressor;
        gainNodeRef.current = gainNode;

        applyVolumeBoostParams(volumeBoostRef.current);
      } catch {
        teardownAudioGraph();
      }
    },
    [applyVolumeBoostParams, teardownAudioGraph]
  );

  const speak = useCallback(
    async (text: string, languageCode: string, sourceLanguageCode?: string) => {
      if (!text.trim()) return;
      stop();
      setSpeakerError(null);
      setIsLoadingAudio(true);

      let fallbackText = text;
      try {
        const { base64Wav, mimeType, spokenText } = await api.synthesizeTts(
          text,
          languageCode,
          sourceLanguageCode,
          voicePersonalityRef.current
        );
        if (spokenText) {
          fallbackText = spokenText;
        }
        const audio = new Audio(`data:${mimeType};base64,${base64Wav}`);
        audio.playbackRate = playbackRateRef.current;
        audioRef.current = audio;

        await attachWebAudioClarityChain(audio);

        audio.onloadedmetadata = () => {
          audio.playbackRate = playbackRateRef.current;
        };
        audio.onplay = () => {
          audio.playbackRate = playbackRateRef.current;
          setIsLoadingAudio(false);
          setIsSpeaking(true);
        };
        audio.onended = () => {
          setIsSpeaking(false);
          audioRef.current = null;
          teardownAudioGraph();
        };
        audio.onerror = () => {
          setIsLoadingAudio(false);
          setIsSpeaking(false);
          audioRef.current = null;
          teardownAudioGraph();
        };

        await audio.play();
      } catch (err) {
        // Browser speech synthesis fallback if TTS audio blocked or offline
        setIsLoadingAudio(false);
        teardownAudioGraph();
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          const utterance = new SpeechSynthesisUtterance(fallbackText);
          const langObj = SUPPORTED_LANGUAGES.find((l) => l.code === languageCode);
          const targetBcp47 = langObj?.bcp47 || 'en-US';
          utterance.lang = targetBcp47;
          utterance.rate = playbackRateRef.current;
          utterance.volume = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const matchedVoice =
            voices.find((v) => v.lang.toLowerCase() === targetBcp47.toLowerCase()) ||
            voices.find((v) => v.lang.toLowerCase().startsWith(languageCode.toLowerCase()));
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
          utterance.onstart = () => setIsSpeaking(true);
          utterance.onend = () => setIsSpeaking(false);
          utterance.onerror = () => {
            setIsSpeaking(false);
            setSpeakerError(err instanceof Error ? err.message : 'Unable to play voice audio.');
          };
          window.speechSynthesis.speak(utterance);
        } else {
          setSpeakerError(err instanceof Error ? err.message : 'Unable to synthesize speech.');
        }
      }
    },
    [stop, attachWebAudioClarityChain, teardownAudioGraph]
  );

  return {
    speak,
    stop,
    isLoadingAudio,
    isSpeaking,
    speakerError,
    playbackRate,
    setPlaybackRate,
    voicePersonality,
    setVoicePersonality,
    volumeBoost,
    setVolumeBoost,
  };
}
