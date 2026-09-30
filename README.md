# Project Eric — Security-First Web IDE

> **Project Eric** is a browser-based IDE that bakes security into the development loop. It scans code in real time against the OWASP Top 10 (2021), explains each finding in plain English, and helps junior developers, instructors, and small-team builders ship safer code without leaving the editor.

![Tech](https://img.shields.io/badge/React-18-149eca) ![Vite](https://img.shields.io/badge/Vite-5-646cff) ![Tailwind](https://img.shields.io/badge/TailwindCSS-3-38bdf8) ![PHP](https://img.shields.io/badge/PHP-8-777bb4) ![OWASP](https://img.shields.io/badge/OWASP-Top%2010-ff6b35)

---

## ✨ Highlights

- **Real-time SAST** — scans JavaScript, TypeScript, Python, Java, PHP, Go, Rust, C/C++, C#, Ruby, SQL, HTML, and CSS in-browser via Web Workers.
- **Educator-grade explanations** — every finding is mapped to an OWASP category with a CWE ID, severity, and a fix-it snippet.
- **Onboarding in five minutes** — wizard captures role, experience, languages, and security focus areas so the dashboard is relevant on day one.
- **Privacy-first** — code is scanned locally by default; no source is uploaded to a third-party server.
- **Accessibility built-in** — full keyboard navigation, WCAG 2.1 AA contrast targets, dark/light themes.
- **JWT-secured PHP API** — auth, OAuth, password reset, audit logs, and team management endpoints backed by MySQL.

---

## 🏗️ Repository layout

```
.
├── src/                       # React 18 + Vite frontend
│   ├── components/            # UI components (layout, auth, common)
│   ├── pages/                 # Route pages (Dashboard, IDE, Analysis, …)
│   ├── context/               # Global state (auth, theme, onboarding)
│   ├── services/              # API client + scan engine + AI hooks
│   └── utils/                 # OWASP pack loader, helpers
├── public/
│   └── extensions/            # Language grammar packs + OWASP rule pack
├── xampp-backend/             # PHP 8 REST API (runs under XAMPP / Apache)
│   └── project-eric-api/
│       ├── api/               # auth/, features/, team/, landing.php
│       ├── config/            # DB + JWT settings
│       └── includes/          # Database + response helpers
├── database/
│   └── setup.sql              # Single-file schema + seed (11 tables)
├── SPEC.md                    # Visual & interaction specification
├── PROJECT_DESCRIPTION.md     # Component-level documentation
└── index.html                 # Vite entry HTML
```

---

## 🚀 Getting started

### 1. Frontend

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production bundle in dist/
```

### 2. Backend (optional — the app also runs in mock-data mode)

The app ships with mock security data, so the frontend works out of the box. To wire up the real API:

1. Copy `.env.example` → `.env` and set `VITE_API_URL`.
2. Move `xampp-backend/project-eric-api/` into `C:\xampp\htdocs\project-eric-api\`.
3. Import `database/setup.sql` via phpMyAdmin (creates the `project_eric` database, 11 tables, seed data).
4. Update `xampp-backend/project-eric-api/config/config.php` with your DB credentials and JWT secret.

Default demo account: `demo@project-eric.com` / `demo123`.

---

## 🧠 The scan engine

`src/utils/owaspPackLoader.js` lazy-loads language grammars from `public/extensions/*.lang.json` and the rule pack from `public/extensions/owasp-pack.json`. Scans execute inside a Web Worker so the UI stays responsive on 1,000+ line files.

The rule pack encodes the **OWASP Top 10 (2021)** categories (A01–A10) with regex-based detectors and remediation snippets, so coverage can be extended without touching the engine.

---

## 🛡️ Security focus

Project Eric's threat model assumes the application itself is a developer-trusted surface. Default posture:

- **Local scan** by default, opt-in to remote analysis.
- **JWT** (HS256) auth with refresh tokens; passwords hashed with `password_hash` (bcrypt cost 12).
- **Audit logs** for every privileged action (`xampp-backend/.../api/auth/*`).
- **Strict CSP** in `index.html`; no inline scripts.
- **No secrets in repo** — `.env` is ignored; only `.env.example` is committed.

If you find a vulnerability, please open an issue tagged `security`.

---

## 🤝 Contributing

1. Fork the repo and create a feature branch (`git checkout -b feat/your-feature`).
2. Follow the existing component patterns under `src/components/` and `src/pages/`.
3. Run `npm run build` to confirm the bundle compiles before opening a PR.

---

## 📄 License

This project is released under the MIT License. See `LICENSE` (add one if absent) for details.

---

## 🙏 Acknowledgements

- **OWASP Foundation** — for the OWASP Top 10 (2021) taxonomy.
- **Lucide** — for the open-source icon set used throughout the UI.
- **Vite + React** — for the developer experience that keeps this project fast to iterate on.

---

*Project Eric — built as a capstone for ICT30016 Technology Innovation Project.*
