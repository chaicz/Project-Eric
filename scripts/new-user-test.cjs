#!/usr/bin/env node
/**
 * New-user end-to-end test.
 *
 * Registers a brand-new account from scratch and walks the whole system
 * one function at a time, exactly like a person who just signed up:
 *
 *   1. register
 *   2. validate the token
 *   3. dashboard / projects / vulnerabilities / threats / scans
 *   4. public pages (landing, features, team)
 *   5. run an OWASP scan and confirm it is persisted
 *   6. confirm the new account still sees only its own rows
 *
 * Every step asserts the expected invariant, so the script exits non-zero
 * when something leaks. Run it against a live XAMPP stack:
 *
 *   node scripts/new-user-test.cjs
 *   node scripts/new-user-test.cjs --email someone@example.com
 */

const BASE = 'http://localhost/project-eric-api/api';

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = argv.indexOf(name);
  return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback;
};

// A fresh address every run, unless one is passed in.
const stamp = Date.now().toString(36);
const EMAIL = flag('--email', `newuser.${stamp}@project-eric.test`);
const PASSWORD = 'NewUser2026';

let failures = 0;
let checks = 0;

const green = (s) => `\u001b[32m${s}\u001b[0m`;
const red = (s) => `\u001b[31m${s}\u001b[0m`;
const dim = (s) => `\u001b[90m${s}\u001b[0m`;
const bold = (s) => `\u001b[1m${s}\u001b[0m`;

function check(label, condition, detail = '') {
  checks++;
  if (condition) {
    console.log(`  ${green('PASS')}  ${label}${detail ? dim('  ' + detail) : ''}`);
  } else {
    failures++;
    console.log(`  ${red('FAIL')}  ${label}${detail ? red('  ' + detail) : ''}`);
  }
}

function section(title) {
  console.log(`\n${bold(title)}`);
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, json, data: json?.data ?? null };
}

const countOf = (data, key) => (Array.isArray(data?.[key]) ? data[key].length : null);

