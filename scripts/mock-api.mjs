// ---------------------------------------------------------------------------
// Mock of the XAMPP/PHP API.
//
// The dark-mode audit and the functional walkthrough both need every page
// to render with realistic content: an empty list hides the text that
// needs checking, and a missing endpoint logs a console error that looks
// like a bug in the app.
//
// Every endpoint the frontend calls is answered here with plausible data.
// ---------------------------------------------------------------------------
import http from 'node:http';

const USER = {
  id: 113,
  name: 'Developer',
  email: 'developer@gmail.com',
  role: 'admin',
  onboardingComplete: true,
  avatar: null,
  firstName: 'Developer',
  lastName: 'User',
};

const PROJECTS = [
  { id: 1, name: 'auth-service', language: 'php', status: 'active', created_at: '2026-01-14T09:00:00Z', files: 42 },
  { id: 2, name: 'payments-api', language: 'javascript', status: 'active', created_at: '2026-02-03T09:00:00Z', files: 118 },
  { id: 3, name: 'legacy-portal', language: 'php', status: 'archived', created_at: '2025-11-20T09:00:00Z', files: 67 },
  { id: 4, name: 'inventory-sync', language: 'python', status: 'active', created_at: '2026-03-11T09:00:00Z', files: 23 },
];

const VULNERABILITIES = [
  {
    id: 11,
    name: 'SQL Injection',
    severity: 'critical',
    cwe: 'A03:2021 - Injection',
    owasp: 'A03',
    project: 'auth-service',
    file: 'src/login.php',
    line: 42,
    status: 'open',
    evidence: "query('SELECT * FROM users WHERE email = ' . $email)",
    description: 'User input is concatenated directly into a SQL statement without parameterisation.',
    remediation: 'Use prepared statements with bound parameters for every user-supplied value.',
    detected_at: '2026-10-02T08:14:00Z',
  },
  {
    id: 12,
    name: 'Cross-Site Scripting (Reflected)',
    severity: 'high',
    cwe: 'A03:2021 - Injection',
    owasp: 'A03',
    project: 'payments-api',
    file: 'src/routes/checkout.js',
    line: 118,
    status: 'open',
    evidence: 'res.send(`<div>${req.query.name}</div>`)',
    description: 'The query string is echoed into the response without escaping.',
    remediation: 'Escape output with a sanitiser, or render it as text rather than HTML.',
    detected_at: '2026-10-04T11:02:00Z',
  },
  {
    id: 13,
    name: 'Broken Access Control',
    severity: 'high',
    cwe: 'A01:2021 - Broken Access Control',
    owasp: 'A01',
    project: 'legacy-portal',
    file: 'admin/reports.php',
    line: 17,
    status: 'in_progress',
    evidence: 'if ($_SESSION["role"] !== "admin") { /* no check */ }',
    description: 'An admin-only page loads records without verifying the session role.',
    remediation: 'Verify the role on the server before reading or writing the record.',
    detected_at: '2026-10-06T15:30:00Z',
  },
  {
    id: 14,
    name: 'Insecure Dependencies',
    severity: 'medium',
    cwe: 'A06:2021 - Vulnerable and Outdated Components',
    owasp: 'A06',
    project: 'payments-api',
    file: 'package.json',
    line: 12,
    status: 'resolved',
    evidence: '"lodash": "^4.17.15"',
    description: 'A dependency version with a known prototype pollution advisory.',
    remediation: 'Upgrade to the latest patched release.',
    detected_at: '2026-10-08T09:44:00Z',
  },
  {
    id: 15,
    name: 'Weak Password Hashing',
    severity: 'medium',
    cwe: 'A02:2021 - Cryptographic Failures',
    owasp: 'A02',
    project: 'auth-service',
    file: 'src/register.php',
    line: 88,
    status: 'open',
    evidence: "password_hash($password, PASSWORD_DEFAULT)",
    description: 'The password is hashed with MD5 instead of a modern algorithm.',
    remediation: 'Use password_hash() with PASSWORD_ARGON2ID or PASSWORD_BCRYPT.',
    detected_at: '2026-10-09T13:20:00Z',
  },
  {
    id: 16,
    name: 'Missing Security Headers',
    severity: 'low',
    cwe: 'A05:2021 - Security Misconfiguration',
    owasp: 'A05',
    project: 'inventory-sync',
    file: 'app.py',
    line: 9,
    status: 'open',
    evidence: "response.headers['X-Frame-Options'] = 'DENY'",
    description: 'The response is missing Content-Security-Policy and Strict-Transport-Security.',
    remediation: 'Add the recommended headers in the response middleware.',
    detected_at: '2026-10-10T10:05:00Z',
  },
  {
    id: 17,
    name: 'Insufficient Logging',
    severity: 'low',
    cwe: 'A09:2021 - Security Logging and Monitoring Failures',
    owasp: 'A09',
    project: 'legacy-portal',
    file: 'admin/login.php',
    line: 31,
    status: 'open',
    evidence: "if (!$auth->login($email, $password)) { return false; }",
    description: 'Failed sign-in attempts are not written to the audit trail.',
    remediation: 'Log failed attempts with the source address and the account name.',
    detected_at: '2026-10-11T17:40:00Z',
  },
];

