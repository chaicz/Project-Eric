-- ============================================
-- Project Eric - Complete Combined Setup Script
-- Merged from both project versions
-- Run this ONE file to set up everything
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
    role ENUM('admin', 'user', 'moderator', 'developer', 'fullstack') DEFAULT 'user',
    experience VARCHAR(50) DEFAULT 'mid',
    avatar_url VARCHAR(500),
    avatar VARCHAR(500) DEFAULT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(100),
    reset_token VARCHAR(100),
    reset_token_expires DATETIME,
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    languages JSON DEFAULT NULL,
    security_focus JSON DEFAULT NULL,
    onboarding_complete TINYINT(1) DEFAULT 0,
    provider VARCHAR(50) DEFAULT 'email',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_login TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    INDEX idx_email (email),
    INDEX idx_oauth (oauth_provider, oauth_id)
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
    role ENUM('owner', 'admin', 'member', 'viewer') DEFAULT 'member',
    invited_by INT,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL,
    UNIQUE KEY unique_team_user (team_id, user_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Projects Table (Combined Schema)
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
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
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

-- ============================================
-- Step 3: Insert Seed Data
-- ============================================

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

-- Demo Users (password: demo123 - hashed with bcrypt)
INSERT INTO users (email, password_hash, first_name, last_name, name, role, experience, languages, security_focus, onboarding_complete, provider, email_verified) VALUES
('demo@project-eric.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Demo', 'User', 'Demo User', 'user', 'mid', '["JavaScript", "Python"]', '["A01", "A03"]', 1, 'email', TRUE),
('developer@gmail.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Developer', 'Google', 'Developer.google', 'developer', 'mid', '["JavaScript", "Python"]', '["A01", "A03", "A06"]', 1, 'google', TRUE),
('developer@github.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'GitHub', 'Developer', 'GitHub Developer', 'developer', 'senior', '["TypeScript", "Go"]', '["A01", "A07"]', 1, 'github', TRUE),
('user@example.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Test', 'User', 'Test User', 'fullstack', 'junior', '["JavaScript"]', '["A03"]', 1, 'email', TRUE);

-- Sample Projects
INSERT INTO projects (user_id, name, language, framework, threat_level, vulnerability_count, critical_count, files) VALUES
(1, 'E-Commerce API', 'JavaScript', 'Express.js', 'medium', 5, 1, 47),
(1, 'User Dashboard', 'TypeScript', 'React', 'low', 2, 0, 89),
(1, 'Payment Service', 'Python', 'FastAPI', 'high', 8, 2, 34);

-- Sample Vulnerabilities
INSERT INTO vulnerabilities (project_id, cwe_id, owasp_id, title, severity, category, description, location, status, remediation, cvss) VALUES
(1, 'CWE-79', 'A03', 'Cross-Site Scripting (XSS)', 'high', 'Injection', 'User input is reflected without proper sanitization.', 'src/components/UserProfile.jsx:42', 'open', 'Implement input validation and output encoding.', 7.1),
(1, 'CWE-287', 'A07', 'Broken Authentication', 'critical', 'Authentication Failures', 'Session tokens not properly validated.', 'src/middleware/auth.js:15', 'open', 'Regenerate session ID after authentication.', 9.1),
(1, 'CWE-862', 'A01', 'Missing Authorization', 'high', 'Broken Access Control', 'Endpoint allows access without verifying permissions.', 'api/routes/orders.js:78', 'in_progress', 'Implement role-based access control.', 8.2),
(2, 'CWE-352', 'A01', 'Cross-Site Request Forgery', 'medium', 'Broken Access Control', 'Application does not validate Origin header.', 'src/forms/PaymentForm.jsx:89', 'open', 'Implement CSRF tokens.', 6.5),
(2, 'CWE-327', 'A02', 'Use of Weak Cryptographic Algorithm', 'medium', 'Cryptographic Failures', 'Application uses MD5 for password hashing.', 'src/utils/crypto.js:12', 'remediated', 'Replace MD5 with bcrypt or Argon2.', 5.3),
(3, 'CWE-502', 'A08', 'Deserialization of Untrusted Data', 'critical', 'Data Integrity Failures', 'Application deserializes data from untrusted sources.', 'api/middleware/parser.js:34', 'open', 'Avoid deserializing untrusted data.', 9.8),
(3, 'CWE-918', 'A10', 'Server-Side Request Forgery', 'high', 'SSRF', 'Application fetches URLs without validation.', 'src/services/imageProxy.js:22', 'open', 'Validate all user-supplied URLs.', 8.6),
(3, 'CWE-770', 'A04', 'Unrestricted Resource Consumption', 'low', 'Insecure Design', 'API endpoints do not implement rate limiting.', 'api/routes/search.js:45', 'open', 'Implement rate limiting.', 4.2);

-- Sample Threats
INSERT INTO threats (title, severity, source, description, indicators, affected_components, mitigation) VALUES
('New Log4j Variant Exploited in Wild', 'critical', 'CISA', 'A new variant of the Log4j vulnerability has been discovered.', '["IOC-1234", "IOC-5678"]', '["log4j-core >= 2.0 <= 2.17.0"]', 'Upgrade to Log4j 2.17.1 or later immediately.'),
('Supply Chain Attack via NPM Package', 'high', 'GitHub Security Lab', 'Malicious code discovered in a popular NPM package.', '["Malicious domain: api-stats.io"]', '["event-stream >= 3.3.4"]', 'Audit dependencies and remove compromised packages.'),
('Critical SSH Vulnerability Disclosed', 'medium', 'NVD', 'OpenSSH contains memory corruption vulnerability.', '["CVE-2026-1234"]', '["openssh < 9.0"]', 'Update OpenSSH to the latest version.'),
('OAuth 2.0 Implementation Flaw', 'high', 'OAuth Security Working Group', 'Implementation flaw allows token theft.', '["Affected: oauth4j, authlib < 1.3.0"]', '["oauth4j", "authlib < 1.3.0"]', 'Upgrade to latest library versions.');

-- Sample Scan Records
INSERT INTO scans (project_id, scan_type, status, vulnerabilities_found, code_lines_analyzed, completed_at) VALUES
(1, 'full', 'completed', 5, 5420, '2026-09-14 06:00:00'),
(2, 'incremental', 'completed', 2, 1230, '2026-09-13 15:00:00'),
(3, 'full', 'completed', 8, 2870, '2026-09-12 09:00:00'),
(1, 'full', 'completed', 4, 5420, '2026-09-10 06:00:00'),
(2, 'incremental', 'completed', 3, 890, '2026-09-09 15:00:00');

-- Sample Audit Logs
INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details_text, ip_address) VALUES
(1, 'LOGIN', 'user', '1', 'User logged in via email', '127.0.0.1'),
(1, 'PROJECT_CREATED', 'project', '1', 'Created project: E-Commerce API', '127.0.0.1'),
(1, 'SCAN_COMPLETED', 'scan', '1', 'Security scan completed with 5 vulnerabilities', '127.0.0.1'),
(1, 'VULNERABILITY_OPENED', 'vulnerability', '1', 'XSS vulnerability marked as open', '127.0.0.1');

-- ============================================
-- Done! Show confirmation
-- ============================================
SELECT '✅ Database setup complete!' AS status;
SELECT CONCAT('Tables created: ', COUNT(*)) AS info FROM information_schema.tables WHERE table_schema = 'project_eric';
SELECT CONCAT('Features loaded: ', COUNT(*)) AS info FROM features;
SELECT CONCAT('Team members loaded: ', COUNT(*)) AS info FROM team_info;
SELECT CONCAT('Users loaded: ', COUNT(*)) AS info FROM users;
SELECT CONCAT('Projects loaded: ', COUNT(*)) AS info FROM projects;
SELECT CONCAT('Vulnerabilities loaded: ', COUNT(*)) AS info FROM vulnerabilities;
