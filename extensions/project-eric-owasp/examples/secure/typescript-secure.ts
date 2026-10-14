/**
 * Project Eric OWASP — TypeScript SECURE counterpart.
 *
 * Mirrors the structure of `02-typescript.ts` with the unsafe bits removed.
 */

import * as crypto from 'crypto';
import axios from 'axios';
import { Request } from 'express';
import { z } from 'zod';
import { execFile } from 'child_process';

// SHA-256 HMAC for integrity
function signPayload(secret: string, payload: object): string {
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
}

// Zod schema for validated user data
const UserPayloadSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  isAdmin: z.boolean().default(false),
});
type UserPayload = z.infer<typeof UserPayloadSchema>;

function loadUser(req: Request): UserPayload {
  return UserPayloadSchema.parse(req.body);
}

// secrets from env / KMS
const dbPassword = process.env.DB_PASSWORD!;
const jwtSecret  = process.env.JWT_SECRET!;

// HTTPS
const INVOICE_API = 'https://billing.internal:8443/invoices';

// Render Markdown with a sanitiser
import DOMPurify from 'isomorphic-dompurify';
import { marked } from 'marked';
function renderMarkdown(md: string): { __html: string } {
  const dirty = marked.parse(md);
  return { __html: DOMPurify.sanitize(dirty) };
}

// Lookup-table formula evaluator
const fns: Record<string, (n: number) => number> = {
  square: (n) => n * n,
  double: (n) => n * 2,
};
function runFormula(name: string): number {
  const fn = fns[name];
  if (!fn) throw new Error('unknown formula');
  return fn(10);
}

// SSRF-safe outbound (allowlist applied before the call)
const ALLOWED_HOSTNAMES = new Set(['cdn.example.com']);
async function fetchAvatar(url: string): Promise<Buffer> {
  const u = new URL(url);
  if (!ALLOWED_HOSTNAMES.has(u.hostname)) {
    throw new Error('blocked');
  }
  const res = await axios.get(u.toString(), { responseType: 'arraybuffer' });
  return res.data;
}

// ≥ 8 char password rule
function isStrong(pwd: string): boolean {
  return typeof pwd === 'string' && pwd.length >= 12;
}

// execFile with an arg array (no shell)
function convertVideo(filename: string, cb: (err: Error | null) => void) {
  if (!/^[\w.-]+$/.test(filename)) return cb(new Error('bad filename'));
  execFile('ffmpeg', ['-i', filename, 'out.mp4'], cb);
}

// Key rotation via KMS
async function rotateJwtSecret() {
  return await kms.retrieve('jwt-signing-key');
}