const THREATS = [
  { id: 21, title: 'Credential stuffing against auth-service', severity: 'high', status: 'monitoring', category: 'A07', created_at: '2026-10-12T08:00:00Z', description: 'Repeated failed logins from a distributed address range.' },
  { id: 22, title: 'Supply chain risk in npm dependencies', severity: 'medium', status: 'monitoring', category: 'A06', created_at: '2026-10-13T08:00:00Z', description: 'Two transitive packages have unpatched advisories.' },
  { id: 23, title: 'Exposed backup archive in web root', severity: 'critical', status: 'open', category: 'A05', created_at: '2026-10-14T08:00:00Z', description: 'A database dump is reachable over the web.' },
];

const SCANS = [
  { id: 31, project: 'auth-service', language: 'php', scanned_at: '2026-10-12T10:12:00Z', total_issues: 14, score: 62, status: 'completed' },
  { id: 32, project: 'payments-api', language: 'javascript', scanned_at: '2026-10-14T14:40:00Z', total_issues: 9, score: 78, status: 'completed' },
  { id: 33, project: 'inventory-sync', language: 'python', scanned_at: '2026-10-17T09:05:00Z', total_issues: 4, score: 91, status: 'completed' },
  { id: 34, project: 'legacy-portal', language: 'php', scanned_at: '2026-10-19T16:22:00Z', total_issues: 22, score: 44, status: 'completed' },
  { id: 35, project: 'auth-service', language: 'php', scanned_at: '2026-10-21T11:00:00Z', total_issues: 11, score: 69, status: 'completed' },
];

const NOTIFICATIONS = [
  { id: 41, title: 'Critical vulnerability found', message: 'SQL Injection detected in auth-service/src/login.php.', severity: 'critical', read: false, created_at: '2026-10-21T11:05:00Z', type: 'vulnerability' },
  { id: 42, title: 'Scan completed', message: 'The scan of payments-api finished with 9 issues.', severity: 'info', read: false, created_at: '2026-10-20T09:30:00Z', type: 'scan' },
  { id: 43, title: 'Exposed backup archive', message: 'A database dump is reachable over the web.', severity: 'critical', read: false, created_at: '2026-10-19T14:00:00Z', type: 'threat' },
  { id: 44, title: 'Weekly report is ready', message: 'Your weekly security summary is available.', severity: 'info', read: true, created_at: '2026-10-18T08:00:00Z', type: 'report' },
  { id: 45, title: 'Dependency advisory', message: 'lodash 4.17.15 has a prototype pollution advisory.', severity: 'warning', read: true, created_at: '2026-10-16T12:20:00Z', type: 'dependency' },
  { id: 46, title: 'New member joined', message: 'Priya Nair accepted the invitation to the Security team.', severity: 'info', read: true, created_at: '2026-10-15T10:10:00Z', type: 'team' },
];

const TEAM_MEMBERS = [
  { id: 51, name: 'Developer User', email: 'developer@gmail.com', role: 'owner', status: 'active', joined_at: '2025-10-01T09:00:00Z', avatar: null },
  { id: 52, name: 'Priya Nair', email: 'priya.nair@example.com', role: 'admin', status: 'active', joined_at: '2025-11-12T09:00:00Z', avatar: null },
  { id: 53, name: 'Lim Wei Ming', email: 'lim.wei.ming@example.com', role: 'member', status: 'active', joined_at: '2026-01-22T09:00:00Z', avatar: null },
  { id: 54, name: 'Sarah Tan', email: 'sarah.tan@example.com', role: 'viewer', status: 'active', joined_at: '2026-02-08T09:00:00Z', avatar: null },
];

