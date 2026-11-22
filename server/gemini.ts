import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ImageQualityMetrics,
  LongitudinalComparison,
  SkinAnalysisResult,
  VoicePersonality,
} from '../src/types.ts';
import { SUPPORTED_LANGUAGES, VOICE_PERSONALITIES } from '../src/types.ts';

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getLanguageName(code: string): string {
  const found = SUPPORTED_LANGUAGES.find((l) => l.code === code);
  return found ? `${found.name} (${found.nativeName})` : 'English';
}

export function resolveImagePart(imageDataUrl: string): { inlineData: { mimeType: string; data: string } } {
  if (imageDataUrl.startsWith('/src/assets/')) {
    const localPath = path.resolve(process.cwd(), imageDataUrl.slice(1));
    if (!fs.existsSync(localPath)) {
      throw new Error(`Sample asset not found: ${imageDataUrl}`);
    }
    const buf = fs.readFileSync(localPath);
    const ext = path.extname(localPath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    return {
      inlineData: {
        mimeType,
        data: buf.toString('base64'),
      },
    };
  }

  const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Invalid image payload format. Expected base64 data URL.');
  }
  return {
    inlineData: {
      mimeType: match[1],
      data: match[2],
    },
  };
}

export async function analyzeSkinImage(params: {
  imageDataUrl: string;
  qualityMetrics: ImageQualityMetrics;
  bodyLocation: string;
  symptoms: string;
  languageCode: string;
}): Promise<SkinAnalysisResult> {
  const ai = getAiClient();
  const langName = getLanguageName(params.languageCode);
  const imagePart = resolveImagePart(params.imageDataUrl);

  const prompt = [
    `Analyze the provided skin lesion or dermatological photograph.`,
    `Context from patient:`,
    `- Body Location: ${params.bodyLocation || 'Not specified'}`,
    `- Reported Symptoms / Duration: ${params.symptoms || 'None specified'}`,
    `- Pre-Scan Image Quality Telemetry: Overall ${params.qualityMetrics.overallScore}/100 (Sharpness ${params.qualityMetrics.sharpnessScore}/100, Brightness ${params.qualityMetrics.brightnessScore}/100, Contrast ${params.qualityMetrics.contrastScore}/100, Status: ${params.qualityMetrics.status}).`,
    ``,
    `Instructions:`,
    `1. Provide an evidence-based visual screening assessment (this is decision-support, not a definitive diagnosis).`,
    `2. Calibrate confidenceScore (0-100) honestly based on image clarity and visual distinguishability; lower confidence if image quality is suboptimal or visual cues are ambiguous.`,
    `3. Write ALL human-facing text fields (primaryCondition, problemCheckingMessage, redFlagChecklist, clinicalSummary, morphology fields, differential notes, recommendations, and voiceSummary) strictly in ${langName}.`,
    `4. In problemCheckingMessage, clearly explain the triage urgency (routine vs monitor vs urgent), any ABCDE or inflammatory warning signs checked, and what problem or risk to watch for.`,
    `5. In voiceSummary, write 2-3 clear, empathetic spoken sentences suitable for reading aloud in ${langName}.`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [imagePart, { text: prompt }],
    },
    config: {
      systemInstruction:
        'You are SkinSense Clinical Vision, a dermatology triage and image-screening assistant. Be accurate, cautious, medically grounded, and clear. Never claim definitive medical diagnosis; always frame as AI visual screening requiring licensed dermatologist confirmation for clinical decisions.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryCondition: { type: Type.STRING },
          confidenceScore: { type: Type.NUMBER },
          uncertaintyMargin: { type: Type.NUMBER },
          severityLevel: {
            type: Type.STRING,
            description: "Must be exactly one of: 'routine', 'monitor', or 'urgent'",
          },
          problemCheckingMessage: { type: Type.STRING },
          redFlagChecklist: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          clinicalSummary: { type: Type.STRING },
          morphology: {
            type: Type.OBJECT,
            properties: {
              asymmetry: { type: Type.STRING },
              borderRegularity: { type: Type.STRING },
              colorVariation: { type: Type.STRING },
              erythemaLevel: { type: Type.STRING },
              surfaceTexture: { type: Type.STRING },
            },
            required: ['asymmetry', 'borderRegularity', 'colorVariation', 'erythemaLevel', 'surfaceTexture'],
          },
          differentials: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                probability: { type: Type.NUMBER },
                notes: { type: Type.STRING },
              },
              required: ['name', 'probability', 'notes'],
            },
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          voiceSummary: { type: Type.STRING },
        },
        required: [
          'primaryCondition',
          'confidenceScore',
          'uncertaintyMargin',
          'severityLevel',
          'problemCheckingMessage',
          'redFlagChecklist',
          'clinicalSummary',
          'morphology',
          'differentials',
          'recommendations',
          'voiceSummary',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Model returned an empty analysis response.');
  }

  const parsed = JSON.parse(rawText) as Omit<SkinAnalysisResult, 'languageCode'>;
  const normalizedSeverity =
    parsed.severityLevel === 'urgent' || parsed.severityLevel === 'monitor' || parsed.severityLevel === 'routine'
      ? parsed.severityLevel
      : 'monitor';

  return {
    ...parsed,
    confidenceScore: Math.max(1, Math.min(99, Math.round(parsed.confidenceScore))),
    uncertaintyMargin: Math.max(2, Math.min(25, Math.round(parsed.uncertaintyMargin || 6))),
    severityLevel: normalizedSeverity,
    languageCode: params.languageCode,
  };
}

