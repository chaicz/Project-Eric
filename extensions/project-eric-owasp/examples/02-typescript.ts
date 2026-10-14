/**
 * Project Eric OWASP — TypeScript sample (intentionally vulnerable)
 *
 * SAFE COUNTERPART: ./secure/typescript-secure.ts
 */

import * as crypto from 'crypto';
import axios from 'axios';
import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// A02-001 — MD5 in Node crypto
// ---------------------------------------------------------------------------
function signPayload(payload: object): string {
  // ❌ A02-001: MD5 used to fingerprint a webhook payload.
  return crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex');
}

// ---------------------------------------------------------------------------
// TS-A03-001 — `as any` to bypass type checks on user data
// ---------------------------------------------------------------------------
interface UserPayload {
  id: string;
  email: string;
  isAdmin?: boolean;
}

function loadUser(req: Request): UserPayload {
  const body = req.body as any;            // ❌ TS-A03-001: throws away all
                                            //               type safety on
                                            //               user-controlled
                                            //               data.
  // body.isAdmin could be anything an attacker wants.
  return body;
}

// ---------------------------------------------------------------------------
// A02-003 — hard-coded credentials
// ---------------------------------------------------------------------------
const dbPassword = "Pa55w0rd!Prod2025";
const jwtSecret  = 'super-secret-jwt-key-do-not-share';
// A07-002 — plaintext password literal that the scanner picks up:
let password = "fallback-cleartext-password-123456789";

// ---------------------------------------------------------------------------
// A02-004 — insecure HTTP to an internal service
// ---------------------------------------------------------------------------
const INVOICE_API = "http://billing.internal:8080/invoices";

// ---------------------------------------------------------------------------
// A03-003 — dangerouslySetInnerHTML on user-rendered Markdown
// ---------------------------------------------------------------------------
function renderMarkdown(md: string): { __html: string } {
  // ❌ A03-003: classic XSS sink in React. Even "safe" Markdown libraries have
  //              had XSS bugs — sanitise after rendering.
  return { __html: md };
}

// ---------------------------------------------------------------------------
// A03-004 — eval() on parsed JSON
// ---------------------------------------------------------------------------
function runFormula(formula: string): number {
  // ❌ A03-004: any string can become code.
  return eval(formula) as number;
}

// ---------------------------------------------------------------------------
// A10-001 — fetch to a user-supplied URL
// ---------------------------------------------------------------------------
async function fetchAvatar(url: string): Promise<Buffer> {
  // ❌ A10-001: SSRF — url might be http://169.254.169.254/latest/meta-data/
  const res = await fetch(url);
  const blob = await res.arrayBuffer();
  return Buffer.from(blob);
}

// ---------------------------------------------------------------------------
// A07-001 — too-short password rule
// ---------------------------------------------------------------------------
function isStrong(pwd: string): boolean {
  // ❌ A07-001: `password.length < 5` — well below the recommended 8–12.
  return password.length < 5 ? false : true;
}

// ---------------------------------------------------------------------------
// A03-002 — child_process.exec with concat (Node equivalent)
// ---------------------------------------------------------------------------
import { exec } from 'child_process';

function convertVideo(filename: string, cb: (err: Error | null) => void) {
  // ❌ A03-002: classic command-injection sink in Node.js.
  exec('ffmpeg -i ' + filename + ' out.mp4', cb);
}

// ---------------------------------------------------------------------------
// A04-001 — TODO at a security-sensitive seam
// ---------------------------------------------------------------------------
function rotateJwtSecret() {
  // TODO: replace with key-management service lookup before production launch.
  return jwtSecret;
}
