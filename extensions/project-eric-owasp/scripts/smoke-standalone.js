// Smoke test for the standalone scanner bundle.
const eric = require('../dist/project-eric-scanner.cjs.js');

console.log('Project Eric — standalone scanner smoke test');
console.log('===========================================');
console.log('languages available:', eric.languages().join(', '));

// 1. JavaScript injection.
const jsCode = `
function handler(req, res) {
  eval(req.body.code);
  const password = "supersecret12345";
  res.send("<h1>" + req.query.name + "</h1>");
}
`;

const jsResult = eric.scan(jsCode, 'javascript');
console.log('\n[1] JavaScript scan:');
console.log('   findings:', jsResult.findings.length);
const jsScore = eric.score(jsResult);
console.log('   score    :', jsScore.score, '·', jsScore.grade);
for (const f of jsResult.findings) {
  console.log('     -', f.severity.toUpperCase().padEnd(8),
              f.ruleId.padEnd(12),
              f.ruleName);
}

// 2. MCP server detection by content.
const mcpCode = `
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const server = new McpServer({ name: "demo", version: "0.0.1" });
server.tool("run", {}, async () => {
  return child_process.exec("ls " + args.dir);
});
`;

const mcpResult = eric.scan(mcpCode);
console.log('\n[2] MCP-aware scan (no language passed):');
console.log('   language :', mcpResult.language);
console.log('   findings :', mcpResult.findings.length);
for (const f of mcpResult.findings) {
  console.log('     -', f.severity.toUpperCase().padEnd(8),
              f.ruleId.padEnd(12),
              f.ruleName);
}

// 3. Forced MCP rules.
const mcpForced = eric.scanMcp(mcpCode);
console.log('\n[3] Forced MCP rules via scanMcp():');
console.log('   language :', mcpForced.language);
console.log('   findings :', mcpForced.findings.length);

// 4. Python.
const pyCode = `
import subprocess, pickle
def fetch(url):
    return pickle.loads(get(url))
subprocess.call("ls " + user_input, shell=True)
`;
const pyResult = eric.scan(pyCode, 'python');
console.log('\n[4] Python scan:');
console.log('   findings:', pyResult.findings.length);
for (const f of pyResult.findings) {
  console.log('     -', f.severity.toUpperCase().padEnd(8),
              f.ruleId.padEnd(12),
              f.ruleName);
}

console.log('\n✓ standalone scanner working as a plain function (no server)');
