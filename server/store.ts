import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  FollowUpReminder,
  LesionCase,
  LongitudinalComparison,
  PublicCasePayload,
  SkinScanRecord,
  UserProfile,
} from '../src/types.ts';

interface StoredUser extends UserProfile {
  passwordHash: string;
  passwordSalt: string;
}

interface StoredSession {
  token: string;
  userId: string;
  expiresAt: string;
}

interface StoreData {
  users: StoredUser[];
  sessions: StoredSession[];
  cases: LesionCase[];
  scans: SkinScanRecord[];
  comparisons: LongitudinalComparison[];
  reminders: FollowUpReminder[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_PATH = path.join(DATA_DIR, 'skinsense-store.json');

function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { hash: derived, salt: actualSalt };
}

function verifyPassword(password: string, expectedHash: string, salt: string): boolean {
  const { hash } = hashPassword(password, salt);
  const hashBuf = Buffer.from(hash, 'hex');
  const expectedBuf = Buffer.from(expectedHash, 'hex');
  if (hashBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(hashBuf, expectedBuf);
}

function createInitialSeedData(): StoreData {
  const demoUserId = 'usr_demo_skinsense';
  const { hash, salt } = hashPassword('SkinSense2026!');
  const baselineTime = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString();
  const followupTime = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const upcomingDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const demoCaseId = 'case_forearm_01';
  const baselineScanId = 'scan_baseline_01';
  const followupScanId = 'scan_followup_02';

  return {
    users: [
      {
        id: demoUserId,
        email: 'demo@skinsense.health',
        fullName: 'Dr. Elena Vance (Demo Patient)',
        passwordHash: hash,
        passwordSalt: salt,
        createdAt: baselineTime,
      },
    ],
    sessions: [],
    cases: [
      {
        id: demoCaseId,
        userId: demoUserId,
        title: 'Left Dorsal Forearm Lesion',
        bodyLocation: 'Left Forearm',
        shareToken: 'ss-long-forearm-8421',
        shareEnabled: true,
        createdAt: baselineTime,
        updatedAt: followupTime,
      },
    ],
    scans: [
      {
        id: baselineScanId,
        userId: demoUserId,
        caseId: demoCaseId,
        caseTitle: 'Left Dorsal Forearm Lesion',
        bodyLocation: 'Left Forearm',
        symptoms: 'Asymptomatic flat pigmented spot, ~4 mm diameter, noticed during annual check.',
        customNotes: 'Captured outdoors in indirect morning daylight before applying moisturizer.',
        tags: ['Baseline', 'Sun-Exposed'],
        imageDataUrl: '/src/assets/images/sample_lesion_baseline_1795185793387.jpg',
        qualityMetrics: {
          width: 1024,
          height: 1024,
          sharpnessScore: 91,
          brightnessScore: 78,
          contrastScore: 74,
          overallScore: 86,
          status: 'pass',
          problemCheckingMessage: 'Quality verified: Crisp macro focus, balanced illumination, and clear perilesional contrast.',
          preprocessingApplied: ['White-Balance Normalization', 'Centered ROI Framing'],
        },
        analysis: {
          primaryCondition: 'Benign Junctional Melanocytic Nevus',
          confidenceScore: 88,
          uncertaintyMargin: 5,
          severityLevel: 'routine',
          problemCheckingMessage: 'Routine Monitoring: Borders appear symmetric and uniform. No immediate high-risk morphological red flags detected; continue periodic photographic tracking.',
          redFlagChecklist: [
            'No rapid asymmetric expansion observed',
            'Uniform light-brown pigmentation without dark satellite nodules',
            'No surface ulceration or spontaneous bleeding',
          ],
          clinicalSummary: 'Well-circumscribed, symmetrical pigmented macule (~4 mm) exhibiting homogeneous light-brown pigment distribution and regular borders consistent with a benign nevus.',
          morphology: {
            asymmetry: 'Symmetric across both perpendicular axes',
            borderRegularity: 'Sharp, smooth, regular circumference',
            colorVariation: 'Uniform tan-brown pigmentation',
            erythemaLevel: 'None visible in perilesional skin',
            surfaceTexture: 'Smooth, intact skin markings',
          },
          differentials: [
            { name: 'Benign Melanocytic Nevus', probability: 88, notes: 'Uniform shape and color distribution.' },
            { name: 'Solar Lentigo', probability: 9, notes: 'Flat sun-exposed macule with regular edges.' },
            { name: 'Early Seborrheic Keratosis', probability: 3, notes: 'Minimal surface verrucous texture.' },
          ],
          recommendations: [
            'Archive this baseline image and capture a follow-up scan in 4 to 8 weeks.',
            'Apply broad-spectrum SPF 30+ sunscreen to the left forearm daily.',
            'Consult a board-certified dermatologist if rapid darkening, itching, or diameter growth occurs.',
          ],
          voiceSummary: 'Your baseline scan shows a uniform, well-bordered spot consistent with a benign melanocytic nevus at 88 percent confidence. No urgent red flags were found; routine monitoring is recommended.',
          languageCode: 'en',
        },
        metadata: {
          sessionDurationSeconds: 142,
          recordedAt: baselineTime,
        },
        createdAt: baselineTime,
      },
      {
        id: followupScanId,
        userId: demoUserId,
        caseId: demoCaseId,
        caseTitle: 'Left Dorsal Forearm Lesion',
        bodyLocation: 'Left Forearm',
        symptoms: 'Mild localized redness and slight dry scaling noticed over the past 5 days.',
        customNotes: 'Measured with millimeter scale card; mild itch after swimming.',
        tags: ['Follow-Up', 'Itching', 'Scaling'],
        imageDataUrl: '/src/assets/images/sample_lesion_followup_1795185793686.jpg',
        qualityMetrics: {
          width: 1024,
          height: 1024,
          sharpnessScore: 89,
          brightnessScore: 80,
          contrastScore: 79,
          overallScore: 85,
          status: 'pass',
          problemCheckingMessage: 'Quality verified: Reference millimeter scale detected, clear epidermal surface detail, zero motion blur.',
          preprocessingApplied: ['White-Balance Normalization', 'Glare Reduction Contrast Curve'],
        },
        analysis: {
          primaryCondition: 'Nummular Eczema / Localized Tinea Corporis',
          confidenceScore: 82,
          uncertaintyMargin: 6,
          severityLevel: 'monitor',
          problemCheckingMessage: 'Medical Review Recommended: Active erythema and peripheral scaling detected compared to typical benign spots. Schedule a non-urgent dermatology or primary care evaluation for targeted topical management.',
          redFlagChecklist: [
            'Peripheral dry scaling and erythematous rim present',
            'Mild localized inflammatory redness (~18 mm plaque)',
            'No deep ulceration or necrotic crusting observed',
          ],
          clinicalSummary: 'Coin-shaped erythematous plaque with fine peripheral scaling and mildly accentuated border. Differential includes nummular dermatitis and superficial fungal tinea corporis.',
          morphology: {
            asymmetry: 'Mildly oval configuration',
            borderRegularity: 'Slightly raised erythematous rim with scale',
            colorVariation: 'Pink-red erythema with subtle tan border',
            erythemaLevel: 'Moderate localized perilesional erythema',
            surfaceTexture: 'Fine dry epidermal desquamation',
          },
          differentials: [
            { name: 'Nummular Dermatitis (Eczema)', probability: 48, notes: 'Annular erythematous plaque with surface dryness.' },
            { name: 'Tinea Corporis', probability: 34, notes: 'Active scaling border with mild central clearing.' },
            { name: 'Contact Dermatitis', probability: 18, notes: 'Localized inflammatory reaction.' },
          ],
          recommendations: [
            'Avoid scratching or applying unprescribed steroid creams until evaluated, as steroids can mask fungal infections.',
            'Keep the area clean and dry; use fragrance-free gentle cleansers.',
            'Share your longitudinal comparison report with a clinician within 1 to 2 weeks.',
          ],
          voiceSummary: 'This follow-up scan shows moderate redness and fine scaling with an 82 percent confidence rating, likely nummular dermatitis or superficial tinea. A non-urgent clinical visit is recommended for proper confirmation.',
          languageCode: 'en',
        },
        metadata: {
          sessionDurationSeconds: 198,
          recordedAt: followupTime,
        },
        createdAt: followupTime,
      },
    ],
    comparisons: [
      {
        id: 'cmp_forearm_01',
        userId: demoUserId,
        caseId: demoCaseId,
        caseTitle: 'Left Dorsal Forearm Lesion',
        previousScanId: baselineScanId,
        currentScanId: followupScanId,
        progressionStatus: 'evolving',
        confidenceScore: 87,
        problemCheckingMessage: 'Interval Change Detected: Noticeable shift from flat tan macule to an erythematous, mildly scaling plaque over 19 days. Clinical evaluation is advised to differentiate inflammatory dermatitis from superficial infection.',
        changeSummary: 'Over the 19-day interval, the lesion transitioned from a uniform 4 mm tan macule to a larger erythematous patch displaying peripheral scaling and active border inflammation.',
        visualDeltas: {
          sizeAndArea: 'Apparent diameter increased from ~4 mm baseline to ~16–18 mm patch.',
          borderEvolution: 'Shifted from smooth flat margin to mildly raised scaling rim.',
          pigmentationShift: 'Changed from uniform light brown to pink-red erythema.',
          inflammationChange: 'Increased localized erythema and epidermal dryness.',
        },
        clinicalNextSteps: [
          'Book a dermatology or primary care appointment and bring the exported PDF longitudinal report.',
          'Avoid fragranced lotions and harsh soaps on the left forearm.',
          'Capture another photo in 7 days if treatment is initiated to track resolution.',
        ],
        voiceSummary: 'Comparing your current scan against the baseline from 19 days ago reveals an evolving inflammatory change with increased redness and peripheral scaling. Please share this longitudinal report with a healthcare provider.',
        languageCode: 'en',
        createdAt: followupTime,
      },
    ],
    reminders: [
      {
        id: 'rem_forearm_01',
        userId: demoUserId,
        caseId: demoCaseId,
        caseTitle: 'Left Dorsal Forearm Lesion',
        bodyLocation: 'Left Forearm',
        dueDate: upcomingDate,
        note: 'Capture follow-up macro scan in daylight to track scaling and erythema resolution.',
        notifyEnabled: true,
        completed: false,
        createdAt: followupTime,
        updatedAt: followupTime,
      },
    ],
  };
}

class SkinSenseStore {
  private data: StoreData;

  constructor() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      this.data = createInitialSeedData();
      this.save();
    } else {
      try {
        const raw = fs.readFileSync(STORE_PATH, 'utf8');
        this.data = JSON.parse(raw) as StoreData;
        if (!Array.isArray(this.data.reminders)) {
          this.data.reminders = [];
          this.save();
        }
      } catch {
        this.data = createInitialSeedData();
        this.save();
      }
    }
  }

