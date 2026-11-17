// Diagnostic: why do specific hard-mode rules not fire?
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const importModule = (p) => import(pathToFileURL(p).href);

const { HARD_RULES } = await importModule(
  path.join(ROOT, 'src', 'utils', 'owaspHardMode', 'hardRules.js')
);
const { FIXTURES } = await importModule(path.join(__dirname, 'fixtures.js'));

// 1. Which patterns fail to compile?
console.log('=== INVALID REGEXES ===');
for (const rule of HARD_RULES) {
  for (const [key, list] of Object.entries(rule.patterns || {})) {
    for (const p of list) {
      try {
        new RegExp(p.regex, p.flags || 'g');
      } catch (e) {
        console.log(`${rule.id} [${key}]: ${e.message}`);
        console.log(`   regex: ${p.regex}`);
      }
    }
  }
}

// 2. For each fixture, which hard rules actually match?
console.log('\n=== RULE MATCHES PER FIXTURE ===');
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
        const text = p.multiline ? fixture.vulnerable : fixture.vulnerable.split('\n').join('\n');
        if (re.test(text)) {
          hits.push(`${rule.id} (${key})`);
          break;
        }
      }
    }
  }
  console.log(`${fixture.id} [${fixture.category}/${fixture.language}]: ${hits.length ? hits.join(', ') : 'NO MATCH'}`);
}
