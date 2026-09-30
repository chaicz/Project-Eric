-- ============================================
-- Project Eric - Complete Setup Script
-- Run this ONE file to set up everything
-- ============================================

-- Step 1: Create Database
DROP DATABASE IF EXISTS project_eric;
CREATE DATABASE project_eric CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE project_eric;

-- ============================================
-- Step 2: Create All Tables
-- ============================================

-- Users Table
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    role ENUM('admin', 'user', 'moderator') DEFAULT 'user',
    avatar_url VARCHAR(500),
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(100),
    reset_token VARCHAR(100),
    reset_token_expires DATETIME,
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
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

-- Projects Table
CREATE TABLE projects (
    id INT AUTO_INCREMENT PRIMARY KEY,
    team_id INT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    repository_url VARCHAR(500),
    is_public BOOLEAN DEFAULT FALSE,
    settings JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE SET NULL,
    INDEX idx_team (team_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Scan Results Table
CREATE TABLE scan_results (
    id INT AUTO_INCREMENT PRIMARY KEY,
    project_id INT NOT NULL,
    user_id INT NOT NULL,
    scan_type ENUM('full', 'quick', 'custom') DEFAULT 'full',
    status ENUM('pending', 'running', 'completed', 'failed') DEFAULT 'pending',
    findings JSON,
    summary JSON,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    INDEX idx_project (project_id),
    INDEX idx_user (user_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API Keys Table
CREATE TABLE api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
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
    resource_id INT,
    details JSON,
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

-- Demo User (password: demo123)
INSERT INTO users (email, password_hash, first_name, last_name, role, email_verified) VALUES
('demo@project-eric.com', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Demo', 'User', 'user', TRUE);

-- ============================================
-- Done! Show confirmation
-- ============================================
SELECT '✅ Database setup complete!' AS status;
SELECT CONCAT('Tables created: ', COUNT(*)) AS info FROM information_schema.tables WHERE table_schema = 'project_eric';
SELECT CONCAT('Features loaded: ', COUNT(*)) AS info FROM features;
SELECT CONCAT('Team members loaded: ', COUNT(*)) AS info FROM team_info;