  private save(): void {
    const tmpPath = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), 'utf8');
    fs.renameSync(tmpPath, STORE_PATH);
  }

  private sanitizeUser(user: StoredUser): UserProfile {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      createdAt: user.createdAt,
    };
  }

  registerUser(email: string, password: string, fullName: string): { user: UserProfile; token: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const existing = this.data.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (existing) {
      throw new Error('An account with this email already exists.');
    }
    const { hash, salt } = hashPassword(password);
    const newUser: StoredUser = {
      id: `usr_${crypto.randomBytes(6).toString('hex')}`,
      email: normalizedEmail,
      fullName: fullName.trim() || normalizedEmail.split('@')[0],
      passwordHash: hash,
      passwordSalt: salt,
      createdAt: new Date().toISOString(),
    };
    this.data.users.push(newUser);
    const token = this.createSession(newUser.id);
    this.save();
    return { user: this.sanitizeUser(newUser), token };
  }

  loginUser(email: string, password: string): { user: UserProfile; token: string } {
    const normalizedEmail = email.trim().toLowerCase();
    const found = this.data.users.find((u) => u.email.toLowerCase() === normalizedEmail);
    if (!found || !verifyPassword(password, found.passwordHash, found.passwordSalt)) {
      throw new Error('Invalid email or password.');
    }
    const token = this.createSession(found.id);
    this.save();
    return { user: this.sanitizeUser(found), token };
  }

  loginDemoUser(): { user: UserProfile; token: string } {
    let demoUser = this.data.users.find((u) => u.email === 'demo@skinsense.health');
    if (!demoUser) {
      const seeded = createInitialSeedData();
      this.data.users.push(...seeded.users);
      this.data.cases.push(...seeded.cases);
      this.data.scans.push(...seeded.scans);
      this.data.comparisons.push(...seeded.comparisons);
      this.data.reminders.push(...seeded.reminders);
      demoUser = seeded.users[0];
    }
    const token = this.createSession(demoUser.id);
    this.save();
    return { user: this.sanitizeUser(demoUser), token };
  }

  private createSession(userId: string): string {
    const now = Date.now();
    this.data.sessions = this.data.sessions.filter((s) => new Date(s.expiresAt).getTime() > now);
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(now + 7 * 24 * 60 * 60 * 1000).toISOString();
    this.data.sessions.push({ token, userId, expiresAt });
    return token;
  }

  getUserByToken(token: string | undefined): UserProfile | null {
    if (!token) return null;
    const session = this.data.sessions.find((s) => s.token === token);
    if (!session) return null;
    if (new Date(session.expiresAt).getTime() <= Date.now()) {
      this.data.sessions = this.data.sessions.filter((s) => s.token !== token);
      this.save();
      return null;
    }
    const user = this.data.users.find((u) => u.id === session.userId);
    return user ? this.sanitizeUser(user) : null;
  }

  logoutSession(token: string | undefined): void {
    if (!token) return;
    this.data.sessions = this.data.sessions.filter((s) => s.token !== token);
    this.save();
  }

  listCases(userId: string): LesionCase[] {
    return this.data.cases
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  createCase(userId: string, title: string, bodyLocation: string): LesionCase {
    const now = new Date().toISOString();
    const shareToken = `ss-${crypto.randomBytes(4).toString('hex')}`;
    const newCase: LesionCase = {
      id: `case_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      title: title.trim() || 'Tracked Skin Region',
      bodyLocation: bodyLocation.trim() || 'Unspecified Area',
      shareToken,
      shareEnabled: true,
      createdAt: now,
      updatedAt: now,
    };
    this.data.cases.unshift(newCase);
    this.save();
    return newCase;
  }

  updateCase(
    userId: string,
    caseId: string,
    updates: { title?: string; bodyLocation?: string; shareEnabled?: boolean; regenerateToken?: boolean }
  ): LesionCase {
    const target = this.data.cases.find((c) => c.id === caseId && c.userId === userId);
    if (!target) {
      throw new Error('Tracked case not found.');
    }
    if (typeof updates.title === 'string' && updates.title.trim()) {
      target.title = updates.title.trim();
    }
    if (typeof updates.bodyLocation === 'string' && updates.bodyLocation.trim()) {
      target.bodyLocation = updates.bodyLocation.trim();
    }
    if (typeof updates.shareEnabled === 'boolean') {
      target.shareEnabled = updates.shareEnabled;
    }
    if (updates.regenerateToken) {
      target.shareToken = `ss-${crypto.randomBytes(4).toString('hex')}`;
    }
    target.updatedAt = new Date().toISOString();
    this.save();
    return target;
  }

  listScans(userId: string): SkinScanRecord[] {
    return this.data.scans
      .filter((s) => s.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  getScan(userId: string, scanId: string): SkinScanRecord | undefined {
    return this.data.scans.find((s) => s.id === scanId && s.userId === userId);
  }

  addScan(scan: Omit<SkinScanRecord, 'id' | 'createdAt'>): SkinScanRecord {
    const now = new Date().toISOString();
    const record: SkinScanRecord = {
      ...scan,
      id: `scan_${crypto.randomBytes(6).toString('hex')}`,
      createdAt: now,
    };
    this.data.scans.unshift(record);
    const parentCase = this.data.cases.find((c) => c.id === scan.caseId && c.userId === scan.userId);
    if (parentCase) {
      parentCase.updatedAt = now;
    }
    this.save();
    return record;
  }

  deleteScan(userId: string, scanId: string): boolean {
    const idx = this.data.scans.findIndex((s) => s.id === scanId && s.userId === userId);
    if (idx === -1) return false;
    this.data.scans.splice(idx, 1);
    this.data.comparisons = this.data.comparisons.filter(
      (cmp) => cmp.previousScanId !== scanId && cmp.currentScanId !== scanId
    );
    this.save();
    return true;
  }

  listComparisons(userId: string): LongitudinalComparison[] {
    return this.data.comparisons
      .filter((c) => c.userId === userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  addComparison(cmp: Omit<LongitudinalComparison, 'id' | 'createdAt'>): LongitudinalComparison {
    const now = new Date().toISOString();
    const record: LongitudinalComparison = {
      ...cmp,
      id: `cmp_${crypto.randomBytes(6).toString('hex')}`,
      createdAt: now,
    };
    this.data.comparisons.unshift(record);
    this.save();
    return record;
  }

  getPublicCaseByToken(shareToken: string): PublicCasePayload | null {
    const targetCase = this.data.cases.find((c) => c.shareToken === shareToken && c.shareEnabled);
    if (!targetCase) return null;

    const scans = this.data.scans
      .filter((s) => s.caseId === targetCase.id && s.userId === targetCase.userId)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    const comparisons = this.data.comparisons
      .filter((cmp) => cmp.caseId === targetCase.id && cmp.userId === targetCase.userId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return {
      caseInfo: {
        id: targetCase.id,
        title: targetCase.title,
        bodyLocation: targetCase.bodyLocation,
        shareToken: targetCase.shareToken,
        createdAt: targetCase.createdAt,
        updatedAt: targetCase.updatedAt,
      },
      scans,
      comparisons,
    };
  }

  listReminders(userId: string): FollowUpReminder[] {
    return this.data.reminders
      .filter((r) => r.userId === userId)
      .sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return a.dueDate.localeCompare(b.dueDate);
      });
  }

  createReminder(
    userId: string,
    payload: { caseId: string; dueDate: string; note?: string; notifyEnabled?: boolean }
  ): FollowUpReminder {
    const targetCase = this.data.cases.find((c) => c.id === payload.caseId && c.userId === userId);
    if (!targetCase) {
      throw new Error('Selected lesion case not found.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.dueDate)) {
      throw new Error('A valid follow-up date (YYYY-MM-DD) is required.');
    }
    const now = new Date().toISOString();
    const record: FollowUpReminder = {
      id: `rem_${crypto.randomBytes(6).toString('hex')}`,
      userId,
      caseId: targetCase.id,
      caseTitle: targetCase.title,
      bodyLocation: targetCase.bodyLocation,
      dueDate: payload.dueDate,
      note: (payload.note || '').trim().slice(0, 400),
      notifyEnabled: Boolean(payload.notifyEnabled),
      completed: false,
      createdAt: now,
      updatedAt: now,
    };
    this.data.reminders.unshift(record);
    this.save();
    return record;
  }

  updateReminder(
    userId: string,
    reminderId: string,
    updates: { dueDate?: string; note?: string; notifyEnabled?: boolean; completed?: boolean }
  ): FollowUpReminder {
    const target = this.data.reminders.find((r) => r.id === reminderId && r.userId === userId);
    if (!target) {
      throw new Error('Follow-up task not found.');
    }
    if (typeof updates.dueDate === 'string') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(updates.dueDate)) {
        throw new Error('A valid follow-up date (YYYY-MM-DD) is required.');
      }
      target.dueDate = updates.dueDate;
    }
    if (typeof updates.note === 'string') {
      target.note = updates.note.trim().slice(0, 400);
    }
    if (typeof updates.notifyEnabled === 'boolean') {
      target.notifyEnabled = updates.notifyEnabled;
    }
    if (typeof updates.completed === 'boolean') {
      target.completed = updates.completed;
      target.completedAt = updates.completed ? new Date().toISOString() : undefined;
    }
    target.updatedAt = new Date().toISOString();
    this.save();
    return target;
  }

  deleteReminder(userId: string, reminderId: string): boolean {
    const idx = this.data.reminders.findIndex((r) => r.id === reminderId && r.userId === userId);
    if (idx === -1) return false;
    this.data.reminders.splice(idx, 1);
    this.save();
    return true;
  }
}

export const store = new SkinSenseStore();