export async function compareSkinImages(params: {
  previousImageUrl: string;
  previousDate: string;
  previousCondition: string;
  currentImageUrl: string;
  currentDate: string;
  currentCondition: string;
  bodyLocation: string;
  languageCode: string;
}): Promise<
  Omit<
    LongitudinalComparison,
    'id' | 'userId' | 'caseId' | 'caseTitle' | 'previousScanId' | 'currentScanId' | 'createdAt'
  >
> {
  const ai = getAiClient();
  const langName = getLanguageName(params.languageCode);
  const prevPart = resolveImagePart(params.previousImageUrl);
  const currPart = resolveImagePart(params.currentImageUrl);

  const prompt = [
    `Compare these two chronological dermatological photographs of the same lesion/region (${params.bodyLocation}).`,
    `Image 1 (FIRST image): Previous Baseline captured on ${params.previousDate} (Prior assessment: ${params.previousCondition}).`,
    `Image 2 (SECOND image): Current Follow-up captured on ${params.currentDate} (Current assessment: ${params.currentCondition}).`,
    ``,
    `Evaluate interval morphological evolution carefully:`,
    `- Size, area, or expansion changes`,
    `- Border sharpness or irregularity changes`,
    `- Pigmentation darkening, lightening, or multicolor shift`,
    `- Erythema (redness), scaling, crusting, or healing indicators`,
    `- Provide progressionStatus strictly as one of: 'improving', 'stable', 'evolving', or 'worsening'.`,
    `- Write ALL narrative fields strictly in ${langName}.`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [prevPart, currPart, { text: prompt }],
    },
    config: {
      systemInstruction:
        'You are SkinSense Longitudinal Dermoscopy Comparator. Analyze two sequential images of a skin region objectively and conservatively, highlighting interval changes and clinical escalation triggers.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          progressionStatus: {
            type: Type.STRING,
            description: "Must be exactly one of: 'improving', 'stable', 'evolving', 'worsening'",
          },
          confidenceScore: { type: Type.NUMBER },
          problemCheckingMessage: { type: Type.STRING },
          changeSummary: { type: Type.STRING },
          visualDeltas: {
            type: Type.OBJECT,
            properties: {
              sizeAndArea: { type: Type.STRING },
              borderEvolution: { type: Type.STRING },
              pigmentationShift: { type: Type.STRING },
              inflammationChange: { type: Type.STRING },
            },
            required: ['sizeAndArea', 'borderEvolution', 'pigmentationShift', 'inflammationChange'],
          },
          clinicalNextSteps: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          voiceSummary: { type: Type.STRING },
        },
        required: [
          'progressionStatus',
          'confidenceScore',
          'problemCheckingMessage',
          'changeSummary',
          'visualDeltas',
          'clinicalNextSteps',
          'voiceSummary',
        ],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Model returned an empty comparison response.');
  }

  const parsed = JSON.parse(rawText);
  const validStatuses = ['improving', 'stable', 'evolving', 'worsening'];
  const status = validStatuses.includes(parsed.progressionStatus) ? parsed.progressionStatus : 'evolving';

  return {
    progressionStatus: status,
    confidenceScore: Math.max(1, Math.min(99, Math.round(parsed.confidenceScore))),
    problemCheckingMessage: parsed.problemCheckingMessage,
    changeSummary: parsed.changeSummary,
    visualDeltas: parsed.visualDeltas,
    clinicalNextSteps: parsed.clinicalNextSteps,
    voiceSummary: parsed.voiceSummary,
    languageCode: params.languageCode,
  };
}

