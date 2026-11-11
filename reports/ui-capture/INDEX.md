# Project Eric — UI capture

Captured 04/11/2026, 23:08:26 from a live run against the dev stack.

Every shot was taken as a brand-new account, created through the real signup
form and signed in through the real login form, so what is shown is the
interface a first-time user actually sees.

## Public

### 01 · Landing page

![Landing page](01-public-landing.png)

The marketing entry point, shown to a visitor who is not signed in.

File: `01-public-landing.png` · Route: `/landing`

### 02 · Sign in

![Sign in](02-public-login.png)

The login form a new user comes back to after signing up.

File: `02-public-login.png` · Route: `/login`

### 03 · Create your account

![Create your account](03-public-signup.png)

The signup form with a valid password: the strength meter and the four password rules all pass.

File: `03-public-signup.png` · Route: `/signup`

### 04 · Forgot password

![Forgot password](04-public-forgot-password.png)

The password recovery request form.

File: `04-public-forgot-password.png` · Route: `/forgot-password`

### 05 · Terms of Service

![Terms of Service](05-public-terms.png)

The terms page linked from the signup form.

File: `05-public-terms.png` · Route: `/terms-of-service`

### 06 · Privacy Policy

![Privacy Policy](06-public-privacy.png)

The privacy page linked from the signup form.

File: `06-public-privacy.png` · Route: `/privacy-policy`

### 45 · Collab viewer

![Collab viewer](45-public-viewer.png)

The public viewer a guest opens through a share link.

File: `45-public-viewer.png` · Route: `/viewer`

## Dashboard

### 07 · Dashboard

![Dashboard](07-app-dashboard.png)

The landing page of the signed-in app: security score, recent scans and the quick actions.

File: `07-app-dashboard.png` · Route: `/dashboard`

## OWASP Scanner

### 08 · OWASP scanner — ready

![OWASP scanner — ready](08-owasp-scanner-idle.png)

The scanner before anything is submitted: mode picker, editor and the language selector.

File: `08-owasp-scanner-idle.png` · Route: `/owasp`

### 09 · OWASP scanner — file loaded

![OWASP scanner — file loaded](09-owasp-scanner-uploaded.png)

The vulnerable PHP file uploaded. The language was detected automatically and the line/character counters updated.

File: `09-owasp-scanner-uploaded.png` · Route: `/owasp`

### 10 · OWASP scan results

![OWASP scan results](10-owasp-scanner-results.png)

The finished scan: the security score, the per-category cards and the "Send to" hand-off bar.

File: `10-owasp-scanner-results.png` · Route: `/owasp`

### 11 · A single finding, opened

![A single finding, opened](11-owasp-finding-detail.png)

One category expanded: the description, the CWE, the highlighted source line and the remediation steps.

File: `11-owasp-finding-detail.png` · Route: `/owasp`

### 12 · PDF report ready

![PDF report ready](12-owasp-report-dialog.png)

The popup shown once the report is built: the score, the issue count, the page count and the 24-hour deletion notice.

File: `12-owasp-report-dialog.png` · Route: `/owasp`

### 13 · Report stored for 24 hours

![Report stored for 24 hours](13-owasp-report-stored.png)

The stored copy: an unguessable download link and the countdown until the server deletes it.

File: `13-owasp-report-stored.png` · Route: `/owasp`

### PDF · OWASP Top 10 (2026) Security Report (PDF)

![OWASP Top 10 (2026) Security Report (PDF)](owasp-top10-2026-security-report.pdf)

The PDF the OWASP scanner generated for the uploaded vulnerable file (50 KB, 6 pages). It sits in this same folder as the screenshots, and each page is rendered below as `pdf-page-NN.png`.

File: `owasp-top10-2026-security-report.pdf` · Route: `/owasp`

#### PDF page 1 — cover and score

![PDF page 1](pdf-page-01.png)

#### PDF page 2

![PDF page 2](pdf-page-02.png)

#### PDF page 3

![PDF page 3](pdf-page-03.png)

#### PDF page 4

![PDF page 4](pdf-page-04.png)

#### PDF page 5

![PDF page 5](pdf-page-05.png)

#### PDF page 6

![PDF page 6](pdf-page-06.png)

## Analysis

### 14 · Security analysis

![Security analysis](14-app-analysis.png)

The findings from the scan, broken down by severity.

File: `14-app-analysis.png` · Route: `/analysis`

## Threats

### 15 · Threat intelligence

![Threat intelligence](15-app-threats.png)

The same findings framed as threats, with the categories that passed.

File: `15-app-threats.png` · Route: `/threats`

## Reports

### 16 · Reports

![Reports](16-app-reports.png)

The report history. The scan made a moment ago is listed here with its score and its export options.

File: `16-app-reports.png` · Route: `/reports`

## Team

### 17 · Team

![Team](17-app-team.png)

The team page for a brand-new account: no members yet, and the invite button.

File: `17-app-team.png` · Route: `/team`

### 18 · Invite a team member

![Invite a team member](18-app-team-invite-modal.png)

The invite dialog: the email address and the role that is assigned.

File: `18-app-team-invite-modal.png` · Route: `/team`

## About

### 19 · About the team

![About the team](19-app-about-team.png)