(async () => {
  console.log(bold('Project Eric — new-user walkthrough'));
  console.log(dim(`email: ${EMAIL}`));

  // -------------------------------------------------------------------
  section('1. Register a brand-new account');
  const reg = await call('/auth/register', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, firstName: 'New', lastName: 'User' },
  });
  check('register returns 200', reg.status === 200, `status=${reg.status} ${reg.json?.error || ''}`);
  const token = reg.data?.token;
  check('register returns a JWT', !!token);
  check('register returns the user payload', reg.data?.user?.email === EMAIL);
  check('register returns no project data', !reg.data?.projects);
  if (!token) {
    console.log(red('\nCannot continue without a token.'));
    process.exit(1);
  }

  // The account must be usable straight away.
  const dupe = await call('/auth/register', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD, firstName: 'New', lastName: 'User' },
  });
  check('duplicate email is rejected with 409', dupe.status === 409, `status=${dupe.status}`);

  const weak = await call('/auth/register', {
    method: 'POST',
    body: { email: `weak.${stamp}@project-eric.test`, password: 'abc', firstName: 'A', lastName: 'B' },
  });
  check('weak password is rejected with 400', weak.status === 400, `status=${weak.status}`);

  const badEmail = await call('/auth/register', {
    method: 'POST',
    body: { email: 'not-an-email', password: PASSWORD, firstName: 'A', lastName: 'B' },
  });
  check('invalid email is rejected with 400', badEmail.status === 400, `status=${badEmail.status}`);

  // -------------------------------------------------------------------
  section('2. Session');
  const validate = await call('/auth/validate', { token });
  check('GET /auth/validate succeeds', validate.status === 200, `status=${validate.status}`);
  check('validate reports the right account', validate.data?.user?.email === EMAIL);

  const noAuth = await call('/dashboard');
  check('dashboard without a token is 401', noAuth.status === 401, `status=${noAuth.status}`);

  const badAuth = await call('/dashboard', { token: 'garbage.token.value' });
  check('dashboard with a bad token is 401', badAuth.status === 401, `status=${badAuth.status}`);

  const logout = await call('/auth/logout', { method: 'POST', token });
  check('POST /auth/logout succeeds', logout.status === 200, `status=${logout.status}`);

  const relogin = await call('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  check('login with the new account succeeds', relogin.status === 200, `status=${relogin.status}`);
  check('login returns a fresh JWT', !!relogin.data?.token);

  const wrongPw = await call('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: 'WrongPassword1' },
  });
  check('login with a wrong password is 401', wrongPw.status === 401, `status=${wrongPw.status}`);

  // -------------------------------------------------------------------
  section('3. The workspace must start empty');
  const dash = await call('/dashboard', { token });
  check('GET /dashboard succeeds', dash.status === 200, `status=${dash.status}`);
  check('dashboard returns no projects', countOf(dash.data, 'projects') === 0,
    `projects=${countOf(dash.data, 'projects')}`);
  check('dashboard returns no vulnerabilities', countOf(dash.data, 'recentVulnerabilities') === 0,
    `recentVulnerabilities=${countOf(dash.data, 'recentVulnerabilities')}`);
  check('dashboard totalVulnerabilities is 0', dash.data?.totalVulnerabilities === 0,
    `total=${dash.data?.totalVulnerabilities}`);
  check('dashboard stats.scansCompleted is 0', dash.data?.stats?.scansCompleted === 0,
    `scans=${dash.data?.stats?.scansCompleted}`);
  check('dashboard stats.codeLinesAnalyzed is 0', dash.data?.stats?.codeLinesAnalyzed === 0,
    `lines=${dash.data?.stats?.codeLinesAnalyzed}`);
  check('dashboard stats.totalVulnerabilities is 0', dash.data?.stats?.totalVulnerabilities === 0,
    `vulns=${dash.data?.stats?.totalVulnerabilities}`);
  check('dashboard stats.secureScore is 100 (nothing to fix)', dash.data?.stats?.secureScore === 100,
    `score=${dash.data?.stats?.secureScore}`);
  check('dashboard activity has 7 empty days',
    Array.isArray(dash.data?.activity) && dash.data.activity.length === 7 &&
    dash.data.activity.every((d) => d.detected === 0 && d.resolved === 0 && d.scans === 0));
  check('dashboard categoryCounts are all zero',
    dash.data?.categoryCounts && Object.values(dash.data.categoryCounts).every((n) => n === 0));

  const projects = await call('/projects', { token });
  check('GET /projects succeeds', projects.status === 200, `status=${projects.status}`);
  check('projects list is empty', countOf(projects.data, 'projects') === 0,
    `projects=${countOf(projects.data, 'projects')}`);

  const vulns = await call('/vulnerabilities', { token });
  check('GET /vulnerabilities succeeds', vulns.status === 200, `status=${vulns.status}`);
  check('vulnerabilities list is empty', countOf(vulns.data, 'vulnerabilities') === 0,
    `vulnerabilities=${countOf(vulns.data, 'vulnerabilities')}`);

  const scans = await call('/scans', { token });
  check('GET /scans succeeds', scans.status === 200, `status=${scans.status}`);
  check('scan history is empty', countOf(scans.data, 'scans') === 0,
    `scans=${countOf(scans.data, 'scans')}`);

  // This is checked here, before the account has done anything, because
  // every action below raises a notification of its own. Asserting it
  // later would see the account's own history, not the empty start.
  const freshNotifications = await call('/notifications', { token });
  check('GET /notifications succeeds', freshNotifications.status === 200,
    `status=${freshNotifications.status}`);
  check('a brand-new account starts with no notifications',
    countOf(freshNotifications.data, 'notifications') === 0,
    `notifications=${countOf(freshNotifications.data, 'notifications')}`);
  check('the unread counter starts at zero', freshNotifications.data?.unread === 0,
    `unread=${freshNotifications.data?.unread}`);

  // -------------------------------------------------------------------
  section('4. Public pages');
  const landing = await call('/landing');
  check('GET /landing succeeds', landing.status === 200, `status=${landing.status}`);
  const features = await call('/features');
  check('GET /features succeeds', features.status === 200, `status=${features.status}`);
  check('features list is populated', countOf(features.data, 'features') > 0);
  const publicTeam = await call('/team');
  check('GET /team succeeds', publicTeam.status === 200, `status=${publicTeam.status}`);
  check('team list is populated',
    countOf(publicTeam.data, 'team') > 0 || countOf(publicTeam.data, 'members') > 0);

  // -------------------------------------------------------------------
  section('5. Run an OWASP scan as the new user');
  const scan = await call('/scans', {
    method: 'POST',
    token,
    body: {
      projectName: `Scan · JavaScript`,
      language: 'JavaScript',
      framework: 'OWASP Scanner',
      scanType: 'full',
      mode: 'code',
      score: 62,
      summary: 'Medium Risk',
      lineCount: 40,
      findings: [
        {
          id: 'A03', name: 'Injection', status: 'fail', count: 2,
          severity: 'high', description: 'Unsanitised input reaches a query.',
          cwe: 'CWE-89', remediation: 'Use prepared statements.',
          evidence: [{ line: 12, snippet: 'db.query(input)' }],
        },
        {
          id: 'A02', name: 'Cryptographic Failures', status: 'fail', count: 1,
          severity: 'medium', description: 'Weak hashing.',
          cwe: 'CWE-327', remediation: 'Use bcrypt.',
          evidence: [{ line: 20, snippet: 'md5(x)' }],
        },
        { id: 'A01', name: 'Broken Access Control', status: 'pass', count: 0, severity: 'low', description: '', cwe: '', remediation: '', evidence: [] },
      ],
    },
  });
  check('POST /scans succeeds', scan.status === 201, `status=${scan.status} ${scan.json?.error || ''}`);
  check('scan reports 2 persisted findings', scan.data?.vulnerabilitiesFound === 2,
    `found=${scan.data?.vulnerabilitiesFound}`);
  check('a passing category is not stored', scan.data?.vulnerabilitiesFound !== 3);

  const dash2 = await call('/dashboard', { token });
  check('dashboard now shows the scan', dash2.data?.stats?.scansCompleted === 1,
    `scans=${dash2.data?.stats?.scansCompleted}`);
  check('dashboard shows 2 vulnerabilities', dash2.data?.stats?.totalVulnerabilities === 2,
    `vulns=${dash2.data?.stats?.totalVulnerabilities}`);
  check('dashboard shows 40 lines analyzed', dash2.data?.stats?.codeLinesAnalyzed === 40,
    `lines=${dash2.data?.stats?.codeLinesAnalyzed}`);
  check('the new project appears', countOf(dash2.data, 'projects') === 1,
    `projects=${countOf(dash2.data, 'projects')}`);
  check('A03 category count is 1', dash2.data?.categoryCounts?.A03 === 1,
    `A03=${dash2.data?.categoryCounts?.A03}`);
  check('A01 category count is 0 (passing category)', dash2.data?.categoryCounts?.A01 === 0,
    `A01=${dash2.data?.categoryCounts?.A01}`);

  const vulns2 = await call('/vulnerabilities', { token });
  check('the two findings are listed', countOf(vulns2.data, 'vulnerabilities') === 2,
    `vulnerabilities=${countOf(vulns2.data, 'vulnerabilities')}`);
  const categories = (vulns2.data?.vulnerabilities || []).map((v) => v.category);
  check('the finding category is the name, not the OWASP id',
    categories.includes('Injection') && categories.includes('Cryptographic Failures'),
    JSON.stringify(categories));

  const scans2 = await call('/scans', { token });
  check('scan history now has 1 entry', countOf(scans2.data, 'scans') === 1,
    `scans=${countOf(scans2.data, 'scans')}`);

  // -------------------------------------------------------------------
  section('6. The IDE workspace is linked to the account');
  const workspace = await call('/workspace', { token });
  check('GET /workspace succeeds', workspace.status === 200, `status=${workspace.status}`);
  check('workspace names the signed-in account',
    workspace.data?.user?.email === EMAIL, JSON.stringify(workspace.data?.user?.email));
  check('workspace has its own folder',
    typeof workspace.data?.workspace?.name === 'string' &&
    workspace.data.workspace.name.startsWith('user-'),
    workspace.data?.workspace?.name);
  check('workspace folder lives under the IDE root',
    String(workspace.data?.workspace?.path || '').includes('project-eric-ide'),
    workspace.data?.workspace?.path);
  check('workspace points at a per-account code-server port',
    // The per-account ports run from CODE_SERVER_USER_PORT_BASE (8090)
    // for 200 slots, so 8090-8289.
    /^http:\/\/127\.0\.0\.1:8(?:09\d|1\d\d|2[0-8]\d)$/.test(
      String(workspace.data?.workspace?.codeServerUrl || '')),
    workspace.data?.workspace?.codeServerUrl);

  // -------------------------------------------------------------------
  section('7. Other accounts must not be visible');
  const otherLogin = await call('/auth/login', {
    method: 'POST',
    body: { email: 'demo@project-eric.com', password: 'demo123' },
  });
  let otherToken = null;
  if (otherLogin.status === 200) {
    otherToken = otherLogin.data.token;
    const otherDash = await call('/dashboard', { token: otherToken });
    console.log(dim(`  demo account sees: projects=${countOf(otherDash.data, 'projects')}, ` +
      `vulns=${otherDash.data?.totalVulnerabilities}, scans=${otherDash.data?.stats?.scansCompleted}`));
    const overlap = (otherDash.data?.projects || []).some((p) =>
      (dash2.data?.projects || []).some((q) => q.id === p.id && q.name === p.name));
    check('the two accounts do not share a project row', !overlap);

    const otherWorkspace = await call('/workspace', { token: otherToken });
    check('the two accounts get different workspaces',
      otherWorkspace.data?.workspace?.name !== workspace.data?.workspace?.name,
      `${workspace.data?.workspace?.name} vs ${otherWorkspace.data?.workspace?.name}`);
    check('the two accounts get different code-server ports',
      otherWorkspace.data?.workspace?.codeServerUrl !== workspace.data?.workspace?.codeServerUrl,
      `${workspace.data?.workspace?.codeServerUrl} vs ${otherWorkspace.data?.workspace?.codeServerUrl}`);
  } else {
    console.log(dim('  demo account not present — skipping the isolation check'));
  }

  // -------------------------------------------------------------------
  section('8. The onboarding state survives a reload');
  // The flag used to live in the browser only. The next /auth/validate
  // call replaced the cached user with the server's copy, the flag came
  // back false, and a page refresh threw the user back into the tour.
  const onboarding = await call('/auth/onboarding', {
    method: 'POST',
    token,
    body: { experience: 'senior', languages: ['JavaScript', 'Python'], securityFocus: ['A03'] },
  });
  check('POST /auth/onboarding succeeds', onboarding.status === 200, `status=${onboarding.status}`);
  check('the saved user reports the onboarding as complete',
    onboarding.data?.user?.onboardingComplete === true);

  const revalidate = await call('/auth/validate', { token });
  check('the server still reports the onboarding as complete after a reload',
    revalidate.data?.user?.onboardingComplete === true,
    `onboardingComplete=${revalidate.data?.user?.onboardingComplete}`);
  check('the onboarding answers were stored',
    revalidate.data?.user?.experience === 'senior' &&
    (revalidate.data?.user?.languages || []).includes('JavaScript'),
    `experience=${revalidate.data?.user?.experience}`);
  check('the security focus answers were stored',
    (revalidate.data?.user?.securityFocus || []).includes('A03'),
    `securityFocus=${JSON.stringify(revalidate.data?.user?.securityFocus)}`);

  // -------------------------------------------------------------------
  section('9. The notifications belong to this account alone');
  const notifications = await call('/notifications', { token });
  check('GET /notifications succeeds', notifications.status === 200, `status=${notifications.status}`);
  // At this point the account has run one scan, so it has exactly one
  // notification — the one its own scan raised.
  const ownNotifications = notifications.data?.notifications || [];
  const ownTitles = ownNotifications.map((n) => n.title);
  check('the account sees the notification its own scan raised',
    ownTitles.includes('Scan completed'), JSON.stringify(ownTitles));
  check('the account sees nothing it did not raise',
    ownNotifications.length === 1, `notifications=${ownNotifications.length}`);
  // The demo account has notifications of its own. None of them may show
  // up in this account's list.
  if (otherToken) {
    const otherNotifications = await call('/notifications', { token: otherToken });
    const otherIds = new Set((otherNotifications.data?.notifications || []).map((n) => n.id));
    check('no notification from the other account leaks in',
      ownNotifications.every((n) => !otherIds.has(n.id)),
      JSON.stringify(ownNotifications.map((n) => n.id)));
    check('the two accounts do not share a notification row',
      (otherNotifications.data?.notifications || []).every((n) =>
        !ownNotifications.some((m) => m.id === n.id)));
  } else {
    console.log(dim('  demo account not present — skipping the notification isolation check'));
  }
  check('the unread counter matches the unread notifications',
    notifications.data?.unread === ownNotifications.filter((n) => !n.read).length,
    `unread=${notifications.data?.unread}`);

  // -------------------------------------------------------------------
  section('10. The team belongs to the account alone');
  const team = await call('/team/members', { token });
  check('GET /team/members succeeds', team.status === 200, `status=${team.status}`);
  check('the team has exactly one member - the owner',
    countOf(team.data, 'members') === 1,
    `members=${countOf(team.data, 'members')}`);
  check('the owner is the signed-in account',
    team.data?.members?.[0]?.email === EMAIL,
    team.data?.members?.[0]?.email);
  check('there are no pending invitations',
    countOf(team.data, 'invitations') === 0);

  const invite = await call('/team/members', {
    method: 'POST',
    token,
    body: { email: `colleague.${stamp}@project-eric.test`, role: 'developer' },
  });
  check('an invitation can be sent', invite.status === 201, `status=${invite.status}`);
  const team2 = await call('/team/members', { token });
  check('the invitation shows up on the team',
    countOf(team2.data, 'invitations') === 1,
    `invitations=${countOf(team2.data, 'invitations')}`);

  // -------------------------------------------------------------------
  section('11. The API keys belong to the account alone');
  const keys = await call('/api-keys', { token });
  check('GET /api-keys succeeds', keys.status === 200, `status=${keys.status}`);
  check('the key list is empty for a new account',
    countOf(keys.data, 'apiKeys') === 0,
    `keys=${countOf(keys.data, 'apiKeys')}`);

  const createdKey = await call('/api-keys', {
    method: 'POST',
    token,
    body: { name: 'Test key' },
  });
  check('a key can be created', createdKey.status === 201, `status=${createdKey.status}`);
  check('the key material is returned once',
    typeof createdKey.data?.key === 'string' && createdKey.data.key.startsWith('ai_sk_'),
    createdKey.data?.key);

  const keys2 = await call('/api-keys', { token });
  check('the key is listed', countOf(keys2.data, 'apiKeys') === 1);
  check('the listed key is masked',
    String(keys2.data?.apiKeys?.[0]?.key || '').includes('*'),
    keys2.data?.apiKeys?.[0]?.key);

  const deletedKey = await call('/api-keys', {
    method: 'DELETE',
    token,
    body: { id: createdKey.data?.id },
  });
  check('the key can be deleted', deletedKey.status === 200, `status=${deletedKey.status}`);
  const keys3 = await call('/api-keys', { token });
  check('the key list is empty again', countOf(keys3.data, 'apiKeys') === 0);

  // -------------------------------------------------------------------
  section('12. The integrations belong to the account alone');
  const integrations = await call('/integrations', { token });
  check('GET /integrations succeeds', integrations.status === 200, `status=${integrations.status}`);
  check('nothing is connected for a new account',
    countOf(integrations.data, 'integrations') === 0,
    `integrations=${countOf(integrations.data, 'integrations')}`);

  const connected = await call('/integrations', {
    method: 'POST',
    token,
    body: { provider: 'github' },
  });
  check('an integration can be connected', connected.status === 201, `status=${connected.status}`);
  const integrations2 = await call('/integrations', { token });
  check('the connection is listed', countOf(integrations2.data, 'integrations') === 1);
  check('the connection is active', integrations2.data?.integrations?.[0]?.connected === true);

  // -------------------------------------------------------------------
  section('13. The audit trail shows only this account\'s events');
  const logs = await call('/audit-logs', { token });
  check('GET /audit-logs succeeds', logs.status === 200, `status=${logs.status}`);
  check('the registration is recorded',
    (logs.data?.logs || []).some((l) => l.action === 'register'),
    `${countOf(logs.data, 'logs')} entries`);
  check('no entry mentions another account',
    !(logs.data?.logs || []).some((l) => String(l.details || '').includes('demo@project-eric.com')));

  // -------------------------------------------------------------------
  section('14. The profile counts this account\'s own rows');
  const profile = await call('/profile', { token });
  check('GET /profile succeeds', profile.status === 200, `status=${profile.status}`);
  check('the profile names the signed-in account', profile.data?.user?.email === EMAIL);
  check('the profile has no demo company', !profile.data?.user?.company);
  check('the profile counts the one project the account owns',
    profile.data?.stats?.projects === 1,
    `projects=${profile.data?.stats?.projects}`);
  check('the profile counts the one scan the account ran',
    profile.data?.stats?.scans === 1,
    `scans=${profile.data?.stats?.scans}`);
  check('the profile counts the findings the scan produced',
    profile.data?.stats?.findings === 2,
    `findings=${profile.data?.stats?.findings}`);

  const savedProfile = await call('/profile', {
    method: 'PUT',
    token,
    body: {
      name: 'New User', username: 'newuser', bio: 'Testing', company: 'Acme',
      experience: 'expert', languages: ['Go'], securityFocus: ['A01'],
    },
  });
  check('PUT /profile succeeds', savedProfile.status === 200, `status=${savedProfile.status}`);
  check('the profile keeps the new company', savedProfile.data?.user?.company === 'Acme',
    savedProfile.data?.user?.company);
  const profile2 = await call('/profile', { token });
  check('the profile change survives a reload',
    profile2.data?.user?.company === 'Acme' && profile2.data?.user?.username === 'newuser');
  // `securityFocus` has no `securityFocus` column — it is stored in
  // `security_focus`. Getting the mapping wrong made the whole UPDATE
  // fail with a 500, so none of the profile fields were saved.
  check('the profile kept the experience it was given',
    profile2.data?.user?.experience === 'expert',
    `experience=${profile2.data?.user?.experience}`);
  check('the profile kept the languages it was given',
    (profile2.data?.user?.languages || []).includes('Go'),
    `languages=${JSON.stringify(profile2.data?.user?.languages)}`);
  check('the profile kept the security focus it was given',
    (profile2.data?.user?.securityFocus || []).includes('A01'),
    `securityFocus=${JSON.stringify(profile2.data?.user?.securityFocus)}`);

  // -------------------------------------------------------------------
  section('15. Every action the account took raised its own notification');
  const notifications2 = await call('/notifications', { token });
  const finalTitles = (notifications2.data?.notifications || []).map((n) => n.title);
  check('the scan produced a notification', finalTitles.includes('Scan completed'),
    JSON.stringify(finalTitles));
  check('the invitation produced a notification', finalTitles.includes('Invitation sent'),
    JSON.stringify(finalTitles));
  check('the API key produced a notification', finalTitles.includes('API key created'),
    JSON.stringify(finalTitles));
  check('the integration produced a notification',
    finalTitles.some((t) => /connected/i.test(t)), JSON.stringify(finalTitles));
  check('the account has exactly the four notifications it raised',
    finalTitles.length === 4, `notifications=${finalTitles.length}`);

  console.log(`\n${bold('Summary')}`);
  console.log(`  ${checks - failures}/${checks} checks passed`);
  if (failures) {
    console.log(red(`  ${failures} FAILED`));
    process.exit(1);
  }
  console.log(green('  all good'));
})().catch((e) => {
  console.error(red(`\nUnexpected error: ${e.message}`));
  console.error(e.stack);
  process.exit(1);
});
