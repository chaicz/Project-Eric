// ---------------------------------------------------------------------------
// Security insights.
//
// The analytical layer of the Security page. Each insight is a
// *conclusion* drawn from the findings — "three findings share one CWE" —
// rather than a restatement of a count the user can already see.
//
// The reasoning lives here, in a plain module with no React in it, so it
// can be unit tested and so the same findings always produce the same
// insights regardless of how the page renders them.
// ---------------------------------------------------------------------------

/**
 * Group findings by a key and return the largest group.
 *
 * @param {Array<object>} findings
 * @param {(finding: object) => string|null} keyOf
 * @returns {{ key: string, count: number }|null} null when nothing groups.
 */
const largestGroup = (findings, keyOf) => {
  const counts = new Map();
  for (const finding of findings) {
    const key = keyOf(finding);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  let best = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count) best = { key, count };
  }
  return best;
};

/**
 * Derive the insight cards for the Security page.
 *
 * @param {Array<object>} findings      the open findings
 * @param {Array<object>} threats       the active threats (optional)
 * @param {number} resolvedCount        findings already marked fixed
 * @returns {Array<{key: string, title: string, metric: number, body: string, tone: string}>}
 */
export const buildInsights = (findings = [], threats = [], resolvedCount = 0) => {
  const insights = [];
  const open = Array.isArray(findings) ? findings : [];
  const activeThreats = Array.isArray(threats) ? threats : [];

  // 1. The concentration insight — one CWE behind several findings is the
  //    single highest-leverage fix, because one change closes them all.
  const topCwe = largestGroup(open, (f) => f.cweId || f.cwe);
  if (topCwe && topCwe.count > 1) {
    insights.push({
      key: 'cwe',
      tone: 'violet',
      title: 'Repeated weakness',
      metric: topCwe.count,
      body: `${topCwe.count} findings share the weakness ${topCwe.key}. Fixing it once closes the whole group.`,
    });
  }

  // 2. The concentration insight at the category level.
  const topCategory = largestGroup(open, (f) => f.category);
  if (topCategory && topCategory.count > 1) {
    insights.push({
      key: 'category',
      tone: 'amber',
      title: 'Hot category',
      metric: topCategory.count,
      body: `${topCategory.key} accounts for ${topCategory.count} open ${topCategory.count === 1 ? 'finding' : 'findings'}. It is your biggest single gap.`,
    });
  }

  // 3. The blast radius of the criticals.
  const criticals = open.filter((f) => f.severity === 'critical');
  if (criticals.length > 0) {
    const projects = new Set(criticals.map((f) => f.projectName).filter(Boolean));
    insights.push({
      key: 'critical',
      tone: 'rose',
      title: 'Critical exposure',
      metric: criticals.length,
      body:
        projects.size > 1
          ? `${criticals.length} critical findings span ${projects.size} projects.`
          : `${criticals.length} critical ${criticals.length === 1 ? 'finding needs' : 'findings need'} a fix before the next release.`,
    });
  }

  // 4. Momentum — how much has already been closed.
  if (resolvedCount > 0) {
    insights.push({
      key: 'resolved',
      tone: 'emerald',
      title: 'Progress',
      metric: resolvedCount,
      body: `${resolvedCount} ${resolvedCount === 1 ? 'finding has' : 'findings have'} been resolved. The backlog is shrinking.`,
    });
  }

  // 5. The live-threat signal.
  if (activeThreats.length > 0) {
    insights.push({
      key: 'threats',
      tone: 'blue',
      title: 'Live threats',
      metric: activeThreats.length,
      body: `${activeThreats.length} ${activeThreats.length === 1 ? 'threat is' : 'threats are'} failing in your latest scan.`,
    });
  }

  return insights;
};