export async function transcribeVoiceAudio(params: {
  base64Audio: string;
  mimeType: string;
  languageCode: string;
}): Promise<string> {
  const ai = getAiClient();
  const langName = getLanguageName(params.languageCode);

  const response = await ai.models.generateContent({
    model: 'gemini-3.5-transcribe',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: params.mimeType || 'audio/webm',
            data: params.base64Audio,
          },
        },
        {
          text: `Transcribe the spoken user question accurately. The user is likely speaking in ${langName}. Return only the transcribed text.`,
        },
      ],
    },
  });

  return (response.text ?? '').trim();
}

function getPersonalityConfig(personality?: string) {
  const found = VOICE_PERSONALITIES.find((p) => p.id === personality);
  return found || VOICE_PERSONALITIES[1]; // Default: empathetic ('Kore')
}

export async function askVoiceAssistant(params: {
  question: string;
  languageCode: string;
  scanContext?: string;
  personality?: VoicePersonality;
}): Promise<string> {
  const ai = getAiClient();
  const langName = getLanguageName(params.languageCode);
  const personalityCfg = getPersonalityConfig(params.personality);

  const styleDirective =
    personalityCfg.id === 'clinical'
      ? `Adopt a structured, objective Clinical Specialist tone. Reference observed confidence scores, severity tiers, and morphological warning criteria concisely in 3-4 measured sentences optimized for spoken clarity.`
      : personalityCfg.id === 'concise'
        ? `Adopt an ultra-Concise Executive tone. Answer in 1-2 direct spoken sentences covering only the essential takeaway and immediate next action with zero filler.`
        : `Adopt a warm, Empathetic Health Companion tone. Speak reassuringly in 2-4 plain-language, patient-friendly sentences optimized to be spoken aloud.`;

  const prompt = [
    `User Question: "${params.question}"`,
    params.scanContext ? `Active SkinSense Clinical Scan Context:\n${params.scanContext}` : 'No specific scan selected yet.',
    ``,
    `${styleDirective} Respond strictly in ${langName}. Always remind the user to consult a qualified dermatologist for definitive diagnosis if asking about treatment or alarming changes.`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      systemInstruction: `You are the SkinSense Multilingual Voice Assistant (${personalityCfg.label} persona). Always reply strictly in ${langName}. Use natural spoken phrasing without markdown symbols, asterisks, or bullet characters so your response sounds natural when spoken aloud.`,
    },
  });

  return (response.text ?? '').trim();
}

export async function synthesizeVoiceSpeech(params: {
  text: string;
  languageCode: string;
  sourceLanguageCode?: string;
  personality?: VoicePersonality;
}): Promise<{ base64Wav: string; mimeType: string; spokenText: string }> {
  const ai = getAiClient();
  const langName = getLanguageName(params.languageCode);
  const personalityCfg = getPersonalityConfig(params.personality);

  let textToSpeak = params.text.trim();
  const shouldTranslate =
    Boolean(params.sourceLanguageCode) && params.sourceLanguageCode !== params.languageCode;

  if (shouldTranslate) {
    const translateResp = await ai.models.generateContent({
      model: 'gemini-4-hydrogen',
      contents: `Translate the following dermatological summary or assistant text naturally into ${langName} for spoken voice playback. Output ONLY the translated plain text without markdown symbols or quotes:\n\n${textToSpeak}`,
      config: {
        systemInstruction: `You are a precise medical translator. Translate into natural, clear ${langName} matching a ${personalityCfg.label} clinical communication tone suitable for reading aloud. Preserve all numbers and percentages accurately.`,
      },
    });
    const translated = (translateResp.text ?? '').trim();
    if (translated) {
      textToSpeak = translated;
    }
  }

  const speechStyle =
    personalityCfg.id === 'clinical'
      ? `Measured, objective, articulate clinical dermatology specialist speaking calmly and clearly in ${langName}`
      : personalityCfg.id === 'concise'
        ? `Crisp, direct, efficient medical assistant delivering brief spoken summaries clearly in ${langName}`
        : `Warm, calm, compassionate health assistant speaking gently and clearly in ${langName}`;

  const response = await ai.models.generateContent({
    model: 'gemini-3.8-flash-lite-tts',
    contents: [
      {
        role: 'user',
        parts: [
          {
            text: textToSpeak,
            speechMetadata: {
              style: speechStyle,
            },
          },
        ],
      },
    ],
    config: {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: personalityCfg.voiceName },
        },
      },
    },
  });

  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) {
    throw new Error('TTS model did not return audio data.');
  }

  return {
    base64Wav: base64Audio,
    mimeType: 'audio/wav',
    spokenText: textToSpeak,
  };
}

