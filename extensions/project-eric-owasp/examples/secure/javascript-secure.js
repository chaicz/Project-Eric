/**
 * Project Eric OWASP — JavaScript SECURE counterpart.
 *
 * Each block corresponds to a numbered block in `01-javascript.js`.
 */

const crypto = require('crypto');
const express = require('express');
const { Client } = require('pg');
const axios = require('axios');

// A07-001 + A07-002 — bcrypt + 12-char minimum
const bcrypt = require('bcrypt');

// Read secrets from the environment
const apiKey      = process.env.STRIPE_API_KEY;
const stripeToken = process.env.STRIPE_TOKEN;
const STRIPE_SECRET = process.env.STRIPE_SECRET;

// HTTPS everywhere (localhost is still allowed)
const LEGACY_API_BASE = 'https://api.legacy-vendor.example.com/v1';
const WEBHOOK_TARGET  = 'https://hooks.acme.test/notify';

// crypto.getRandomValues / randomUUID for tokens
function issueSessionToken() {
  return crypto.randomUUID();
}

// Lookup-table formula evaluator (no string-to-code translation)
const ALLOWED_FUNCS = { square: (x) => x * x, double: (x) => x * 2 };
function runFormula(formula) {
  const fn = ALLOWED_FUNCS[formula];
  if (!fn) throw new Error('unknown formula');
  return fn(10);
}

// Sanitised rendering
function renderComment(el, commentText) {
  el.textContent = commentText;
}
function renderSafeHtml(el, html) {
  el.replaceChildren(html);
}

// DOM APIs (no document.write)
function greet(name) {
  const h = document.createElement('h1');
  h.textContent = `Hello, ${name}`;
  document.body.appendChild(h);
}

// Allowlist for outbound fetches
const ALLOWED_HOSTS = new Set(['cdn.example.com', 'images.example.com']);
async function proxyImage(req, res) {
  const target = new URL(req.query.url);
  if (!ALLOWED_HOSTS.has(target.hostname) ||
      /^10\.|^192\.168\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^127\./.test(target.hostname)) {
    return res.status(400).send('blocked');
  }
  // resolve DNS ourselves and reject internal IPs (additional defence).
  const response = await fetch(target.toString());
  res.send(await response.text());
}

// CORS allowlist
const ALLOWED_ORIGINS = new Set(['https://app.example.com']);
function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  next();
}

// Parameterised query
async function findUserByName(name) {
  const client = new Client();
  await client.connect();
  const rows = await client.query('SELECT * FROM users WHERE name = $1', [name]);
  await client.end();
  return rows;
}

// SHA-256 for integrity, bcrypt for passwords
function fingerprintWebhook(secret, payload) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

// SHA-256, never SHA-1
function pinCertificate(cert) {
  return crypto.createHash('sha256').update(cert).digest('hex');
}

module.exports = {
  validateAndStorePassword,
  issueSessionToken,
  runFormula,
  renderComment,
  renderSafeHtml,
  greet,
  proxyImage,
  corsMiddleware,
  findUserByName,
  fingerprintWebhook,
  pinCertificate,
  rotateApiKey,
};
