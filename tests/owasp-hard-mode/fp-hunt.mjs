// Diagnostic: which hard rule fires on a *safe* fixture? (false positive hunt)
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const importModule = (p) => import(pathToFileURL(p).href);

const { HARD_RULES } = await importModule(
  path.join(ROOT, 'src', 'utils', 'owaspHardMode', 'hardRules.js')
);
const { FIXTURES } = await importModule(path.join(__dirname, 'fixtures.js'));

console.log('=== FALSE POSITIVES ON SAFE FIXTURES ===');
for (const fixture of FIXTURES) {
  const hits = [];
  for (const rule of HARD_RULES) {
    if (rule.category !== fixture.category) continue;
    for (const [key, list] of Object.entries(rule.patterns || {})) {
      if (key !== '_all' && key !== fixture.language) continue;
      for (const p of list) {
        let re;
        try {
          const flags = p.flags || 'g';
          re = new RegExp(p.regex, flags.includes('g') ? flags : flags + 'g');
        } catch {
          continue;
        }
        const m = re.exec(fixture.safe);
        if (m) {
          hits.push({
            rule: rule.id,
            key,
            pattern: p.regex.slice(0, 80),
            match: m[0].slice(0, 90),
            label: p.label,
          });
          break;
        }
      }
    }
  }
  if (hits.length) {
    console.log(`\n${fixture.id} [${fixture.category}/${fixture.language}]`);
    for (const h of hits) {
      console.log(`  ${h.rule} [${h.key}] ${h.label}`);
      console.log(`    matched: ${JSON.stringify(h.match)}`);
      console.log(`    pattern: ${h.pattern}`);
    }
  }
}