const INVITATIONS = [
  { id: 61, email: 'omar.hakim@example.com', role: 'member', status: 'pending', invited_at: '2026-10-18T09:00:00Z' },
  { id: 62, email: 'chen.wei@example.com', role: 'viewer', status: 'pending', invited_at: '2026-10-19T09:00:00Z' },
];

const API_KEYS = [
  { id: 71, name: 'CI pipeline key', prefix: 'pk_live_9f2a', created_at: '2026-08-14T09:00:00Z', last_used_at: '2026-10-20T22:10:00Z', scopes: ['read', 'write'] },
  { id: 72, name: 'Local development', prefix: 'pk_test_1b7c', created_at: '2026-09-02T09:00:00Z', last_used_at: '2026-10-11T08:45:00Z', scopes: ['read'] },
];

const AUDIT_LOGS = [
  { id: 81, action: 'scan.completed', description: 'Ran an OWASP scan on payments-api', actor: 'Developer User', ip: '127.0.0.1', created_at: '2026-10-21T11:00:00Z', severity: 'info' },
  { id: 82, action: 'api_key.created', description: 'Created the key "CI pipeline key"', actor: 'Developer User', ip: '127.0.0.1', created_at: '2026-10-20T09:15:00Z', severity: 'warning' },
  { id: 83, action: 'member.invited', description: 'Invited omar.hakim@example.com', actor: 'Priya Nair', ip: '127.0.0.1', created_at: '2026-10-18T09:00:00Z', severity: 'info' },
  { id: 84, action: 'settings.updated', description: 'Changed the appearance theme to dark', actor: 'Developer User', ip: '127.0.0.1', created_at: '2026-10-17T18:30:00Z', severity: 'info' },
  { id: 85, action: 'report.downloaded', description: 'Downloaded the PDF report for legacy-portal', actor: 'Lim Wei Ming', ip: '127.0.0.1', created_at: '2026-10-16T12:00:00Z', severity: 'info' },
  { id: 86, action: 'auth.login.failed', description: 'Three failed sign-in attempts', actor: 'unknown', ip: '203.0.113.42', created_at: '2026-10-15T03:20:00Z', severity: 'critical' },
];

const INTEGRATIONS = [
  { provider: 'github', name: 'GitHub', connected: true, status: 'active', description: 'Import repositories into the scanner.', last_synced: '2026-10-20T09:00:00Z' },
  { provider: 'gitlab', name: 'GitLab', connected: false, status: 'disconnected', description: 'Import repositories from a GitLab group.', last_synced: null },
  { provider: 'jenkins', name: 'Jenkins', connected: false, status: 'disconnected', description: 'Trigger scans from a Jenkins pipeline.', last_synced: null },
  { provider: 'slack', name: 'Slack', connected: true, status: 'active', description: 'Post findings to a Slack channel.', last_synced: '2026-10-21T08:00:00Z' },
];

const REPORTS = [
  { id: 91, title: 'Security report — legacy-portal', filename: 'security-report-legacy-portal.pdf', language: 'php', score: 44, totalIssues: 22, created_at: '2026-10-19T16:30:00Z', expiresAt: '2026-10-20T16:30:00Z', expiresInHours: 12, token: 'mock-report-token-1', downloadUrl: 'http://127.0.0.1:5299/mock/download' },
];

const PROFILE = {
  user: USER,
  profile: {
    firstName: 'Developer',
    lastName: 'User',
    email: 'developer@gmail.com',
    phone: '+65 8123 4567',
    role: 'Security Engineer',
    company: 'Project Eric',
    bio: 'Building a security-first web IDE and writing about secure software design.',
    location: 'Singapore',
    website: 'https://example.com',
    avatar: null,
  },
  stats: { projects: 4, scans: 5, findings: 56, resolved: 12 },
};

const SETTINGS = {
  settings: {
    notifications: {
      securityAlerts: true,
      vulnerabilityAlerts: true,
      weeklyReport: false,
      scanCompletion: true,
    },
    appearance: { theme: 'dark', accent: '#3B82F6' },
  },
};

// ---------------------------------------------------------------------------

