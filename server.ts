import dotenv from 'dotenv';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import {
  analyzeSkinImage,
  askVoiceAssistant,
  compareSkinImages,
  generateLesionClinicalSummaryParagraph,
  suggestBodyLocationTags,
  synthesizeVoiceSpeech,
  transcribeVoiceAudio,
} from './server/gemini.ts';
import { store } from './server/store.ts';
import type { ImageQualityMetrics, UserProfile } from './src/types.ts';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const COOKIE_NAME = 'skinsense_session';

app.use(express.json({ limit: '25mb' }));

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      result[key] = decodeURIComponent(val);
    }
  }
  return result;
}

function extractSessionToken(req: express.Request): string | undefined {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME];
}

function setSessionCookie(res: express.Response, token: string): void {
  const isProd = process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=604800',
    isProd ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res: express.Response): void {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax`);
}

function requireAuth(req: express.Request, res: express.Response): UserProfile | null {
  const token = extractSessionToken(req);
  const user = store.getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return null;
  }
  return user;
}

// Health Check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'skinsense-api' });
});

// Authentication Endpoints
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, fullName } = req.body as {
      email?: string;
      password?: string;
      fullName?: string;
    };
    if (!email || !password || password.length < 6) {
      res.status(400).json({ error: 'Valid email and password (minimum 6 characters) are required.' });
      return;
    }
    const result = store.registerUser(email, password, fullName || '');
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Registration failed.' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }
    const result = store.loginUser(email, password);
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (error) {
    res.status(401).json({ error: error instanceof Error ? error.message : 'Invalid credentials.' });
  }
});

app.post('/api/auth/demo', (_req, res) => {
  try {
    const result = store.loginDemoUser();
    setSessionCookie(res, result.token);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : 'Demo login failed.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = extractSessionToken(req);
  store.logoutSession(token);
  clearSessionCookie(res);
  res.json({ success: true });
});

app.get('/api/auth/me', (req, res) => {
  const token = extractSessionToken(req);
  const user = store.getUserByToken(token);
  if (!user) {
    res.status(401).json({ error: 'Not authenticated' });
    return;
  }
  res.json({ user });
});

// Tracked Cases (Longitudinal Links)
app.get('/api/cases', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({ cases: store.listCases(user.id) });
});

app.post('/api/cases', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const { title, bodyLocation } = req.body as { title?: string; bodyLocation?: string };
  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Case title is required.' });
    return;
  }
  const created = store.createCase(user.id, title, bodyLocation || 'Unspecified');
  res.json({ lesionCase: created });
});

app.patch('/api/cases/:id', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const updated = store.updateCase(user.id, req.params.id, req.body);
    res.json({ lesionCase: updated });
  } catch (error) {
    res.status(404).json({ error: error instanceof Error ? error.message : 'Case not found.' });
  }
});

// Scans & Skin Analysis
app.get('/api/scans', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({ scans: store.listScans(user.id) });
});

app.post('/api/analyze/auto-tag', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { imageDataUrl, languageCode } = req.body as {
      imageDataUrl?: string;
      languageCode?: string;
    };
    if (!imageDataUrl) {
      res.status(400).json({ error: 'Scan image is required for AI auto-tagging.' });
      return;
    }
    const suggestion = await suggestBodyLocationTags({
      imageDataUrl,
      languageCode: languageCode || 'en',
    });
    res.json(suggestion);
  } catch (error) {
    console.error('Auto-tag error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to suggest body location tags.',
    });
  }
});

app.post('/api/analyze/clinical-summary', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const {
      caseId,
      caseTitle,
      bodyLocation,
      symptoms,
      customNotes,
      tags,
      latestScanId,
      qualityOnlyMetrics,
      sessionDurationSeconds,
      languageCode,
    } = req.body as {
      caseId?: string;
      caseTitle?: string;
      bodyLocation?: string;
      symptoms?: string;
      customNotes?: string;
      tags?: string[];
      latestScanId?: string;
      qualityOnlyMetrics?: ImageQualityMetrics | null;
      sessionDurationSeconds?: number;
      languageCode?: string;
    };

    const targetCase = caseId
      ? store.listCases(user.id).find((c) => c.id === caseId)
      : undefined;

    const caseScans = targetCase
      ? store
          .listScans(user.id)
          .filter((s) => s.caseId === targetCase.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      : [];

    const caseComparisons = targetCase
      ? store
          .listComparisons(user.id)
          .filter((c) => c.caseId === targetCase.id)
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      : [];

    const matchedScan = latestScanId
      ? caseScans.find((s) => s.id === latestScanId) || store.getScan(user.id, latestScanId)
      : caseScans[caseScans.length - 1];

    const summaryParagraph = await generateLesionClinicalSummaryParagraph({
      caseTitle: (caseTitle || targetCase?.title || 'Tracked Skin Lesion').trim(),
      bodyLocation: (bodyLocation || targetCase?.bodyLocation || 'Unspecified Area').trim(),
      createdAt: targetCase?.createdAt,
      symptoms: symptoms || matchedScan?.symptoms,
      customNotes: customNotes || matchedScan?.customNotes,
      tags: tags && tags.length > 0 ? tags : matchedScan?.tags,
      sessionDurationSeconds:
        sessionDurationSeconds ?? matchedScan?.metadata?.sessionDurationSeconds,
      latestScan: matchedScan
        ? {
            createdAt: matchedScan.createdAt,
            primaryCondition: matchedScan.analysis.primaryCondition,
            confidenceScore: matchedScan.analysis.confidenceScore,
            uncertaintyMargin: matchedScan.analysis.uncertaintyMargin,
            severityLevel: matchedScan.analysis.severityLevel,
            qualityOverallScore: matchedScan.qualityMetrics.overallScore,
            qualityStatus: matchedScan.qualityMetrics.status,
            problemCheckingMessage: matchedScan.analysis.problemCheckingMessage,
          }
        : null,
      qualityOnlyMetrics: qualityOnlyMetrics || null,
      historicalScans: caseScans.map((s) => ({
        createdAt: s.createdAt,
        primaryCondition: s.analysis.primaryCondition,
        confidenceScore: s.analysis.confidenceScore,
        severityLevel: s.analysis.severityLevel,
      })),
      historicalComparisons: caseComparisons.map((c) => ({
        createdAt: c.createdAt,
        progressionStatus: c.progressionStatus,
        confidenceScore: c.confidenceScore,
        changeSummary: c.changeSummary,
      })),
      languageCode: languageCode || 'en',
    });

    res.json({ summaryParagraph });
  } catch (error) {
    console.error('Clinical summary error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to generate clinical summary.',
    });
  }
});

app.post('/api/analyze', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const {
      imageDataUrl,
      qualityMetrics,
      caseId,
      newCaseTitle,
      bodyLocation,
      symptoms,
      customNotes,
      tags,
      languageCode,
      sessionDurationSeconds,
    } = req.body as {
      imageDataUrl?: string;
      qualityMetrics?: ImageQualityMetrics;
      caseId?: string;
      newCaseTitle?: string;
      bodyLocation?: string;
      symptoms?: string;
      customNotes?: string;
      tags?: string[];
      languageCode?: string;
      sessionDurationSeconds?: number;
    };

    if (!imageDataUrl || !qualityMetrics) {
      res.status(400).json({ error: 'Preprocessed image and quality metrics are required.' });
      return;
    }

    let targetCase = store.listCases(user.id).find((c) => c.id === caseId);
    if (!targetCase) {
      targetCase = store.createCase(
        user.id,
        newCaseTitle?.trim() || `${bodyLocation || 'Skin'} Screening Case`,
        bodyLocation || 'Unspecified Area'
      );
    }

    const sanitizedTags = Array.isArray(tags)
      ? Array.from(
          new Set(
            tags
              .map((t) => (typeof t === 'string' ? t.trim().slice(0, 32) : ''))
              .filter(Boolean)
          )
        ).slice(0, 12)
      : [];

    const sanitizedNotes = typeof customNotes === 'string' ? customNotes.trim().slice(0, 1000) : '';

    const normalizedDurationSeconds =
      typeof sessionDurationSeconds === 'number' &&
      Number.isFinite(sessionDurationSeconds) &&
      sessionDurationSeconds > 0
        ? Math.max(1, Math.min(86400, Math.round(sessionDurationSeconds)))
        : undefined;

    const analysis = await analyzeSkinImage({
      imageDataUrl,
      qualityMetrics,
      bodyLocation: bodyLocation || targetCase.bodyLocation,
      symptoms: [symptoms || '', sanitizedNotes].filter(Boolean).join(' | '),
      languageCode: languageCode || 'en',
    });

    const scan = store.addScan({
      userId: user.id,
      caseId: targetCase.id,
      caseTitle: targetCase.title,
      bodyLocation: bodyLocation || targetCase.bodyLocation,
      symptoms: symptoms || '',
      customNotes: sanitizedNotes || undefined,
      tags: sanitizedTags.length > 0 ? sanitizedTags : undefined,
      imageDataUrl,
      qualityMetrics,
      analysis,
      metadata:
        normalizedDurationSeconds !== undefined
          ? {
              sessionDurationSeconds: normalizedDurationSeconds,
              recordedAt: new Date().toISOString(),
            }
          : undefined,
    });

    res.json({ scan, lesionCase: targetCase });
  } catch (error) {
    console.error('Analyze error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to analyze skin image.',
    });
  }
});

app.delete('/api/scans/:id', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const deleted = store.deleteScan(user.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Scan report not found.' });
    return;
  }
  res.json({ success: true });
});

// Longitudinal Comparison
app.get('/api/comparisons', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({ comparisons: store.listComparisons(user.id) });
});

app.post('/api/compare', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { previousScanId, currentScanId, languageCode } = req.body as {
      previousScanId?: string;
      currentScanId?: string;
      languageCode?: string;
    };

    if (!previousScanId || !currentScanId) {
      res.status(400).json({ error: 'Both previous and current scan IDs are required.' });
      return;
    }

    const prevScan = store.getScan(user.id, previousScanId);
    const currScan = store.getScan(user.id, currentScanId);
    if (!prevScan || !currScan) {
      res.status(404).json({ error: 'One or both selected scans could not be found.' });
      return;
    }

    const cmpResult = await compareSkinImages({
      previousImageUrl: prevScan.imageDataUrl,
      previousDate: prevScan.createdAt,
      previousCondition: prevScan.analysis.primaryCondition,
      currentImageUrl: currScan.imageDataUrl,
      currentDate: currScan.createdAt,
      currentCondition: currScan.analysis.primaryCondition,
      bodyLocation: currScan.bodyLocation || prevScan.bodyLocation,
      languageCode: languageCode || 'en',
    });

    const comparison = store.addComparison({
      userId: user.id,
      caseId: currScan.caseId,
      caseTitle: currScan.caseTitle,
      previousScanId: prevScan.id,
      currentScanId: currScan.id,
      ...cmpResult,
    });

    res.json({ comparison });
  } catch (error) {
    console.error('Compare error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to compare longitudinal images.',
    });
  }
});

// Public Longitudinal URL Link Endpoint
app.get('/api/public/case/:shareToken', (req, res) => {
  const payload = store.getPublicCaseByToken(req.params.shareToken);
  if (!payload) {
    res.status(404).json({ error: 'Longitudinal report link is invalid or sharing has been disabled.' });
    return;
  }
  res.json(payload);
});

// Lesion Follow-Up Scheduling & Reminders
app.get('/api/reminders', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  res.json({ reminders: store.listReminders(user.id) });
});

app.post('/api/reminders', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const { caseId, dueDate, note, notifyEnabled } = req.body as {
      caseId?: string;
      dueDate?: string;
      note?: string;
      notifyEnabled?: boolean;
    };
    if (!caseId || !dueDate) {
      res.status(400).json({ error: 'Lesion case and follow-up date are required.' });
      return;
    }
    const reminder = store.createReminder(user.id, {
      caseId,
      dueDate,
      note,
      notifyEnabled,
    });
    res.json({ reminder });
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : 'Failed to schedule follow-up reminder.',
    });
  }
});

app.patch('/api/reminders/:id', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  try {
    const updated = store.updateReminder(user.id, req.params.id, req.body);
    res.json({ reminder: updated });
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : 'Follow-up task not found.',
    });
  }
});

app.delete('/api/reminders/:id', (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;
  const deleted = store.deleteReminder(user.id, req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Follow-up task not found.' });
    return;
  }
  res.json({ success: true });
});

// Multilingual Voice Assistant Endpoints
app.post('/api/voice/transcribe', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { base64Audio, mimeType, languageCode } = req.body as {
      base64Audio?: string;
      mimeType?: string;
      languageCode?: string;
    };
    if (!base64Audio) {
      res.status(400).json({ error: 'Audio recording data is required.' });
      return;
    }
    const transcript = await transcribeVoiceAudio({
      base64Audio,
      mimeType: mimeType || 'audio/webm',
      languageCode: languageCode || 'en',
    });
    res.json({ transcript });
  } catch (error) {
    console.error('Transcription error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to transcribe voice audio.',
    });
  }
});

app.post('/api/voice/ask', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { question, languageCode, scanId, comparisonId, personality } = req.body as {
      question?: string;
      languageCode?: string;
      scanId?: string;
      comparisonId?: string;
      personality?: 'clinical' | 'empathetic' | 'concise';
    };
    if (!question || !question.trim()) {
      res.status(400).json({ error: 'A question is required.' });
      return;
    }

    let scanContext = '';
    if (scanId) {
      const scan = store.getScan(user.id, scanId);
      if (scan) {
        scanContext += `Selected Scan (${scan.createdAt}) - Location: ${scan.bodyLocation}, Primary Assessment: ${scan.analysis.primaryCondition} (Confidence: ${scan.analysis.confidenceScore}%), Severity: ${scan.analysis.severityLevel}, Problem Checking Message: ${scan.analysis.problemCheckingMessage}, Summary: ${scan.analysis.clinicalSummary}`;
      }
    }
    if (comparisonId) {
      const cmp = store.listComparisons(user.id).find((c) => c.id === comparisonId);
      if (cmp) {
        scanContext += `\nComparison Status: ${cmp.progressionStatus} (Confidence: ${cmp.confidenceScore}%). Delta: ${cmp.changeSummary}. Problem Checking Message: ${cmp.problemCheckingMessage}`;
      }
    }
    const recentScans = store.listScans(user.id).slice(0, 5);
    if (recentScans.length > 0) {
      const recentSummary = recentScans
        .map(
          (s, idx) =>
            `${idx + 1}. ${s.createdAt.slice(0, 10)} (${s.bodyLocation}): ${s.analysis.primaryCondition}, Confidence ${s.analysis.confidenceScore}%, Severity ${s.analysis.severityLevel}`
        )
        .join('; ');
      scanContext += `${scanContext ? '\n' : ''}Recent Scans (${recentScans.length}): ${recentSummary}`;
    }

    const validPersonality =
      personality === 'clinical' || personality === 'empathetic' || personality === 'concise'
        ? personality
        : undefined;

    const answer = await askVoiceAssistant({
      question: question.trim(),
      languageCode: languageCode || 'en',
      scanContext: scanContext || undefined,
      personality: validPersonality,
    });

    res.json({ answer });
  } catch (error) {
    console.error('Voice ask error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to get voice assistant response.',
    });
  }
});

app.post('/api/voice/tts', async (req, res) => {
  const user = requireAuth(req, res);
  if (!user) return;

  try {
    const { text, languageCode, sourceLanguageCode, personality } = req.body as {
      text?: string;
      languageCode?: string;
      sourceLanguageCode?: string;
      personality?: 'clinical' | 'empathetic' | 'concise';
    };
    if (!text || !text.trim()) {
      res.status(400).json({ error: 'Text is required for speech synthesis.' });
      return;
    }
    const validPersonality =
      personality === 'clinical' || personality === 'empathetic' || personality === 'concise'
        ? personality
        : undefined;

    const audio = await synthesizeVoiceSpeech({
      text: text.trim().slice(0, 1800),
      languageCode: languageCode || 'en',
      sourceLanguageCode,
      personality: validPersonality,
    });
    res.json(audio);
  } catch (error) {
    console.error('TTS error:', error);
    res.status(500).json({
      error: error instanceof Error ? error.message : 'Failed to synthesize voice audio.',
    });
  }
});

// Serve Vite Dev Server or Production Dist
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';
  const distDir = path.resolve(process.cwd(), 'dist');

  if (isProduction && fs.existsSync(distDir)) {
    app.use('/src/assets', express.static(path.join(distDir, 'src/assets')));
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SkinSense server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start SkinSense server:', err);
  process.exit(1);
});
