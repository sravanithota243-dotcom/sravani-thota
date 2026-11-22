import type {
  FollowUpReminder,
  ImageQualityMetrics,
  LesionCase,
  LongitudinalComparison,
  PublicCasePayload,
  SkinScanRecord,
  UserProfile,
} from '../types';

const TOKEN_STORAGE_KEY = 'skinsense_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota/sandbox failures
  }
}

async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export const api = {
  getMe: () => apiFetch<{ user: UserProfile }>('/api/auth/me'),

  register: async (email: string, password: string, fullName: string) => {
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  login: async (email: string, password: string) => {
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(res.token);
    return res.user;
  },

  loginDemo: async () => {
    const res = await apiFetch<{ user: UserProfile; token: string }>('/api/auth/demo', {
      method: 'POST',
    });
    setStoredToken(res.token);
    return res.user;
  },

  logout: async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      setStoredToken(null);
    }
  },

  listCases: () => apiFetch<{ cases: LesionCase[] }>('/api/cases'),

  createCase: (title: string, bodyLocation: string) =>
    apiFetch<{ lesionCase: LesionCase }>('/api/cases', {
      method: 'POST',
      body: JSON.stringify({ title, bodyLocation }),
    }),

  updateCase: (
    id: string,
    updates: { title?: string; bodyLocation?: string; shareEnabled?: boolean; regenerateToken?: boolean }
  ) =>
    apiFetch<{ lesionCase: LesionCase }>(`/api/cases/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  listScans: () => apiFetch<{ scans: SkinScanRecord[] }>('/api/scans'),

  autoTagBodyLocation: (payload: { imageDataUrl: string; languageCode?: string }) =>
    apiFetch<{ primaryLocation: string; suggestedTags: string[]; visualCues: string }>(
      '/api/analyze/auto-tag',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  generateClinicalSummary: (payload: {
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
  }) =>
    apiFetch<{ summaryParagraph: string }>('/api/analyze/clinical-summary', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  analyzeScan: (payload: {
    imageDataUrl: string;
    qualityMetrics: ImageQualityMetrics;
    caseId?: string;
    newCaseTitle?: string;
    bodyLocation: string;
    symptoms: string;
    customNotes?: string;
    tags?: string[];
    languageCode: string;
    sessionDurationSeconds?: number;
  }) =>
    apiFetch<{ scan: SkinScanRecord; lesionCase: LesionCase }>('/api/analyze', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  deleteScan: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/scans/${id}`, {
      method: 'DELETE',
    }),

  listComparisons: () => apiFetch<{ comparisons: LongitudinalComparison[] }>('/api/comparisons'),

  compareScans: (payload: { previousScanId: string; currentScanId: string; languageCode: string }) =>
    apiFetch<{ comparison: LongitudinalComparison }>('/api/compare', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getPublicCase: (shareToken: string) =>
    apiFetch<PublicCasePayload>(`/api/public/case/${encodeURIComponent(shareToken)}`),

  transcribeAudio: (base64Audio: string, mimeType: string, languageCode: string) =>
    apiFetch<{ transcript: string }>('/api/voice/transcribe', {
      method: 'POST',
      body: JSON.stringify({ base64Audio, mimeType, languageCode }),
    }),

  askVoiceAssistant: (payload: {
    question: string;
    languageCode: string;
    scanId?: string;
    comparisonId?: string;
    personality?: string;
  }) =>
    apiFetch<{ answer: string }>('/api/voice/ask', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  synthesizeTts: (
    text: string,
    languageCode: string,
    sourceLanguageCode?: string,
    personality?: string
  ) =>
    apiFetch<{ base64Wav: string; mimeType: string; spokenText: string }>('/api/voice/tts', {
      method: 'POST',
      body: JSON.stringify({ text, languageCode, sourceLanguageCode, personality }),
    }),

  listReminders: () => apiFetch<{ reminders: FollowUpReminder[] }>('/api/reminders'),

  createReminder: (payload: {
    caseId: string;
    dueDate: string;
    note?: string;
    notifyEnabled?: boolean;
  }) =>
    apiFetch<{ reminder: FollowUpReminder }>('/api/reminders', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  updateReminder: (
    id: string,
    updates: { dueDate?: string; note?: string; notifyEnabled?: boolean; completed?: boolean }
  ) =>
    apiFetch<{ reminder: FollowUpReminder }>(`/api/reminders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),

  deleteReminder: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/reminders/${id}`, {
      method: 'DELETE',
    }),
};
