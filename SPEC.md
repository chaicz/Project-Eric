# Project Eric — Security-First Web IDE

## Concept & Vision

Project Eric is a browser-based Integrated Development Environment that embeds security analysis directly into the development workflow. The platform pairs a sleek, futuristic aesthetic with built-in OWASP Top 10 (2021) scanning so that every keystroke is checked against real-world vulnerability patterns. The experience feels like stepping into a command center for secure coding — every element communicates precision, trust, and technological sophistication.

The visual language draws from cybersecurity dashboards and aerospace interfaces, creating a sense of high-stakes professional tooling while remaining approachable for developers of all skill levels.

## Design Language

### Aesthetic Direction
Futuristic cybersecurity command center — clean white foundations with deep blue accents that pulse with subtle energy. Glass-morphism panels float over animated gradient backgrounds. Sharp geometric shapes contrast with smooth 3D animated elements on the login page.

### Color Palette
```
--primary-blue: #0066FF
--secondary-blue: #0047B3
--accent-cyan: #00D4FF
--accent-teal: #00B4D8
--background-white: #FFFFFF
--background-light: #F8FAFC
--background-dark: #0A1628
--surface-glass: rgba(255, 255, 255, 0.85)
--surface-dark: rgba(10, 22, 40, 0.95)
--text-primary: #0A1628
--text-secondary: #64748B
--text-light: #FFFFFF
--success: #10B981
--warning: #F59E0B
--danger: #EF4444
--border-light: rgba(0, 102, 255, 0.2)
```

### Typography
- **Headings**: JetBrains Mono — monospace precision for that developer feel
- **Body**: Inter — clean, highly readable for UI text
- **Code**: Fira Code — ligature support for code snippets

### Spatial System
- Base unit: 8px
- Content max-width: 1400px
- Panel border-radius: 16px
- Button border-radius: 8px
- Card padding: 24px

### Motion Philosophy
- **Login 3D Scene**: Continuous floating geometric shapes, rotating wireframe cube, particle field with connection lines
- **Page Transitions**: Smooth fade + slide, 300ms ease-out
- **Interactive Elements**: Scale 1.02 on hover, 200ms spring ease
- **Loading States**: Pulsing gradients and rotating rings
- **Panel Reveals**: Staggered entrance, 100ms delay between items

### Visual Assets
- **Icons**: Lucide React icons — consistent stroke width, cybersecurity-themed
- **Decorative**: CSS gradient orbs, animated grid patterns, 3D CSS transforms
- **Illustrations**: Abstract geometric shapes representing data/security flow

## Layout & Structure

### Pages

1. **Login Page** (`/login`)
   - Full-screen 3D animated background
   - Floating geometric shapes (cubes, pyramids, spheres)
   - Particle system with connecting lines
   - Centered glass-morphic login card
   - Username/email field, password field, remember me
   - Social login options (GitHub, Google)
   - "Create Account" and "Forgot Password" links
   - Animated logo with shield icon

2. **Onboarding** (`/onboarding`)
   - Multi-step wizard with progress indicator
   - Step 1: Welcome & role selection (Frontend/Backend/Full-stack/Security)
   - Step 2: Experience level (Junior/Mid/Senior/Expert)
   - Step 3: Preferred languages (multi-select tags)
   - Step 4: Security focus areas (OWASP Top 10 selection)
   - Step 5: Dashboard customization
   - Animated transitions between steps
   - Skip option available

3. **Dashboard** (`/dashboard`)
   - Top navigation bar with user avatar, notifications, settings
   - Left sidebar with navigation menu (collapsible)
   - Main content area with:
     - Security overview cards (threats detected, secure score, recent alerts)
     - Quick actions panel
     - Recent projects list
     - Security feed

4. **IDE Interface** (`/ide`)
   - Full-height layout mimicking VS Code
   - Left: File explorer sidebar
   - Center: Code editor with syntax highlighting
   - Right: Security analysis panel
   - Bottom: Terminal output + problems panel
   - Top: Tab bar + editor controls

5. **OWASP Analysis** (`/analysis`)
   - Project selector
   - Analysis type tabs (SAST, Dependency Check, Configuration Review)
   - Results dashboard with:
     - Risk severity chart
     - Vulnerability timeline
     - Category breakdown
   - Detailed findings with remediation suggestions

6. **Threat Intelligence** (`/threats`)
   - Live threat feed
   - CVE database search
   - Attack pattern visualization
   - Mitigation recommendations

## Features & Interactions

### Login
- **3D Background**: CSS 3D transforms create depth with floating shapes
- **Form Validation**: Real-time validation with animated error states
- **Submit Animation**: Button transforms to loading state, then success checkmark
- **Remember Me**: Toggle with smooth slide animation

