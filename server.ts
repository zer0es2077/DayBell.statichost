import 'dotenv/config';
import crypto from 'node:crypto';
import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  analyzeMessagesAndPacking,
  generateStudyPlan,
  importFromScreenshot,
  parseNaturalCommand,
  parsePastedLibrusContent,
} from './server/aiService.ts';
import type { CommutePlace, LessonSlot, SchoolMessage, SchoolTest } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// Server-only HMAC signing secret for owner AI session tokens (in-memory fallback if env unset)
const TOKEN_SIGNING_SECRET =
  process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16
    ? process.env.SESSION_SECRET.trim()
    : crypto.randomBytes(32).toString('hex');
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// One-time first-run claimed PIN hash (used only when process.env.OWNER_AI_PIN is unset)
let claimedPinRecord: { saltHex: string; hashHex: string } | null = null;
const revokedTokenIds = new Set<string>();

// Simple per-IP brute-force rate limiter for PIN unlock attempts
const pinAttemptsByIp = new Map<string, { count: number; resetAt: number }>();
const MAX_PIN_ATTEMPTS = 8;
const PIN_WINDOW_MS = 15 * 60 * 1000;

function getEnvOwnerPin(): string | null {
  const raw = process.env.OWNER_AI_PIN;
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw.trim();
  }
  return null;
}

function constantTimeStringMatch(a: string, b: string): boolean {
  const digestA = crypto.createHash('sha256').update(a).digest();
  const digestB = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(digestA, digestB);
}

function hashPin(pin: string): { saltHex: string; hashHex: string } {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(pin, salt, 64);
  return { saltHex: salt.toString('hex'), hashHex: derived.toString('hex') };
}

function verifyClaimedPin(pin: string, record: { saltHex: string; hashHex: string }): boolean {
  const salt = Buffer.from(record.saltHex, 'hex');
  const expected = Buffer.from(record.hashHex, 'hex');
  const actual = crypto.scryptSync(pin, salt, 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signOwnerToken(): string {
  const payload = {
    jti: crypto.randomBytes(12).toString('hex'),
    role: 'owner-ai',
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

function verifyOwnerToken(token: string | undefined): { valid: boolean; jti?: string } {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 2) return { valid: false };
  const [encoded, sig] = parts;
  if (!encoded || !sig) return { valid: false };

  const expectedSig = crypto
    .createHmac('sha256', TOKEN_SIGNING_SECRET)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig, 'utf8');
  const expectedBuf = Buffer.from(expectedSig, 'utf8');
  if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
    return { valid: false };
  }

  try {
    const decoded = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
      jti?: string;
      role?: string;
      exp?: number;
    };
    if (
      decoded.role !== 'owner-ai' ||
      typeof decoded.exp !== 'number' ||
      decoded.exp < Date.now() ||
      typeof decoded.jti !== 'string' ||
      revokedTokenIds.has(decoded.jti)
    ) {
      return { valid: false };
    }
    return { valid: true, jti: decoded.jti };
  } catch {
    return { valid: false };
  }
}

function extractBearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return undefined;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim();
}

function requireOwnerAiAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractBearerToken(req);
  const verified = verifyOwnerToken(token);
  if (!verified.valid) {
    res.status(403).json({
      error:
        'Built-in AI is locked with the Owner PIN. Use Step-by-Step Add, Local Paste, or Your Own AI import instead (0 quota used).',
      code: 'OWNER_PIN_REQUIRED',
    });
    return;
  }
  next();
}

function checkPinRateLimit(ip: string): { allowed: boolean; retryMinutes?: number } {
  const now = Date.now();
  const entry = pinAttemptsByIp.get(ip);
  if (!entry || entry.resetAt <= now) {
    return { allowed: true };
  }
  if (entry.count >= MAX_PIN_ATTEMPTS) {
    return { allowed: false, retryMinutes: Math.ceil((entry.resetAt - now) / 60000) };
  }
  return { allowed: true };
}

