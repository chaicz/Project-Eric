-- ============================================
-- Project Eric - Complete Setup Script for XAMPP / MySQL
--
-- Import this ONE file to build the whole database:
--
--   1. Open XAMPP Control Panel -> start Apache and MySQL.
--   2. Open http://localhost/phpmyadmin -> select the "Import" tab.
--   3. Choose this file and press "Go" (or "Execute").
--
--   Command line equivalent:
--      C:\xampp\mysql\bin\mysql.exe -u root < database\setup.sql
--
-- The script drops and recreates the `project_eric` database, so it
-- always produces the same starting state. A newly registered account
-- therefore starts with an EMPTY workspace - no projects, no findings,
-- no scans - and only sees rows it created itself.
--
-- The sample projects, vulnerabilities and scans belong to the demo
-- account (demo@project-eric.com / demo123). They are demo material,
-- not shared content: no other account can read them.
-- ============================================

-- Step 1: Create Database
DROP DATABASE IF EXISTS project_eric;
CREATE DATABASE project_eric CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE project_eric;

-- ============================================
-- Step 2: Create All Tables
-- ============================================

-- Users Table (Combined Schema)
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    name VARCHAR(255),
    username VARCHAR(100),
    bio TEXT,
    company VARCHAR(255),
    role ENUM('admin', 'user', 'moderator', 'developer', 'fullstack') DEFAULT 'user',
    experience VARCHAR(50) DEFAULT 'mid',
    avatar_url VARCHAR(500),
    avatar VARCHAR(500) DEFAULT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(100),
    reset_token VARCHAR(100),
    reset_token_expires DATETIME,
    languages JSON DEFAULT NULL,
    security_focus JSON DEFAULT NULL,
    onboarding_complete TINYINT(1) DEFAULT 0,
    provider VARCHAR(50) DEFAULT 'email',
    -- The social sign-in link.
    --
    -- `oauth_provider` is the provider that owns the account ('google' or
    -- 'github') and `oauth_id` is that provider's own identifier for the
    -- person. The pair is unique, so a provider identity can never be
    -- claimed by two Project Eric accounts.
    --
    -- Both are NULL for an account that signs in with a password only.
    oauth_provider VARCHAR(50) DEFAULT NULL,
    oauth_id VARCHAR(255) DEFAULT NULL,
    -- The second factor, when the account has one turned on.
    --
    -- `two_factor_secret` is the base32 shared secret, encrypted with
    -- the application key: the server has to be able to read it back to
    -- check a code. The recovery codes are hashed the way a password
    -- is, so a leaked database cannot be used to sign in.
    two_factor_secret VARCHAR(255) DEFAULT NULL,
    two_factor_enabled TINYINT(1) DEFAULT 0,
    two_factor_enabled_at TIMESTAMP NULL,
    two_factor_recovery_codes JSON DEFAULT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_email (email),
    -- One provider identity maps to exactly one account.
    UNIQUE KEY idx_oauth (oauth_provider, oauth_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Teams Table
CREATE TABLE teams (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    owner_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team Members Table
CREATE TABLE team_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    user_id INT NOT NULL,
    role ENUM('owner', 'admin', 'developer', 'analyst', 'member', 'viewer') DEFAULT 'member',
    invited_by INT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_team_user (team_id, user_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team Invitations Table
-- An invitation names an address that has not joined the team yet, so it
-- cannot live in `team_members` (which is keyed by a real user id).
CREATE TABLE team_invitations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'viewer',
    status ENUM('pending', 'accepted', 'revoked') DEFAULT 'pending',
    invited_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_team_email (team_id, email),
    INDEX idx_invitee_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Projects Table (Combined Schema)
--
-- `user_id` is the owner. Every project belongs to exactly one account:
-- there is no shared/global project, so a newly registered user never
-- inherits somebody else's repository list.
CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT,
    user_id INT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    language VARCHAR(100),
    framework VARCHAR(100),
    repository_url VARCHAR(500),
    threat_level VARCHAR(50) DEFAULT 'low',
    vulnerability_count INT DEFAULT 0,
    critical_count INT DEFAULT 0,
    files INT DEFAULT 0,
    is_public BOOLEAN DEFAULT FALSE,
    settings JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_modified TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_team (team_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scan Results Table
CREATE TABLE scan_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    scan_type ENUM('full', 'quick', 'custom', 'incremental') DEFAULT 'full',
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    findings JSON,
    summary JSON,
    vulnerabilities_found INT DEFAULT 0,
    code_lines_analyzed INT DEFAULT 0,
    started_at DATETIME NULL,
    completed_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_project (project_id),
    INDEX idx_user (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Vulnerabilities Table
CREATE TABLE vulnerabilities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT,
    cwe_id VARCHAR(50),
    owasp_id VARCHAR(50),
    title VARCHAR(500) NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    category VARCHAR(100),
    description TEXT,
    location VARCHAR(500),
    status ENUM('open', 'in_progress', 'remediated', 'false_positive') DEFAULT 'open',
    remediation TEXT,
    cvss DECIMAL(3,1) DEFAULT 0.0,
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project (project_id),
    INDEX idx_severity (severity),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Threats Table (Threat Intelligence)
--
-- Global by design: a CVE feed is the same for everybody and is not
-- account data.
CREATE TABLE threats (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(500) NOT NULL,
    severity ENUM('low', 'medium', 'high', 'critical') DEFAULT 'medium',
    source VARCHAR(100),
    description TEXT,
    indicators JSON DEFAULT NULL,
    affected_components JSON DEFAULT NULL,
    mitigation TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_severity (severity),
    INDEX idx_source (source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scans Table (Security Scan Records)
CREATE TABLE scans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT,
    scan_type VARCHAR(100) DEFAULT 'full',
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    vulnerabilities_found INT DEFAULT 0,
    code_lines_analyzed INT DEFAULT 0,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    INDEX idx_project (project_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API Keys Table
CREATE TABLE api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) NOT NULL,
    last_used TIMESTAMP NULL,
    expires_at TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    permissions JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_key (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Report Exports Table (temporary PDF reports)
--
-- A PDF security report can contain the user's own source code, so the
-- stored copy is a liability. Every row therefore carries an
-- `expires_at`; the API deletes the row *and* the file on disk once
-- that moment passes, so nothing survives for more than 24 hours.
--
-- The `token` is the public handle used in the download URL. It is 32
-- random bytes in hex, which is unguessable, so the link can be opened
-- in a plain browser tab without attaching a JWT header.
CREATE TABLE report_exports (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token CHAR(64) NOT NULL,             -- public, unguessable handle used in the download URL
    file_name VARCHAR(255) NOT NULL,     -- original source file name
    stored_name VARCHAR(255) NOT NULL,   -- on-disk name
    title VARCHAR(255) NOT NULL,
    language VARCHAR(100),
    score INT,
    total_issues INT DEFAULT 0,
    size_bytes INT DEFAULT 0,
    expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE INDEX idx_token (token),
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit Logs Table
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(100),
    resource_id_int INT,
    details JSON,
    details_text TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Notifications Table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    data JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_read (is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Integrations Table
CREATE TABLE integrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    provider VARCHAR(50) NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expires_at TIMESTAMP NULL,
    settings JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_provider (user_id, provider),
    INDEX idx_provider (provider)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Features Table (for landing page)
CREATE TABLE features (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    icon VARCHAR(50),
    category VARCHAR(100),
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_active (is_active),
    INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Team Info Table (for landing page team section)
CREATE TABLE team_info (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    role VARCHAR(100) NOT NULL,
    bio TEXT,
    avatar_url VARCHAR(500),
    skills JSON,
    github_url VARCHAR(500),
    linkedin_url VARCHAR(500),
    is_featured BOOLEAN DEFAULT FALSE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_featured (is_featured),
    INDEX idx_sort (sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User Workspaces Table
--
-- This is the link between a Project Eric account and the code-server
-- workbench it opens. Every account gets its own folder under the IDE
-- root, so two users never see each other's files, and the mapping
-- lives in MySQL so the dashboard, the API and the IDE agree on which
-- folder belongs to whom.
--
--   workspace_name  the folder name under the IDE root ("user-7")
--   workspace_path  the absolute path of that folder
CREATE TABLE user_workspaces (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    workspace_name VARCHAR(100) NOT NULL,
    workspace_path VARCHAR(500) NOT NULL,
    code_server_url VARCHAR(255),
    last_opened_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_workspace (user_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- User Settings Table
--
-- One row per account. The preferences are a single JSON document so
-- that adding a new one does not need a schema migration.
--
-- The Settings page used to keep these in `localStorage` and claimed
-- they "sync to your account automatically". They did not, and the
-- Notifications page read a different local key from the Settings page,
-- so the two screens disagreed about the same preference. The account
-- owns them now.
CREATE TABLE user_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    settings JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_settings (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- Step 3: Insert Seed Data
-- ============================================
-- ---- Global content (not account data) --------------------------------

-- Features
INSERT INTO features (title, description, icon, category, sort_order) VALUES
('Vulnerability Scanning', 'Comprehensive vulnerability scanning. Our advanced scanner identifies potential security risks in your codebase.', 'shield-check', 'security', 1),
('Real-time Detection', 'Instant threat alerts with AI-powered detection system. Stay ahead of potential security breaches with continuous monitoring.', 'zap', 'security', 2),
('Secure Coding', 'Built-in security best practices and code suggestions. Get real-time recommendations to write more secure code.', 'code', 'development', 3),
('Risk Assessment', 'Automated vulnerability scanning and risk assessment for your applications. Comprehensive reports with actionable insights.', 'search', 'security', 4),
('Code Review Tools', 'Collaborative code review with security focus. Team up to identify and fix security issues together.', 'users', 'development', 5),
('Compliance Reports', 'Generate compliance reports for HIPAA, PCI-DSS, GDPR, and more. Stay compliant with automated documentation.', 'file-text', 'reports', 6),
('Threat Intelligence', 'Real-time threat intelligence feeds and updates. Stay informed about the latest security threats and vulnerabilities.', 'trending-up', 'intelligence', 7),
('API Security', 'Protect your APIs with rate limiting, authentication, and monitoring. Secure your backend services end-to-end.', 'lock', 'security', 8);

-- Team Members
INSERT INTO team_info (name, role, bio, avatar_url, skills, github_url, linkedin_url, is_featured, sort_order) VALUES
('Alex Chen', 'Lead Developer', 'Full-stack architect with 8+ years experience in security-focused web development. Passionate about building tools that help developers write safer code.', NULL, '["React", "Node.js", "Security", "Cloud Architecture"]', 'https://github.com', 'https://linkedin.com', TRUE, 1),
('Sarah Kim', 'Security Engineer', 'Former penetration tester turned developer. Specializes in threat modeling, vulnerability assessment, and security automation.', NULL, '["Python", "Security Auditing", "Penetration Testing", "OWASP"]', 'https://github.com', 'https://linkedin.com', TRUE, 2),
('Marcus Johnson', 'UI/UX Designer', 'Creating intuitive interfaces that make security tools accessible to everyone. Believes great security should not require a PhD.', NULL, '["Figma", "Design Systems", "Accessibility", "Motion Design"]', 'https://github.com', 'https://linkedin.com', TRUE, 3),
('Priya Patel', 'Backend Engineer', 'Database architect and API specialist focused on scalable, secure backend systems. Champion of clean code and thorough testing.', NULL, '["PostgreSQL", "Docker", "Kubernetes", "GraphQL"]', 'https://github.com', 'https://linkedin.com', TRUE, 4);

-- Sample Threats (global threat intelligence feed)
INSERT INTO threats (title, severity, source, description, indicators, affected_components, mitigation) VALUES
('New Log4j Variant Exploited in Wild', 'critical', 'CISA', 'A new variant of the Log4j vulnerability has been discovered.', '["IOC-1234", "IOC-5678"]', '["log4j-core >= 2.0 <= 2.17.0"]', 'Upgrade to Log4j 2.17.1 or later immediately.'),
('Supply Chain Attack via NPM Package', 'high', 'GitHub Security Lab', 'Malicious code discovered in a popular NPM package.', '["Malicious domain: api-stats.io"]', '["event-stream >= 3.3.4"]', 'Audit dependencies and remove compromised packages.'),
('Critical SSH Vulnerability Disclosed', 'medium', 'NVD', 'OpenSSH contains memory corruption vulnerability.', '["CVE-2026-1234"]', '["openssh < 9.0"]', 'Update OpenSSH to the latest version.'),
('OAuth 2.0 Implementation Flaw', 'high', 'OAuth Security Working Group', 'Implementation flaw allows token theft.', '["Affected: oauth4j, authlib < 1.3.0"]', '["oauth4j", "authlib < 1.3.0"]', 'Upgrade to latest library versions.');

-- ---- Demo accounts ------------------------------------------------------
--
-- These exist so the dashboard can be demonstrated with realistic
-- figures. The password for all of them is `demo123`.
--
--   demo@project-eric.com  -> owns the sample projects below
--   user@example.com       -> plain demo account

INSERT INTO users (email, password_hash, first_name, last_name, name, role, experience, languages, security_focus, onboarding_complete, provider, email_verified) VALUES
('demo@project-eric.com', '$2y$10$thbV9q2ItJXcD6rPJD4Ih.Jt.R2qr.2niqUFGkX376zMA3AVu/zHu', 'Demo', 'User', 'Demo User', 'user', 'mid', '["JavaScript", "Python"]', '["A01", "A03"]', 1, 'email', TRUE),
('user@example.com', '$2y$10$thbV9q2ItJXcD6rPJD4Ih.Jt.R2qr.2niqUFGkX376zMA3AVu/zHu', 'Test', 'User', 'Test User', 'fullstack', 'junior', '["JavaScript"]', '["A03"]', 1, 'email', TRUE);

-- A personal team for the demo account, mirroring what `register.php`
-- creates for every new account.
INSERT INTO teams (name, description, owner_id)
SELECT 'Demo''s Team', 'Personal workspace', id FROM users WHERE email = 'demo@project-eric.com';

INSERT INTO team_members (team_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM teams t
JOIN users u ON u.email = 'demo@project-eric.com'
WHERE t.owner_id = u.id;

-- ---- Sample projects (owned by the demo account) ------------------------
--
-- `user_id` is NOT NULL: these rows belong to demo@project-eric.com and
-- to nobody else. The API filters every project query on
-- `user_id = ?`, so a newly registered account sees an empty list.
SET @demo_id = (SELECT id FROM users WHERE email = 'demo@project-eric.com');

INSERT INTO projects (user_id, name, description, language, framework, threat_level, vulnerability_count, critical_count, files, created_at, last_modified) VALUES
(@demo_id, 'E-Commerce API', 'Sample project - REST API for the online store', 'JavaScript', 'Express.js', 'medium', 5, 1, 47, '2026-09-12 08:00:00', '2026-09-14 06:00:00'),
(@demo_id, 'User Dashboard', 'Sample project - React front end', 'TypeScript', 'React', 'low', 2, 0, 89, '2026-09-11 08:00:00', '2026-09-13 15:00:00'),
(@demo_id, 'Payment Service', 'Sample project - payment processing service', 'Python', 'FastAPI', 'high', 8, 2, 34, '2026-09-10 08:00:00', '2026-09-12 09:00:00');

SET @ecom_id     = (SELECT id FROM projects WHERE user_id = @demo_id AND name = 'E-Commerce API');
SET @dashboard_id = (SELECT id FROM projects WHERE user_id = @demo_id AND name = 'User Dashboard');
SET @payment_id  = (SELECT id FROM projects WHERE user_id = @demo_id AND name = 'Payment Service');

-- ---- Sample vulnerabilities ---------------------------------------------
INSERT INTO vulnerabilities (project_id, cwe_id, owasp_id, title, severity, category, description, location, status, remediation, cvss, discovered_at) VALUES
(@ecom_id, 'CWE-79', 'A03', 'Cross-Site Scripting (XSS)', 'high', 'Injection', 'User input is reflected without proper sanitization.', 'src/components/UserProfile.jsx:42', 'open', 'Implement input validation and output encoding.', 7.1, '2026-09-14 06:00:00'),
(@ecom_id, 'CWE-287', 'A07', 'Broken Authentication', 'critical', 'Authentication Failures', 'Session tokens not properly validated.', 'src/middleware/auth.js:15', 'open', 'Regenerate session ID after authentication.', 9.1, '2026-09-14 06:00:00'),
(@ecom_id, 'CWE-862', 'A01', 'Missing Authorization', 'high', 'Broken Access Control', 'Endpoint allows access without verifying permissions.', 'api/routes/orders.js:78', 'in_progress', 'Implement role-based access control.', 8.2, '2026-09-14 06:00:00'),
(@dashboard_id, 'CWE-352', 'A01', 'Cross-Site Request Forgery', 'medium', 'Broken Access Control', 'Application does not validate Origin header.', 'src/forms/PaymentForm.jsx:89', 'open', 'Implement CSRF tokens.', 6.5, '2026-09-13 15:00:00'),
(@dashboard_id, 'CWE-327', 'A02', 'Use of Weak Cryptographic Algorithm', 'medium', 'Cryptographic Failures', 'Application uses MD5 for password hashing.', 'src/utils/crypto.js:12', 'remediated', 'Replace MD5 with bcrypt or Argon2.', 5.3, '2026-09-13 15:00:00'),
(@payment_id, 'CWE-502', 'A08', 'Deserialization of Untrusted Data', 'critical', 'Data Integrity Failures', 'Application deserializes data from untrusted sources.', 'api/middleware/parser.js:34', 'open', 'Avoid deserializing untrusted data.', 9.8, '2026-09-12 09:00:00'),
(@payment_id, 'CWE-918', 'A10', 'Server-Side Request Forgery', 'high', 'SSRF', 'Application fetches URLs without validation.', 'src/services/imageProxy.js:22', 'open', 'Validate all user-supplied URLs.', 8.6, '2026-09-12 09:00:00'),
(@payment_id, 'CWE-770', 'A04', 'Unrestricted Resource Consumption', 'low', 'Insecure Design', 'API endpoints do not implement rate limiting.', 'api/routes/search.js:45', 'open', 'Implement rate limiting.', 4.2, '2026-09-12 09:00:00');

-- ---- Sample scan records -----------------------------------------------
INSERT INTO scans (project_id, scan_type, status, vulnerabilities_found, code_lines_analyzed, started_at, completed_at) VALUES
(@ecom_id, 'full', 'completed', 5, 5420, '2026-09-14 06:00:00', '2026-09-14 06:00:00'),
(@dashboard_id, 'incremental', 'completed', 2, 1230, '2026-09-13 15:00:00', '2026-09-13 15:00:00'),
(@payment_id, 'full', 'completed', 8, 2870, '2026-09-12 09:00:00', '2026-09-12 09:00:00'),
(@ecom_id, 'full', 'completed', 4, 5420, '2026-09-10 06:00:00', '2026-09-10 06:00:00'),
(@dashboard_id, 'incremental', 'completed', 3, 890, '2026-09-09 15:00:00', '2026-09-09 15:00:00');

INSERT INTO scan_results (project_id, user_id, scan_type, status, summary, vulnerabilities_found, code_lines_analyzed, started_at, completed_at) VALUES
(@ecom_id, @demo_id, 'full', 'completed', '{"score": 62, "label": "Medium Risk", "mode": "code", "language": "JavaScript", "totalIssues": 5, "severity": {"critical": 1, "high": 2, "medium": 1, "low": 1}}', 5, 5420, '2026-09-14 06:00:00', '2026-09-14 06:00:00'),
(@dashboard_id, @demo_id, 'incremental', 'completed', '{"score": 78, "label": "Low Risk", "mode": "code", "language": "TypeScript", "totalIssues": 2, "severity": {"critical": 0, "high": 0, "medium": 2, "low": 0}}', 2, 1230, '2026-09-13 15:00:00', '2026-09-13 15:00:00'),
(@payment_id, @demo_id, 'full', 'completed', '{"score": 41, "label": "High Risk", "mode": "code", "language": "Python", "totalIssues": 8, "severity": {"critical": 2, "high": 2, "medium": 3, "low": 1}}', 8, 2870, '2026-09-12 09:00:00', '2026-09-12 09:00:00'),
(@ecom_id, @demo_id, 'full', 'completed', '{"score": 71, "label": "Medium Risk", "mode": "code", "language": "JavaScript", "totalIssues": 4, "severity": {"critical": 0, "high": 1, "medium": 2, "low": 1}}', 4, 5420, '2026-09-10 06:00:00', '2026-09-10 06:00:00'),
(@dashboard_id, @demo_id, 'incremental', 'completed', '{"score": 80, "label": "Low Risk", "mode": "code", "language": "TypeScript", "totalIssues": 3, "severity": {"critical": 0, "high": 1, "medium": 1, "low": 1}}', 3, 890, '2026-09-09 15:00:00', '2026-09-09 15:00:00');

-- ---- Sample audit logs (demo account only) -----------------------------
INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details_text, ip_address) VALUES
(@demo_id, 'LOGIN', 'user', '1', 'User logged in via email', '127.0.0.1'),
(@demo_id, 'PROJECT_CREATED', 'project', '1', 'Created project: E-Commerce API', '127.0.0.1'),
(@demo_id, 'SCAN_COMPLETED', 'scan', '1', 'Security scan completed with 5 vulnerabilities', '127.0.0.1'),
(@demo_id, 'VULNERABILITY_OPENED', 'vulnerability', '1', 'XSS vulnerability marked as open', '127.0.0.1');

-- ---- IDE workspace for the demo account --------------------------------
--
-- Every account gets one row in `user_workspaces`. `GET /api/workspace`
-- creates it on demand, so a new account does not need to be listed here.
--
-- The code-server port follows the same formula the launcher uses:
-- 8090 + (user id % 200).
INSERT INTO user_workspaces (user_id, workspace_name, workspace_path, code_server_url)
SELECT id,
       CONCAT('user-', id),
       CONCAT('C:\\Users\\Public\\project-eric-ide\\users\\user-', id),
       CONCAT('http://127.0.0.1:', 8090 + (id % 200))
FROM users;

-- ============================================
-- Step 4: Done - show confirmation
-- ============================================
SELECT 'Database setup complete!' AS status;
SELECT CONCAT('Tables created: ', COUNT(*)) AS info FROM information_schema.tables WHERE table_schema = 'project_eric';
SELECT CONCAT('Features loaded: ', COUNT(*)) AS info FROM features;
SELECT CONCAT('Team members loaded: ', COUNT(*)) AS info FROM team_info;
SELECT CONCAT('Users loaded: ', COUNT(*)) AS info FROM users;
SELECT CONCAT('Projects loaded: ', COUNT(*)) AS info FROM projects;
SELECT CONCAT('Vulnerabilities loaded: ', COUNT(*)) AS info FROM vulnerabilities;
SELECT CONCAT('Scans loaded: ', COUNT(*)) AS info FROM scans;
SELECT CONCAT('IDE workspaces mapped: ', COUNT(*)) AS info FROM user_workspaces;

-- Sanity check: no project may belong to a user that does not exist, and
-- every seeded project must be owned by exactly one account.
SELECT p.id AS project_id, p.name, u.email AS owner
FROM projects p
LEFT JOIN users u ON u.id = p.user_id
ORDER BY p.id;
