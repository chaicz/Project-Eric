// OWASP Top 10 (2026) Categories
export const OWASP_CATEGORIES = [
  { id: 'A01', name: 'Broken Access Control', icon: 'ShieldOff' },
  { id: 'A02', name: 'Cryptographic Failures', icon: 'Lock' },
  { id: 'A03', name: 'Injection', icon: 'FileCode' },
  { id: 'A04', name: 'Insecure Design', icon: 'Blueprint' },
  { id: 'A05', name: 'Security Misconfiguration', icon: 'Settings' },
  { id: 'A06', name: 'Vulnerable Components', icon: 'Package' },
  { id: 'A07', name: 'Authentication Failures', icon: 'UserX' },
  { id: 'A08', name: 'Data Integrity Failures', icon: 'Database' },
  { id: 'A09', name: 'Logging Failures', icon: 'FileText' },
  { id: 'A10', name: 'SSRF', icon: 'Globe' },
];

// Mock vulnerability data
export const mockVulnerabilities = [
  {
    id: 'VULN-001',
    cweId: 'CWE-79',
    owaspId: 'A03',
    title: 'Cross-Site Scripting (XSS)',
    severity: 'high',
    category: 'Injection',
    description: 'User input is reflected in the response without proper sanitization, allowing injection of malicious scripts.',
    location: 'src/components/UserProfile.jsx:42',
    status: 'open',
    remediation: 'Implement proper input validation and output encoding. Use React\'s built-in escaping or a sanitization library like DOMPurify.',
    cvss: 7.1,
    discoveredAt: '2026-09-10T14:30:00Z'
  },
  {
    id: 'VULN-002',
    cweId: 'CWE-287',
    owaspId: 'A07',
    title: 'Broken Authentication',
    severity: 'critical',
    category: 'Authentication Failures',
    description: 'Session tokens are not properly validated, allowing session fixation attacks.',
    location: 'src/middleware/auth.js:15',
    status: 'open',
    remediation: 'Regenerate session ID after authentication and implement proper session timeout mechanisms.',
    cvss: 9.1,
    discoveredAt: '2026-09-12T09:15:00Z'
  },
  {
    id: 'VULN-003',
    cweId: 'CWE-862',
    owaspId: 'A01',
    title: 'Missing Authorization',
    severity: 'high',
    category: 'Broken Access Control',
    description: 'Endpoint allows access to resources without verifying user permissions.',
    location: 'api/routes/orders.js:78',
    status: 'in_progress',
    remediation: 'Implement role-based access control (RBAC) and verify permissions on every request.',
    cvss: 8.2,
    discoveredAt: '2026-09-11T16:45:00Z'
  },
  {
    id: 'VULN-004',
    cweId: 'CWE-352',
    owaspId: 'A01',
    title: 'Cross-Site Request Forgery',
    severity: 'medium',
    category: 'Broken Access Control',
    description: 'Application does not validate the Origin header, making it vulnerable to CSRF attacks.',
    location: 'src/forms/PaymentForm.jsx:89',
    status: 'open',
    remediation: 'Implement CSRF tokens and validate the Origin/Referer headers.',
    cvss: 6.5,
    discoveredAt: '2026-09-09T11:20:00Z'
  },
  {
    id: 'VULN-005',
    cweId: 'CWE-327',
    owaspId: 'A02',
    title: 'Use of Weak Cryptographic Algorithm',
    severity: 'medium',
    category: 'Cryptographic Failures',
    description: 'Application uses MD5 for password hashing, which is cryptographically broken.',
    location: 'src/utils/crypto.js:12',
    status: 'remediated',
    remediation: 'Replace MD5 with bcrypt, scrypt, or Argon2 for password hashing.',
    cvss: 5.3,
    discoveredAt: '2026-09-08T08:00:00Z'
  },
  {
    id: 'VULN-006',
    cweId: 'CWE-502',
    owaspId: 'A08',
    title: 'Deserialization of Untrusted Data',
    severity: 'critical',
    category: 'Data Integrity Failures',
    description: 'Application deserializes data from untrusted sources without validation.',
    location: 'api/middleware/parser.js:34',
    status: 'open',
    remediation: 'Avoid deserializing untrusted data. If necessary, implement integrity checks and input validation.',
    cvss: 9.8,
    discoveredAt: '2026-09-13T10:30:00Z'
  },
  {
    id: 'VULN-007',
    cweId: 'CWE-918',
    owaspId: 'A10',
    title: 'Server-Side Request Forgery',
    severity: 'high',
    category: 'SSRF',
    description: 'Application fetches URLs based on user input without proper validation.',
    location: 'src/services/imageProxy.js:22',
    status: 'open',
    remediation: 'Validate and sanitize all user-supplied URLs. Implement allowlists for permitted domains.',
    cvss: 8.6,
    discoveredAt: '2026-09-12T14:00:00Z'
  },
  {
    id: 'VULN-008',
    cweId: 'CWE-770',
    owaspId: 'A04',
    title: 'Unrestricted Resource Consumption',
    severity: 'low',
    category: 'Insecure Design',
    description: 'API endpoints do not implement rate limiting, allowing resource exhaustion.',
    location: 'api/routes/search.js:45',
    status: 'open',
    remediation: 'Implement rate limiting and throttling mechanisms.',
    cvss: 4.2,
    discoveredAt: '2026-09-07T09:45:00Z'
  }
];