The developers behind Project Eric.

File: `19-app-about-team.png` · Route: `/about-team`

## API Keys

### 20 · API keys — feature overview

![API keys — feature overview](20-app-api-keys-overview.png)

What each part of the key system is for and whether it is configured.

File: `20-app-api-keys-overview.png` · Route: `/api-keys`

### 21 · API keys — the keys

![API keys — the keys](21-app-api-keys-keys.png)

The the keys tab of the API keys page.

File: `21-app-api-keys-keys.png` · Route: `/api-keys`

### 22 · API keys — sandbox configuration

![API keys — sandbox configuration](22-app-api-keys-sandbox.png)

The sandbox configuration tab of the API keys page.

File: `22-app-api-keys-sandbox.png` · Route: `/api-keys`

### 23 · API keys — OWASP scanner settings

![API keys — OWASP scanner settings](23-app-api-keys-owasp.png)

The OWASP scanner settings tab of the API keys page.

File: `23-app-api-keys-owasp.png` · Route: `/api-keys`

### 24 · API keys — AI provider

![API keys — AI provider](24-app-api-keys-provider.png)

The AI provider tab of the API keys page.

File: `24-app-api-keys-provider.png` · Route: `/api-keys`

## Audit Logs

### 25 · Audit logs

![Audit logs](25-app-audit-logs.png)

The activity trail for the account. Every action the new user took is listed here.

File: `25-app-audit-logs.png` · Route: `/audit-logs`

## Integrations

### 26 · Integrations

![Integrations](26-app-integrations.png)

The connected services and the button that links each one.

File: `26-app-integrations.png` · Route: `/integrations`

## Notifications

### 27 · Notifications

![Notifications](27-app-notifications.png)

The notification centre for the account.

File: `27-app-notifications.png` · Route: `/notifications`

### 28 · Notification preferences

![Notification preferences](28-app-notification-preferences.png)

The preferences modal: which alerts the account wants, and how they are delivered.

File: `28-app-notification-preferences.png` · Route: `/notifications`

## Settings

### 29 · Settings — profile

![Settings — profile](29-app-settings-profile.png)

The profile tab: the account details and the avatar.

File: `29-app-settings-profile.png` · Route: `/settings`

### 30 · Settings — security

![Settings — security](30-app-settings-security.png)

Password, the two-factor card and the API key list.

File: `30-app-settings-security.png` · Route: `/settings?tab=security`

### 31 · Settings — notifications

![Settings — notifications](31-app-settings-notifications.png)

The per-account alert switches.

File: `31-app-settings-notifications.png` · Route: `/settings?tab=notifications`

### 32 · Settings — appearance

![Settings — appearance](32-app-settings-appearance.png)

The theme buttons and the accent colour swatches.

File: `32-app-settings-appearance.png` · Route: `/settings?tab=appearance`

### 33 · Settings — integrations

![Settings — integrations](33-app-settings-integrations.png)

The same connected services, with the connect and disconnect buttons.

File: `33-app-settings-integrations.png` · Route: `/settings?tab=integrations`

### 34 · Settings — billing

![Settings — billing](34-app-settings-billing.png)

The plan, the usage counters and the payment method.

File: `34-app-settings-billing.png` · Route: `/settings?tab=billing`

### 35 · Settings — help and tour

![Settings — help and tour](35-app-settings-help.png)

The tour restart and the page-tip reset.

File: `35-app-settings-help.png` · Route: `/settings?tab=help`

### 36 · Dark theme

![Dark theme](36-app-dark-mode.png)

The same interface in the dark theme, picked on the appearance tab.

File: `36-app-dark-mode.png` · Route: `/settings?tab=appearance`

## Profile

### 37 · Profile

![Profile](37-app-profile.png)

The profile page: the achievements, the skills and the project activity.

File: `37-app-profile.png` · Route: `/profile`

## Navigation

### 38 · Search menu

![Search menu](38-app-search-menu.png)

The quick-jump menu in the header.

File: `38-app-search-menu.png` · Route: `/dashboard`

### 39 · Help menu

![Help menu](39-app-help-menu.png)

The help and support menu.

File: `39-app-help-menu.png` · Route: `/dashboard`

### 40 · Account menu

![Account menu](40-app-profile-menu.png)

The account menu in the top right corner.

File: `40-app-profile-menu.png` · Route: `/dashboard`

## Sandbox

### 41 · Sandbox

![Sandbox](41-app-sandbox.png)

The in-browser IDE: the file tree, the editor and the output pane.

File: `41-app-sandbox.png` · Route: `/sandbox`

## IDE

### 42 · OWASP analysis workbench

![OWASP analysis workbench](42-app-owasp-analysis.png)

The OWASP analysis page with the code-server workbench embedded alongside it.

File: `42-app-owasp-analysis.png` · Route: `/owasp-analysis`

### 43 · Live IDE

![Live IDE](43-app-ide.png)

The Live IDE page: the status of Vite and code-server, and the button that opens the workbench.

File: `43-app-ide.png` · Route: `/ide`

## Collaboration

### 44 · Live collaboration

![Live collaboration](44-app-collab.png)

The collaboration page: the session state, the public link and the guest instructions.

File: `44-app-collab.png` · Route: `/collab`