### Onboarding
- **Progress Persistence**: Saves to localStorage, resume on return
- **Role-Based Customization**: UI adapts based on selected role
- **Interactive Tags**: Selected tags glow and lift on selection
- **Step Transitions**: Slide + fade with content morphing

### Dashboard
- **Cards**: Glass-morphic with subtle shadow, hover lift effect
- **Charts**: Animated on scroll-into-view
- **Notifications**: Slide-in from right with badge count
- **Quick Actions**: Icon grid with tooltip reveals

### IDE
- **File Tree**: Expandable with smooth height animation
- **Tab Management**: Draggable tabs, close confirmation
- **Code Editor**: Monaco-based with custom theme
- **Live Analysis**: Updates in real-time as code changes

### OWASP Analysis
- **Scan Types**: Click to initiate with progress animation
- **Results**: Expandable cards with severity indicators
- **Filters**: Multi-select for severity, category, status
- **Export**: Generate PDF/JSON reports

## Component Inventory

### Button
- **Default**: Blue gradient background, white text, subtle shadow
- **Hover**: Brightness increase, shadow expansion, slight scale
- **Active**: Scale down 0.98, shadow reduction
- **Disabled**: Grayscale, reduced opacity, no pointer
- **Loading**: Spinner icon, text change to "Loading..."
- **Variants**: Primary, Secondary (outline), Ghost, Danger

### Input Field
- **Default**: White background, light border, blue focus ring
- **Focus**: Blue border, glow effect, label lift animation
- **Error**: Red border, shake animation, error message fade-in
- **Success**: Green checkmark icon appears
- **With Icon**: Icon positioned left, padding adjustment

### Card
- **Default**: White/glass background, subtle shadow, rounded corners
- **Hover**: Shadow expansion, translateY -4px
- **Selected**: Blue border highlight
- **Variants**: Elevated, Flat, Glass-morphic

### Navigation Item
- **Default**: Text color secondary, no background
- **Hover**: Light blue background tint
- **Active**: Blue background, white text, left accent bar
- **With Badge**: Red notification dot

### Security Badge
- **Critical**: Red background, white text, pulse animation
- **High**: Orange background
- **Medium**: Yellow background, dark text
- **Low**: Blue background
- **Info**: Gray background

### Modal
- **Backdrop**: Dark overlay with blur
- **Container**: Slide up + fade in, 300ms
- **Close**: X button top-right, also closes on backdrop click

## Technical Approach

### Stack
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS for utilities + custom CSS for animations
- **3D Graphics**: CSS 3D transforms + Three.js for particle system
- **Icons**: Lucide React
- **State**: React Context + localStorage persistence
- **Routing**: React Router v6

### Architecture
```
src/
├── components/
│   ├── common/          # Button, Input, Card, Modal, Badge
│   ├── layout/           # Navbar, Sidebar, PageContainer
│   ├── login/            # LoginForm, AnimatedBackground
│   ├── onboarding/       # Steps, ProgressBar, RoleSelector
│   ├── dashboard/        # StatCard, QuickActions, ActivityFeed
│   ├── ide/              # FileTree, Editor, AnalysisPanel
│   └── security/         # VulnerabilityCard, ThreatFeed, Charts
├── pages/
│   ├── Login.jsx
│   ├── Onboarding.jsx
│   ├── Dashboard.jsx
│   ├── IDE.jsx
│   ├── Analysis.jsx
│   └── Threats.jsx
├── context/
│   └── AppContext.jsx    # User state, theme, onboarding progress
├── styles/
│   └── animations.css    # Keyframe animations, 3D transforms
├── utils/
│   └── securityData.js   # Mock OWASP data
└── App.jsx
```

### Data Model (Mock)
```javascript
User: { id, name, email, role, experience, languages, securityFocus, onboardingComplete }
Project: { id, name, language, lastModified, threatLevel, vulnerabilities[] }
Vulnerability: { id, cweId, title, severity, description, remediation, status }
Threat: { id, title, source, severity, timestamp, indicators[] }
```

### OWASP Top 10 Categories (2021)
1. A01:2021 – Broken Access Control
2. A02:2021 – Cryptographic Failures
3. A03:2021 – Injection
4. A04:2021 – Insecure Design
5. A05:2021 – Security Misconfiguration
6. A06:2021 – Vulnerable Components
7. A07:2021 – Authentication Failures
8. A08:2021 – Data Integrity Failures
9. A09:2021 – Logging & Monitoring Failures
10. A10:2021 – SSRF