export async function suggestBodyLocationTags(params: {
  imageDataUrl: string;
  languageCode?: string;
}): Promise<{
  primaryLocation: string;
  suggestedTags: string[];
  visualCues: string;
}> {
  const ai = getAiClient();
  const imagePart = resolveImagePart(params.imageDataUrl);
  const langName = getLanguageName(params.languageCode || 'en');

  const prompt = [
    `Inspect this dermatological or skin photograph and suggest the most likely anatomical body location and concise location tags.`,
    `Instructions:`,
    `1. Identify anatomical landmarks if visible (e.g., Forearm, Dorsal Hand, Face / Cheek, Neck, Shoulder, Upper Back, Chest, Lower Leg, Scalp, Foot).`,
    `2. If the photo is a tight macro close-up with ambiguous anatomy, return primaryLocation as "Close-Up Lesion (Confirm Site)" and suggest likely skin/site descriptor tags based on visible skin texture, hair follicles, or sun-exposure appearance.`,
    `3. Provide 2 to 5 concise tags in suggestedTags (each under 28 characters, Title Case, e.g., "Forearm", "Upper Extremity", "Sun-Exposed").`,
    `4. Write primaryLocation, suggestedTags, and a concise 1-sentence visualCues explanation in ${langName}.`,
  ].join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [imagePart, { text: prompt }],
    },
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction:
        'You are SkinSense Anatomical Tagger. Suggest accurate, concise anatomical body location labels and descriptive site tags from skin lesion images.',
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryLocation: {
            type: Type.STRING,
            description: 'Concise anatomical body location name (e.g., Left Forearm, Upper Back, Cheek).',
          },
          suggestedTags: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 5 concise anatomical or regional body location tags.',
          },
          visualCues: {
            type: Type.STRING,
            description: 'Brief 1-sentence explanation of the anatomical or skin cues observed.',
          },
        },
        required: ['primaryLocation', 'suggestedTags', 'visualCues'],
      },
    },
  });

  const rawText = (response.text ?? '').trim();
  if (!rawText) {
    throw new Error('Model returned an empty auto-tag suggestion.');
  }

  const parsed = JSON.parse(rawText) as {
    primaryLocation?: string;
    suggestedTags?: string[];
    visualCues?: string;
  };

  const primaryLocation = (parsed.primaryLocation || 'Unspecified Skin Region').trim().slice(0, 64);
  const suggestedTags = Array.isArray(parsed.suggestedTags)
    ? Array.from(
        new Set(
          parsed.suggestedTags
            .map((t) => (typeof t === 'string' ? t.trim().slice(0, 32) : ''))
            .filter(Boolean)
        )
      ).slice(0, 5)
    : [];

  return {
    primaryLocation,
    suggestedTags,
    visualCues: (parsed.visualCues || '').trim(),
  };
}