const json = (res, code, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': '*',
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});

  const url = (req.url || '').split('?')[0];
  const path = url.replace(/^\/project-eric-api\/api/, '').replace(/\/$/, '') || '/';
  const method = req.method;
  const body = method === 'GET' || method === 'DELETE' ? {} : await readBody(req);

  // -- Public ---------------------------------------------------------------
  if (path === '/landing' || path === '/features' || path === '/info') {
    return json(res, 200, {
      success: true,
      data: {
        title: 'Project Eric',
        tagline: 'A security-first web IDE with integrated OWASP analysis.',
        features: [
          { title: 'OWASP Top 10 scanning', description: 'Scan a project against the 2026 list and read the evidence.' },
          { title: 'AI-assisted fixes', description: 'Ask the advisor for a patch and review it before it lands.' },
          { title: 'Audit trail', description: 'Every scan, key and setting change is recorded.' },
        ],
      },
    });
  }
  if (path === '/team' && method === 'GET') {
    return json(res, 200, { success: true, data: { team: TEAM_MEMBERS } });
  }

  // -- Auth -----------------------------------------------------------------
  if (path === '/auth/validate') return json(res, 200, { success: true, data: { valid: true, user: USER } });
  if (path === '/auth/login') {
    if (body.email && body.password) return json(res, 200, { success: true, data: { token: 'mock-token', user: USER } });
    return json(res, 400, { success: false, error: 'Email and password are required.' });
  }
  if (path === '/auth/register') {
    return json(res, 200, { success: true, data: { token: 'mock-token', user: { ...USER, email: body.email || USER.email, name: [body.firstName, body.lastName].filter(Boolean).join(' ') || USER.name } } });
  }
  if (path === '/auth/oauth') {
    return json(res, 200, { success: true, data: { token: 'mock-token', user: USER } });
  }
  if (path === '/auth/forgot-password') return json(res, 200, { success: true, data: { sent: true } });
  if (path === '/auth/reset-password') return json(res, 200, { success: true, data: { reset: true } });
  if (path === '/auth/change-password') return json(res, 200, { success: true, data: { changed: true } });
  if (path === '/auth/logout') return json(res, 200, { success: true, data: { loggedOut: true } });
  if (path === '/auth/onboarding') {
    return json(res, 200, { success: true, data: { user: { ...USER, onboardingComplete: true } } });
  }

  // -- Dashboard ------------------------------------------------------------
  if (path === '/dashboard') {
    return json(res, 200, {
      success: true,
      data: {
        summary: {
          totalProjects: PROJECTS.length,
          totalScans: SCANS.length,
          totalVulnerabilities: VULNERABILITIES.length,
          criticalCount: VULNERABILITIES.filter((v) => v.severity === 'critical').length,
          resolvedCount: VULNERABILITIES.filter((v) => v.status === 'resolved').length,
          securityScore: 68,
          riskScore: 32,
        },
        counters: { critical: 2, high: 2, medium: 2, low: 2 },
        vulnerabilities: VULNERABILITIES,
        projects: PROJECTS,
        recentActivity: AUDIT_LOGS.slice(0, 5),
        trend: [
          { date: '2026-10-15', score: 55, issues: 21 },
          { date: '2026-10-16', score: 58, issues: 19 },
          { date: '2026-10-17', score: 61, issues: 16 },
          { date: '2026-10-18', score: 60, issues: 15 },
          { date: '2026-10-19', score: 65, issues: 12 },
          { date: '2026-10-20', score: 66, issues: 11 },
          { date: '2026-10-21', score: 68, issues: 10 },
        ],
      },
    });
  }
  if (path === '/projects') return json(res, 200, { success: true, data: { projects: PROJECTS } });
  if (path === '/vulnerabilities') return json(res, 200, { success: true, data: { vulnerabilities: VULNERABILITIES } });
  if (path === '/threats') return json(res, 200, { success: true, data: { threats: THREATS } });
  if (path === '/scans' && method === 'GET') return json(res, 200, { success: true, data: { scans: SCANS } });
  if (path === '/scans' && method === 'POST') {
    return json(res, 200, { success: true, data: { scan: { id: 999, ...(body || {}), scanned_at: new Date().toISOString() } } });
  }
  if (path === '/workspace') {
    return json(res, 200, {
      success: true,
      data: { workspace: { folder: 'workspaces/user_113', name: 'auth-service', language: 'php', files: 42, path: '/home/project-eric/workspaces/user_113' } },
    });
  }

  // -- Account data ---------------------------------------------------------
  if (path === '/notifications' && method === 'GET') return json(res, 200, { success: true, data: { notifications: NOTIFICATIONS } });
  if (path === '/notifications' && method === 'PATCH') return json(res, 200, { success: true, data: { updated: true } });
  if (path === '/notifications' && method === 'DELETE') return json(res, 200, { success: true, data: { deleted: true } });

  if (path === '/team/members' && method === 'GET') {
    return json(res, 200, { success: true, data: { members: TEAM_MEMBERS, invitations: INVITATIONS } });
  }
  if (path === '/team/members' && method === 'POST') {
    return json(res, 200, { success: true, data: { invitation: { id: 63, email: body.email, role: body.role || 'member', status: 'pending', invited_at: new Date().toISOString() } } });
  }
  if (path === '/team/members' && method === 'PATCH') return json(res, 200, { success: true, data: { updated: true } });
  if (path === '/team/members' && method === 'DELETE') return json(res, 200, { success: true, data: { removed: true } });

  if (path === '/api-keys' && method === 'GET') return json(res, 200, { success: true, data: { keys: API_KEYS } });
  if (path === '/api-keys' && method === 'POST') {
    return json(res, 200, {
      success: true,
      data: {
        key: { id: 73, name: body.name || 'New key', prefix: 'pk_live_new1', key: 'pk_live_new1_0123456789abcdef', created_at: new Date().toISOString(), last_used_at: null, scopes: ['read'] },
      },
    });
  }
  if (path === '/api-keys' && method === 'DELETE') return json(res, 200, { success: true, data: { deleted: true } });

  if (path === '/audit-logs') return json(res, 200, { success: true, data: { logs: AUDIT_LOGS } });
  if (path === '/integrations' && method === 'GET') return json(res, 200, { success: true, data: { integrations: INTEGRATIONS } });
  if (path === '/integrations' && method === 'POST') return json(res, 200, { success: true, data: { connected: true } });
  if (path === '/integrations' && method === 'DELETE') return json(res, 200, { success: true, data: { disconnected: true } });

  if (path === '/settings' && method === 'GET') return json(res, 200, { success: true, data: SETTINGS });
  if (path === '/settings' && method === 'PUT') {
    try {
      const patch = body || {};
      if (patch.notifications && typeof patch.notifications === 'object') {
        SETTINGS.settings.notifications = { ...SETTINGS.settings.notifications, ...patch.notifications };
      }
      if (patch.appearance && typeof patch.appearance === 'object') {
        SETTINGS.settings.appearance = { ...SETTINGS.settings.appearance, ...patch.appearance };
      }
    } catch { /* keep old settings */ }
    return json(res, 200, { success: true, data: SETTINGS });
  }

  if (path === '/two-factor' && method === 'GET') {
    return json(res, 200, { success: true, data: { enabled: false, method: 'totp' } });
  }
  if (path === '/two-factor' && method === 'POST') {
    if (body.action === 'setup') {
      return json(res, 200, { success: true, data: { secret: 'JBSWY3DPEHPK3PXP', otpauthUrl: 'otpauth://totp/ProjectEric?secret=JBSWY3DPEHPK3PXP', qrCode: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==' } });
    }
    if (body.action === 'enable') return json(res, 200, { success: true, data: { enabled: true } });
    return json(res, 200, { success: true, data: { disabled: true } });
  }

  if (path === '/profile' && method === 'GET') return json(res, 200, { success: true, data: PROFILE });
  if (path === '/profile' && method === 'PUT') {
    return json(res, 200, { success: true, data: { ...PROFILE, profile: { ...PROFILE.profile, ...(body || {}) } } });
  }
  if (path === '/profile/avatar' && method === 'POST') {
    return json(res, 200, { success: true, data: { avatar: '/uploads/avatars/user_113.png' } });
  }

  // -- Reports --------------------------------------------------------------
  if (path === '/reports' && method === 'GET') return json(res, 200, { success: true, data: { reports: REPORTS } });
  if (path === '/reports' && method === 'POST') {
    return json(res, 200, {
      success: true,
      data: {
        report: {
          id: 'mock-report-1',
          token: 'mock-token-1',
          downloadUrl: 'http://127.0.0.1:5299/mock/download',
          expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
          expiresInHours: 24,
        },
      },
    });
  }
  if (path === '/reports' && method === 'DELETE') return json(res, 200, { success: true, data: { deleted: true } });
  if (path === '/reports/download') {
    res.writeHead(200, { 'Content-Type': 'application/pdf' });
    return res.end(Buffer.from('%PDF-1.4 mock report'));
  }

  // Anything else — answer with an empty success so the frontend does not
  // log a network error for an endpoint we simply did not model.
  return json(res, 200, { success: true, data: {} });
});

server.listen(5299, '127.0.0.1', () => {
  console.log('mock api on http://127.0.0.1:5299/project-eric-api/api');
});