// Mock threat intelligence data
export const mockThreats = [
  {
    id: 'THR-001',
    title: 'New Log4j Variant Exploited in Wild',
    severity: 'critical',
    source: 'CISA',
    timestamp: '2026-09-14T08:00:00Z',
    description: 'A new variant of the Log4j vulnerability has been discovered being actively exploited in production environments.',
    indicators: ['IOC-1234', 'IOC-5678'],
    affectedComponents: ['log4j-core >= 2.0 <= 2.17.0'],
    mitigation: 'Upgrade to Log4j 2.17.1 or later immediately.'
  },
  {
    id: 'THR-002',
    title: 'Supply Chain Attack via NPM Package',
    severity: 'high',
    source: 'GitHub Security Lab',
    timestamp: '2026-09-13T15:30:00Z',
    description: 'Malicious code discovered in a popular NPM package with 2M+ weekly downloads.',
    indicators: ['Malicious domain: api-stats.io'],
    affectedComponents: ['event-stream >= 3.3.4'],
    mitigation: 'Audit dependencies and remove compromised packages.'
  },
  {
    id: 'THR-003',
    title: 'Critical SSH Vulnerability Disclosed',
    severity: 'medium',
    source: 'NVD',
    timestamp: '2026-09-13T10:00:00Z',
    description: 'OpenSSH contains a memory corruption vulnerability that could allow remote code execution.',
    indicators: ['CVE-2026-1234'],
    affectedComponents: ['openssh < 9.0'],
    mitigation: 'Update OpenSSH to the latest version.'
  },
  {
    id: 'THR-004',
    title: 'OAuth 2.0 Implementation Flaw',
    severity: 'high',
    source: 'OAuth Security Working Group',
    timestamp: '2026-09-12T12:00:00Z',
    description: 'Implementation flaw in multiple OAuth 2.0 libraries allows token theft via redirect URI manipulation.',
    indicators: ['Affected: oauth4j, authlib < 1.3.0'],
    affectedComponents: ['oauth4j', 'authlib < 1.3.0'],
    mitigation: 'Upgrade to latest library versions and validate redirect URIs.'
  }
];

// Mock projects data
export const mockProjects = [
  {
    id: 'PROJ-001',
    name: 'E-Commerce API',
    language: 'JavaScript',
    framework: 'Express.js',
    lastModified: '2026-09-14T10:30:00Z',
    threatLevel: 'medium',
    vulnerabilityCount: 5,
    criticalCount: 1,
    files: 47
  },
  {
    id: 'PROJ-002',
    name: 'User Dashboard',
    language: 'TypeScript',
    framework: 'React',
    lastModified: '2026-09-13T16:45:00Z',
    threatLevel: 'low',
    vulnerabilityCount: 2,
    criticalCount: 0,
    files: 89
  },
  {
    id: 'PROJ-003',
    name: 'Payment Service',
    language: 'Python',
    framework: 'FastAPI',
    lastModified: '2026-09-12T09:15:00Z',
    threatLevel: 'high',
    vulnerabilityCount: 8,
    criticalCount: 2,
    files: 34
  }
];

// Security statistics
export const getSecurityStats = () => ({
  secureScore: 78,
  totalVulnerabilities: 15,
  criticalVulnerabilities: 3,
  highVulnerabilities: 5,
  mediumVulnerabilities: 4,
  lowVulnerabilities: 3,
  resolvedVulnerabilities: 0,
  resolvedThisWeek: 0,
  scansCompleted: 24,
  lastScanDate: '2026-09-14T06:00:00Z',
  trend: 'improving', // improving, stable, worsening
  codeLinesAnalyzed: 15420
});

// Programming languages for selection
export const PROGRAMMING_LANGUAGES = [
  'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'Go', 
  'Rust', 'PHP', 'Ruby', 'Swift', 'Kotlin', 'C++'
];

// Development roles
export const DEVELOPMENT_ROLES = [
  { id: 'frontend', name: 'Frontend Developer', icon: 'Monitor' },
  { id: 'backend', name: 'Backend Developer', icon: 'Server' },
  { id: 'fullstack', name: 'Full-Stack Developer', icon: 'Layers' },
  { id: 'security', name: 'Security Engineer', icon: 'Shield' },
  { id: 'devops', name: 'DevOps Engineer', icon: 'Container' },
  { id: 'mobile', name: 'Mobile Developer', icon: 'Smartphone' }
];

// Experience levels
export const EXPERIENCE_LEVELS = [
  { id: 'junior', name: 'Junior (0-2 years)', color: 'blue' },
  { id: 'mid', name: 'Mid-Level (2-5 years)', color: 'green' },
  { id: 'senior', name: 'Senior (5-10 years)', color: 'purple' },
  { id: 'expert', name: 'Expert (10+ years)', color: 'orange' }
];
