# Project Eric — Security IDE Platform

## 📋 Project Overview

**Project Eric** is a security-first web-based IDE that helps developers write safer code by providing real-time vulnerability analysis, threat detection, and OWASP Top 10 (2021) compliance checking. The product targets three audiences: junior developers learning secure-coding habits, instructors teaching application security, and small-team builders who need lightweight SAST without enterprise tooling overhead.

---

## 🗂️ Project Structure

### **Interface Design Files** (UI/UX Components)

| File | Description |
|------|-------------|
| `src/components/layout/Layout.jsx` | **Main application layout** - Contains the sidebar navigation, header with search/notifications/profile dropdowns, breadcrumbs, and responsive mobile menu. This is the shell that wraps all authenticated pages. |
| `src/components/Toast.jsx` | **Toast notification system** - Provides user feedback through animated toast messages for success, error, warning, and info notifications. |
| `src/pages/Dashboard.jsx` | **Dashboard homepage** - Displays security overview with stats cards (secure score, vulnerabilities, threats, scan history), recent projects, and quick action buttons. |
| `src/pages/Login.jsx` | **Login page** - User authentication page with email/password form, OAuth login options (Google, GitHub), remember me functionality, and form validation. |
| `src/pages/Signup.jsx` | **Registration page** - New user account creation with email, password, name fields and OAuth registration options. |
| `src/pages/Onboarding.jsx` | **First-time user onboarding** - Multi-step wizard (5 steps) introducing users to the platform features with animated screens and feature highlights. |
| `src/pages/Settings.jsx` | **Settings page** - User preferences including theme toggle (light/dark), account settings, and platform configuration options. |
| `src/pages/Profile.jsx` | **User profile page** - View and edit user profile information, avatar, and personal details. |
| `src/pages/Notifications.jsx` | **Notifications center** - Full list of all user notifications with filtering and read/unread status management. |
| `src/pages/AboutTeam.jsx` | **About development team** - Information about the development team behind Project Eric. |

---

### **Main Functionality Files** (Core Logic)

| File | Description |
|------|-------------|
| `src/App.jsx` | **Application root** - Main router configuration using React Router. Defines all routes (public, auth, protected), route guards (ProtectedRoute, AuthRoute), and wraps the app with providers. |
| `src/main.jsx` | **Entry point** - React application bootstrap with global error handling and ReactDOM rendering. |
| `src/context/AppContext.jsx` | **Global state management** - React Context provider for user authentication state, login/logout functions, OAuth login, onboarding state, and theme preferences with localStorage persistence. |
| `src/pages/IDE.jsx` | **Secure Code Editor** - Full-featured code editor interface with file explorer, multiple file tabs, syntax highlighting themes, terminal emulator, AI code assistant chat, Git integration UI, code security scanning, and theme switching. |
| `src/pages/Analysis.jsx` | **Vulnerability Analysis** - Scans and displays security vulnerabilities with filtering by severity/category, vulnerability details, fix suggestions, and export functionality. |
| `src/pages/Threats.jsx` | **Threat Intelligence** - Shows real-time security threats with CVE search capability, threat details, mitigation actions, and threat feed management. |
| `src/pages/Reports.jsx` | **Security Reports** - Generate, preview, download, and share security reports in multiple formats (PDF, JSON, CSV). |
| `src/pages/Team.jsx` | **Team Management** - Manage team members, roles, and permissions within the organization. |
| `src/pages/APIKeys.jsx` | **AI API Key Management** - Configure and manage AI service API keys for code analysis and assistance features. |
| `src/pages/AuditLogs.jsx` | **Audit Trail** - View system audit logs tracking all user actions and security events. |
| `src/pages/Integrations.jsx` | **Third-party Integrations** - Connect with external services and tools (Slack, GitHub, Jira, etc.). |
| `src/pages/ForgotPassword.jsx` | **Password Recovery** - Password reset flow for users who forgot their password. |
| `src/pages/TermsOfService.jsx` | **Legal: Terms** - Platform terms of service document. |
| `src/pages/PrivacyPolicy.jsx` | **Legal: Privacy** - Platform privacy policy document. |
| `src/utils/securityData.js` | **Mock Data Utilities** - Provides mock security data for development/testing (vulnerabilities, threats, projects, stats). Used when no backend is configured. |
| `src/index.css` | **Global Styles** - Tailwind CSS imports and custom CSS animations/classes. |

---

## 🔧 Configuration Files

| File | Purpose |
|------|---------|
| `tailwind.config.js` | Tailwind CSS configuration with custom colors, fonts, and animations |
| `package.json` | Project dependencies and npm scripts |
| `index.html` | HTML entry point |
| `vite.config.js` | Vite build tool configuration |

---

## 🎨 UI/UX Design System

### **Color Palette**
- Primary: Blue (#0066FF)
- Accent: Cyan (#00D4FF)
- Dark Surface: rgba(10, 22, 40, 0.95)
- Light Surface: rgba(255, 255, 255, 0.85)

### **Typography**
- Monospace: JetBrains Mono / Fira Code
- Sans: Inter / system-ui

### **Key Features**
- Dark/Light theme support
- Responsive sidebar navigation
- Toast notification system
- Modal dialogs and dropdowns
- Progress indicators and loading states
- Breadcrumb navigation
- Global search (⌘K shortcut)

---

## 🔐 Security Features

1. **OWASP Top 10 Analysis** - Scans for the 10 most critical web application security risks
2. **Real-time Vulnerability Detection** - Identifies security issues as you code
3. **Threat Intelligence Feed** - Updates on latest security threats
4. **Secure Code Execution** - Sandboxed code running environment
5. **Audit Logging** - Tracks all security-relevant actions

---

## 📁 Folder Comparison

| Feature | With OWASP | Without OWASP |
|---------|-----------|---------------|
| OWASP Top 10 Analysis Tab | ✅ Included in IDE.jsx | ❌ Removed |
| All other features | ✅ | ✅ |

The only difference between the two folders is the **OWASP tab** in the IDE page, which has been removed from the "Without OWASP" version.

---

## 🚀 Running the Project

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## 📦 Technology Stack

- **Framework**: React 18
- **Routing**: React Router DOM v6
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **3D Effects**: Three.js / React Three Fiber
- **Build Tool**: Vite
- **State Management**: React Context API
