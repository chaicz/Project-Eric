# Project Eric - full test report

Generated: 2026-11-09T17:18:06.074Z

## Result at a glance

| Area | What was tested | Outcome |
|------|-----------------|---------|
| Unit tests | Every unit suite in `tests/unit` | 546 passed, 0 failed |
| Test suites | All 13 suites in `scripts/run-all-tests.cjs` | 13/13 passed |
| Route coverage | Every route in `src/App.jsx` vs the walkthrough | 25/25 routes visited |
| Functional walkthrough | Every page and control, in a real browser | 59 steps, 0 errors, 0 warnings |
| Screen recording | The whole walkthrough, captured to video | `logs/recording/recording.mp4` |

## The recorded walkthrough

59 steps were recorded. Every step has a timestamp, a screenshot and the result the app gave back.

- Video: `logs/recording/recording.mp4`
- Transcript: `logs/recording/transcript.md`
- Step data: `logs/recording/transcript.json`
- Screenshots: `logs/recording/steps/`

| Section | Steps | Passed | Failed |
|---------|-------|--------|--------|
| Public pages | 8 | 8 | 0 |
| Wrong routes | 16 | 16 | 0 |
| Sign in | 1 | 1 | 0 |
| Onboarding | 2 | 2 | 0 |
| Protected pages | 16 | 16 | 0 |
| Interactive controls | 7 | 7 | 0 |
| Settings tabs | 7 | 7 | 0 |
| OWASP analysis tabs | 2 | 2 | 0 |

## Where every route actually took the user

| URL requested | Page | Landed on | Redirected? |
|---------------|------|-----------|-------------|
| `/landing` | Landing | `/landing` | no |
| `/` | Root redirect | `/landing` | yes |
| `/login` | Login | `/login` | no |
| `/signup` | Signup | `/signup` | no |
| `/forgot-password` | Forgot password | `/forgot-password` | no |
| `/terms-of-service` | Terms of service | `/terms-of-service` | no |
| `/privacy-policy` | Privacy policy | `/privacy-policy` | no |
| `/viewer` | Lite viewer | `/viewer` | no |
| `/dashboard` | Dashboard | `/dashboard` | no |
| `/analysis` | Security analysis | `/analysis` | no |
| `/threats` | Threat intelligence | `/threats` | no |
| `/reports` | Reports | `/reports` | no |
| `/team` | Team | `/team` | no |
| `/about-team` | About the team | `/about-team` | no |
| `/api-keys` | API keys | `/api-keys` | no |
| `/audit-logs` | Audit logs | `/audit-logs` | no |
| `/notifications` | Notifications | `/notifications` | no |
| `/settings` | Settings | `/settings` | no |
| `/profile` | Profile | `/profile` | no |
| `/sandbox` | Sandbox | `/sandbox` | no |
| `/owasp` | OWASP scanner | `/owasp` | no |
| `/owasp-analysis` | OWASP analysis | `/owasp-analysis` | no |
| `/ide` | Live IDE | `/ide` | no |
| `/collab` | Live collaboration | `/collab` | no |

## What the user sees on a wrong URL

These are the URLs a user is most likely to type by hand, or that arrive from a stale bookmark. Each one was visited and the text the user would actually read was captured.

| URL typed | Lands on | What the user sees |
|-----------|----------|--------------------|
| `/dashbord` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/dashboard/overview` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/reports/2026` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/settings/security` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/nonexistent` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/admin` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/api/users` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/../../etc/passwd` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/%2e%2e/%2e%2e/etc/passwd` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/login?redirect=/dashboard` | `/login` | ENCRYPTION 256-bit SSL End-to-end COMPLIANCE SOC 2 Type II Ready UPTIME 99.99% Last 12 months TRUSTED BY 10K+ ... |
| `/OWASP` | `/OWASP` | Project Eric Security Platform MAIN Dashboard Analysis Threats Reports Team About Dev Team TOOLS Collaboration... |
| `/owasp-scan` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/collab/room-42` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/team/invite` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |
| `/onboarding` | `/dashboard` | Project Eric Security Platform MAIN Dashboard Analysis Threats Reports Team About Dev Team TOOLS Collaboration... |
| `/ide/workspace` | `/landing` | Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE... |

### In full

**`/dashbord`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/dashboard/overview`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/reports/2026`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/settings/security`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/nonexistent`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/admin`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/api/users`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/../../etc/passwd`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/%2e%2e/%2e%2e/etc/passwd`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/login?redirect=/dashboard`** -> `/login`

> ENCRYPTION 256-bit SSL End-to-end COMPLIANCE SOC 2 Type II Ready UPTIME 99.99% Last 12 months TRUSTED BY 10K+ Security teams Project Eric SECURITY PLATFORM Welcome back Sign in to 

**`/OWASP`** -> `/OWASP`

> Project Eric Security Platform MAIN Dashboard Analysis Threats Reports Team About Dev Team TOOLS Collaboration Code Server OWASP Scanner SYSTEM AI API Keys Audit Logs Settings Logo

**`/owasp-scan`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/collab/room-42`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/team/invite`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

**`/onboarding`** -> `/dashboard`

> Project Eric Security Platform MAIN Dashboard Analysis Threats Reports Team About Dev Team TOOLS Collaboration Code Server OWASP Scanner SYSTEM AI API Keys Audit Logs Settings Logo

**`/ide/workspace`** -> `/landing`

> Project Eric DETECTION OWASP AI THREATS STATS PRICING Sign In Get Started 01INTRO 01 / 10 / SECURITY-FIRST IDE SECURE CODE . Project Eric is the security-first IDE. Real-time vulne

## Findings

No errors and no warnings came out of the walkthrough. The pages rendered what they advertise, no console errors were raised, no request failed, and no API call answered with a 4xx or 5xx.

## The other test suites

`npm run test:all` runs each of these as its own process, so a crash in one cannot hide another.

| Suite | Result |
|-------|--------|
| unit (main app) | 546/546 passed |
| route coverage | passed |
| owasp 10-language fixtures | passed |
| owasp secure reference files | passed |
| language packs (repo) | passed |
| language packs (installed) | passed |
| text diff | passed |
| text sync | passed |
| sandbox asset inlining | passed |
| sandbox preview runners | passed |
| owasp extension | 7/7 passed |
| p2p-live-share extension | 225/225 passed |
| eric-collab text sync | passed |

## How to run it again

```
npm run test:all       # every unit and integration suite
npm run test:recorded  # the recorded walkthrough with the screen capture
npm run test:report    # rebuild this report
```

The recorded walkthrough needs the dev server on port 5173, XAMPP for the API, and ffmpeg on the path.