export type SeverityLevel = 'routine' | 'monitor' | 'urgent';

export type ProgressionStatus = 'improving' | 'stable' | 'evolving' | 'worsening';

export type QualityStatus = 'pass' | 'warning' | 'fail';

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName: string;
  bcp47: string;
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', bcp47: 'en-US' },
  { code: 'es', name: 'Spanish', nativeName: 'Español', bcp47: 'es-ES' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'fr', name: 'French', nativeName: 'Français', bcp47: 'fr-FR' },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', bcp47: 'ar-SA' },
  { code: 'zh', name: 'Chinese (Mandarin)', nativeName: '中文', bcp47: 'zh-CN' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', bcp47: 'pt-BR' },
  { code: 'de', name: 'German', nativeName: 'Deutsch', bcp47: 'de-DE' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', bcp47: 'te-IN' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', bcp47: 'ta-IN' },
];

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
}

export interface ImageQualityMetrics {
  width: number;
  height: number;
  sharpnessScore: number; // 0-100
  brightnessScore: number; // 0-100
  contrastScore: number; // 0-100
  overallScore: number; // 0-100
  status: QualityStatus;
  problemCheckingMessage: string;
  preprocessingApplied: string[];
}

export interface DifferentialCondition {
  name: string;
  probability: number; // 0-100
  notes: string;
}

export interface MorphologyMetrics {
  asymmetry: string;
  borderRegularity: string;
  colorVariation: string;
  erythemaLevel: string;
  surfaceTexture: string;
}

export interface SkinAnalysisResult {
  primaryCondition: string;
  confidenceScore: number; // 0-100
  uncertaintyMargin: number; // +/- %
  severityLevel: SeverityLevel;
  problemCheckingMessage: string;
  redFlagChecklist: string[];
  clinicalSummary: string;
  morphology: MorphologyMetrics;
  differentials: DifferentialCondition[];
  recommendations: string[];
  voiceSummary: string;
  languageCode: string;
}

export interface LesionCase {
  id: string;
  userId: string;
  title: string;
  bodyLocation: string;
  shareToken: string;
  shareEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ScanRecordMetadata {
  sessionDurationSeconds: number;
  recordedAt?: string;
}

export interface SkinScanRecord {
  id: string;
  userId: string;
  caseId: string;
  caseTitle: string;
  bodyLocation: string;
  symptoms: string;
  customNotes?: string;
  tags?: string[];
  imageDataUrl: string;
  qualityMetrics: ImageQualityMetrics;
  analysis: SkinAnalysisResult;
  metadata?: ScanRecordMetadata;
  createdAt: string;
}

export interface LongitudinalComparison {
  id: string;
  userId: string;
  caseId: string;
  caseTitle: string;
  previousScanId: string;
  currentScanId: string;
  progressionStatus: ProgressionStatus;
  confidenceScore: number; // 0-100
  problemCheckingMessage: string;
  changeSummary: string;
  visualDeltas: {
    sizeAndArea: string;
    borderEvolution: string;
    pigmentationShift: string;
    inflammationChange: string;
  };
  clinicalNextSteps: string[];
  voiceSummary: string;
  languageCode: string;
  createdAt: string;
}

export interface PublicCasePayload {
  caseInfo: {
    id: string;
    title: string;
    bodyLocation: string;
    shareToken: string;
    createdAt: string;
    updatedAt: string;
  };
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
}

export interface FollowUpReminder {
  id: string;
  userId: string;
  caseId: string;
  caseTitle: string;
  bodyLocation: string;
  dueDate: string; // YYYY-MM-DD
  note: string;
  notifyEnabled: boolean;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type VoicePersonality = 'clinical' | 'empathetic' | 'concise';

export interface VoicePersonalityOption {
  id: VoicePersonality;
  label: string;
  description: string;
  voiceName: 'Charon' | 'Kore' | 'Zephyr';
}

export const VOICE_PERSONALITIES: VoicePersonalityOption[] = [
  {
    id: 'clinical',
    label: 'Clinical',
    description: 'Structured, objective dermatological phrasing and measured triage guidance.',
    voiceName: 'Charon',
  },
  {
    id: 'empathetic',
    label: 'Empathetic',
    description: 'Warm, reassuring tone with clear, patient-friendly explanations.',
    voiceName: 'Kore',
  },
  {
    id: 'concise',
    label: 'Concise',
    description: 'Direct 1–2 sentence answers focused strictly on key takeaways and next steps.',
    voiceName: 'Zephyr',
  },
];

export type CheckInLesionStatus = 'new' | 'changed';

export interface DailyCheckInTask {
  id: string;
  userId: string;
  checkInDate: string; // YYYY-MM-DD
  lesionStatus: CheckInLesionStatus;
  title: string;
  bodyLocation: string;
  observedChange: string;
  caseId?: string;
  completed: boolean;
  createdAt: string;
}