function recordPinFailure(ip: string): void {
  const now = Date.now();
  const entry = pinAttemptsByIp.get(ip);
  if (!entry || entry.resetAt <= now) {
    pinAttemptsByIp.set(ip, { count: 1, resetAt: now + PIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function clearPinFailures(ip: string): void {
  pinAttemptsByIp.delete(ip);
}

function formatApiError(err: unknown): { status: number; message: string } {
  const raw = err instanceof Error ? err.message : 'Unexpected server error.';
  if (
    raw.includes('PERMISSION_DENIED') ||
    raw.includes('API_KEY_INVALID') ||
    raw.includes('GEMINI_API_KEY')
  ) {
    return {
      status: 503,
      message:
        'AI service key is missing or invalid. Please verify your API key in Settings > Secrets.',
    };
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return {
      status: 429,
      message: 'AI quota reached temporarily. Please retry in a moment.',
    };
  }
  return { status: 500, message: raw };
}

function sanitizeDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallback;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '8mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });

  // Owner AI PIN status (never leaks PIN or secret)
  app.get('/api/owner/status', (req, res) => {
    const envPin = getEnvOwnerPin();
    const source: 'env' | 'claimed' | 'unclaimed' = envPin
      ? 'env'
      : claimedPinRecord
        ? 'claimed'
        : 'unclaimed';
    const token = extractBearerToken(req);
    const unlocked = verifyOwnerToken(token).valid;
    res.json({
      configured: source !== 'unclaimed',
      source,
      unlocked,
    });
  });

  // One-time bootstrap route when OWNER_AI_PIN env var is not configured yet
  app.post('/api/owner/setup', (req, res) => {
    if (getEnvOwnerPin() || claimedPinRecord) {
      res.status(409).json({ error: 'Owner PIN is already configured. Please unlock instead.' });
      return;
    }
    const body = req.body as { pin?: unknown };
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    if (pin.length < 4 || pin.length > 32) {
      res.status(400).json({ error: 'Choose an Owner PIN between 4 and 32 characters.' });
      return;
    }
    claimedPinRecord = hashPin(pin);
    const token = signOwnerToken();
    res.json({ unlocked: true, token, source: 'claimed' });
  });

  // Verify Owner PIN and return an in-memory Bearer token
  app.post('/api/owner/unlock', (req, res) => {
    const ip = req.ip || 'unknown';
    const rateCheck = checkPinRateLimit(ip);
    if (!rateCheck.allowed) {
      res.status(429).json({
        error: `Too many wrong PIN attempts. Try again in ${rateCheck.retryMinutes ?? 15} minutes.`,
      });
      return;
    }

    const envPin = getEnvOwnerPin();
    if (!envPin && !claimedPinRecord) {
      res.status(409).json({
        error: 'No Owner PIN set yet. Claim your Owner PIN first.',
        code: 'PIN_NOT_CONFIGURED',
      });
      return;
    }

    const body = req.body as { pin?: unknown };
    const pin = typeof body?.pin === 'string' ? body.pin.trim() : '';
    if (!pin || pin.length > 64) {
      res.status(400).json({ error: 'Enter your Owner PIN.' });
      return;
    }

    const valid = envPin
      ? constantTimeStringMatch(pin, envPin)
      : claimedPinRecord
        ? verifyClaimedPin(pin, claimedPinRecord)
        : false;

    if (!valid) {
      recordPinFailure(ip);
      res.status(401).json({ error: 'Incorrect Owner PIN.' });
      return;
    }

    clearPinFailures(ip);
    const token = signOwnerToken();
    res.json({ unlocked: true, token, source: envPin ? 'env' : 'claimed' });
  });

  // Revoke current Bearer token immediately
  app.post('/api/owner/lock', (req, res) => {
    const token = extractBearerToken(req);
    const verified = verifyOwnerToken(token);
    if (verified.valid && verified.jti) {
      revokedTokenIds.add(verified.jti);
    }
    res.json({ unlocked: false });
  });

  // Protect ALL built-in AI endpoints behind Owner PIN auth
  app.use('/api/ai', requireOwnerAiAuth);

  // Natural-language parser for smart rules, urgent one-off tasks, homework, exemptions, commute places
  app.post('/api/ai/parse-command', async (req, res) => {
    const body = req.body as {
      text?: unknown;
      today?: unknown;
      timetable?: unknown;
      commutePlaces?: unknown;
    };

    const text = typeof body?.text === 'string' ? body.text.trim() : '';
    if (text.length < 4 || text.length > 2000) {
      res.status(400).json({ error: 'Enter a sentence between 4 and 2,000 characters.' });
      return;
    }

    const today = sanitizeDate(body.today, new Date().toISOString().slice(0, 10));

    try {
      const result = await parseNaturalCommand({
        text,
        today,
        timetable: Array.isArray(body.timetable)
          ? (body.timetable as LessonSlot[]).slice(0, 120)
          : [],
        commutePlaces: Array.isArray(body.commutePlaces)
          ? (body.commutePlaces as CommutePlace[]).slice(0, 30)
          : [],
      });
      res.json({ result });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Multimodal Librus screenshot importer (PNG / JPEG / WebP up to 5MB)
  app.post('/api/ai/import-screenshot', async (req, res) => {
    const body = req.body as {
      imageBase64?: unknown;
      mimeType?: unknown;
      hint?: unknown;
      today?: unknown;
      weekStart?: unknown;
    };

    const mimeType = typeof body?.mimeType === 'string' ? body.mimeType.toLowerCase().trim() : '';
    if (!ALLOWED_IMAGE_MIMES.has(mimeType)) {
      res.status(400).json({ error: 'Only PNG, JPEG, or WebP screenshots are supported.' });
      return;
    }

    const rawBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64.trim() : '';
    const cleanedBase64 = rawBase64.replace(/^data:image\/[a-z+]+;base64,/i, '');
    if (!cleanedBase64 || !/^[A-Za-z0-9+/=]+$/.test(cleanedBase64)) {
      res.status(400).json({ error: 'Invalid screenshot image data.' });
      return;
    }

    const estimatedBytes = Math.floor((cleanedBase64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) {
      res.status(413).json({ error: 'Screenshot exceeds the 5 MB upload limit.' });
      return;
    }

    const today = sanitizeDate(body.today, new Date().toISOString().slice(0, 10));
    const weekStart = sanitizeDate(body.weekStart, today);
    const hint = typeof body.hint === 'string' ? body.hint.trim().slice(0, 300) : undefined;

    try {
      const imported = await importFromScreenshot({
        imageBase64: cleanedBase64,
        mimeType: mimeType as 'image/png' | 'image/jpeg' | 'image/webp',
        hint,
        today,
        weekStart,
      });
      res.json({ imported });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Paste text importer (Owner AI deep parse)
  app.post('/api/ai/parse-paste', async (req, res) => {
    const body = req.body as { rawText?: unknown; today?: unknown; weekStart?: unknown };
    const rawText = typeof body?.rawText === 'string' ? body.rawText.trim() : '';

    if (rawText.length < 10 || rawText.length > 20000) {
      res.status(400).json({ error: 'Paste between 10 and 20,000 characters of Librus content.' });
      return;
    }

    const today = sanitizeDate(body.today, new Date().toISOString().slice(0, 10));
    const weekStart = sanitizeDate(body.weekStart, today);

    try {
      const imported = await parsePastedLibrusContent({ rawText, today, weekStart });
      res.json({ imported });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // AI summarization + packing item & hidden test extraction
  app.post('/api/ai/analyze', async (req, res) => {
    const body = req.body as {
      messages?: unknown;
      timetable?: unknown;
      existingTests?: unknown;
      today?: unknown;
    };

    if (!Array.isArray(body?.messages) || body.messages.length === 0) {
      res.status(400).json({ error: 'Provide at least one message or announcement to summarize.' });
      return;
    }
    if (body.messages.length > 40) {
      res.status(400).json({ error: 'Too many messages in a single analysis batch (max 40).' });
      return;
    }

    const today = sanitizeDate(body.today, new Date().toISOString().slice(0, 10));

    try {
      const analysis = await analyzeMessagesAndPacking({
        messages: (body.messages as SchoolMessage[]).slice(0, 40),
        timetable: Array.isArray(body.timetable)
          ? (body.timetable as LessonSlot[]).slice(0, 120)
          : [],
        existingTests: Array.isArray(body.existingTests)
          ? (body.existingTests as SchoolTest[]).slice(0, 80)
          : [],
        today,
      });
      res.json({ analysis });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // AI advance study plan generator
  app.post('/api/ai/study-plan', async (req, res) => {
    const body = req.body as {
      test?: unknown;
      today?: unknown;
      leadDays?: unknown;
      dailyStudyMinutes?: unknown;
    };
    const test = body?.test as SchoolTest | undefined;

    if (
      !test ||
      typeof test.id !== 'string' ||
      typeof test.subject !== 'string' ||
      typeof test.date !== 'string'
    ) {
      res.status(400).json({ error: 'Valid test details are required to create a study plan.' });
      return;
    }

    const today = sanitizeDate(body.today, new Date().toISOString().slice(0, 10));
    const leadDays = typeof body.leadDays === 'number' ? body.leadDays : undefined;
    const dailyStudyMinutes =
      typeof body.dailyStudyMinutes === 'number' ? body.dailyStudyMinutes : undefined;

    try {
      const studyPlan = await generateStudyPlan({ test, today, leadDays, dailyStudyMinutes });
      res.json({ studyPlan });
    } catch (err) {
      const { status, message } = formatApiError(err);
      res.status(status).json({ error: message });
    }
  });

  // Return JSON 404 for any unmatched API route before SPA fallback
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
          } else {
            res.setHeader('Cache-Control', 'no-cache');
          }
        },
      }),
    );
    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DayBell server running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