export async function generateLesionClinicalSummaryParagraph(params: {
  caseTitle: string;
  bodyLocation: string;
  createdAt?: string;
  symptoms?: string;
  customNotes?: string;
  tags?: string[];
  sessionDurationSeconds?: number;
  latestScan?: {
    createdAt: string;
    primaryCondition: string;
    confidenceScore: number;
    uncertaintyMargin: number;
    severityLevel: string;
    qualityOverallScore: number;
    qualityStatus: string;
    problemCheckingMessage: string;
  } | null;
  qualityOnlyMetrics?: ImageQualityMetrics | null;
  historicalScans: Array<{
    createdAt: string;
    primaryCondition: string;
    confidenceScore: number;
    severityLevel: string;
  }>;
  historicalComparisons: Array<{
    createdAt: string;
    progressionStatus: string;
    confidenceScore: number;
    changeSummary: string;
  }>;
  languageCode?: string;
}): Promise<string> {
  const ai = getAiClient();
  const langName = getLanguageName(params.languageCode || 'en');

  const scanHistoryLines =
    params.historicalScans.length > 0
      ? params.historicalScans
          .map(
            (s, i) =>
              `Visit ${i + 1} (${s.createdAt.slice(0, 10)}): ${s.primaryCondition}, Confidence ${s.confidenceScore}%, Severity ${s.severityLevel.toUpperCase()}`
          )
          .join('\n')
      : 'No saved historical screening scans yet.';

  const comparisonLines =
    params.historicalComparisons.length > 0
      ? params.historicalComparisons
          .map(
            (c, i) =>
              `Comparison ${i + 1} (${c.createdAt.slice(0, 10)}): Status ${c.progressionStatus.toUpperCase()} (${c.confidenceScore}% conf) — ${c.changeSummary}`
          )
          .join('\n')
      : 'No longitudinal comparisons recorded yet.';

  const latestSection = params.latestScan
    ? [
        `Latest Screening Scan (${params.latestScan.createdAt.slice(0, 10)}):`,
        `- Assessment: ${params.latestScan.primaryCondition}`,
        `- Confidence: ${params.latestScan.confidenceScore}% (±${params.latestScan.uncertaintyMargin}%)`,
        `- Severity: ${params.latestScan.severityLevel.toUpperCase()}`,
        `- Image Quality: ${params.latestScan.qualityOverallScore}/100 (${params.latestScan.qualityStatus.toUpperCase()})`,
        `- Problem Checking: ${params.latestScan.problemCheckingMessage}`,
      ].join('\n')
    : params.qualityOnlyMetrics
      ? `Pre-Analysis Image Quality Only: Overall ${params.qualityOnlyMetrics.overallScore}/100 (${params.qualityOnlyMetrics.status.toUpperCase()}), Sharpness ${params.qualityOnlyMetrics.sharpnessScore}, Brightness ${params.qualityOnlyMetrics.brightnessScore}, Contrast ${params.qualityOnlyMetrics.contrastScore}.`
      : 'No completed scan metrics available yet.';

  const prompt = [
    `Write a single concise, clinician-ready clinical summary paragraph (3 to 5 sentences, plain prose only—no markdown bullets, headers, or asterisks) summarizing this lesion's metadata, latest scan metrics, and historical progression.`,
    ``,
    `Lesion Metadata:`,
    `- Case Title: ${params.caseTitle}`,
    `- Anatomical Location: ${params.bodyLocation}`,
    params.createdAt ? `- Case Tracking Started: ${params.createdAt.slice(0, 10)}` : '',
    params.symptoms ? `- Reported Symptoms: ${params.symptoms}` : '',
    params.customNotes ? `- Clinical Notes: ${params.customNotes}` : '',
    params.tags && params.tags.length > 0 ? `- Tags: ${params.tags.join(', ')}` : '',
    params.sessionDurationSeconds
      ? `- Active Analysis Session Duration: ${params.sessionDurationSeconds} seconds`
      : '',
    ``,
    latestSection,
    ``,
    `Historical Scan Timeline (${params.historicalScans.length} scans):`,
    scanHistoryLines,
    ``,
    `Longitudinal Comparisons (${params.historicalComparisons.length} comparisons):`,
    comparisonLines,
    ``,
    `Write the summary strictly in ${langName}. Frame findings conservatively as AI-assisted screening metrics supporting dermatologist review.`,
  ]
    .filter(Boolean)
    .join('\n');

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: prompt,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      systemInstruction: `You are SkinSense Clinical Documentation Assistant. Produce a clear, factual 3-5 sentence medical summary paragraph in ${langName} suitable for inclusion at the top of a clinical PDF report. Never invent metrics not provided in the prompt, and use plain prose without markdown formatting.`,
    },
  });

  const text = (response.text ?? '').trim();
  if (!text) {
    throw new Error('Model returned an empty clinical summary.');
  }
  return text;
}

