import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Loader2,
  Zap,
  Download,
  RefreshCw,
  FileCode,
  Lock,
  Database,
  Globe,
  UserX,
  FileText,
  Layout,
  Settings,
  Package,
  Code2,
  Sparkles,
  Search,
  Play,
  ChevronDown,
  Copy,
  Check,
  Hash,
  Terminal,
  Eye,
  Activity,
  Cpu,
  Clock,
  ArrowRight,
  BookOpen,
  Layers,
  Wand2,
  Send,
  FileBarChart,
  Lightbulb,
  Upload,
  Table2,
  Keyboard,
  Command,
  Maximize2,
  Minimize2,
  X,
  Gauge,
  Grid3x3,
  ScrollText,
  PanelRightClose,
  PanelRightOpen,
  Radio,
  CircleDot,
  GitCompare,
  ShieldQuestion,
  Radar,
  Target,
  TrendingUp,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useToast } from '../components/Toast';
import { useApp } from '../context/AppContext';
import { dashboardAPI } from '../services/api';
import { readUserScoped, writeUserScoped } from '../utils/userStorage';
import AiFixPanel from '../components/AiFixPanel';
import PageTip from '../components/PageTip';
import EmptyState from '../components/EmptyState';
import ReportReadyModal from '../components/ReportReadyModal';
import { buildScanReportPdf } from '../services/pdfReport';
import { buildScanReportCsv } from '../services/csvReport';
import { runDetectors } from '../utils/owaspDetectors';
import { detectCodeLanguage } from '../utils/fileLanguage';
import { readSourceFileFromEvent, SOURCE_FILE_ACCEPT } from '../utils/sourceUpload';
import { highlight, highlightLanguage } from '../utils/syntaxHighlight';
import { CODE_LANGUAGES, SQL_DIALECTS, scannerLanguageLabel } from '../utils/scannerLanguages';
import { CategoryCard, statusStyle } from '../components/security/ScannerWidgets';
import {
  ComparisonStrip,
  ConfidenceBar,
  DetectorGrid,
  FindingsFilter,
  KeyboardMap,
  RunHistoryStrip,
  ScanStatusBar,
  ScoreGauge,
  SeverityHistogram,
  TriageGuide,
} from '../components/security/ScannerProWidgets';

// ---------------------------------------------------------------------------
// OWASPScanner — Project Eric
// ---------------------------------------------------------------------------
//
// A dedicated OWASP Top 10 (2026) scanner, laid out as an IDE-style
// security workbench.
//
//   • Code mode — paste a snippet in any of 11 languages (JS / TS /
//                  Python / Java / Go / PHP / C# / Rust / Ruby / C++ /
//                  generic) and run all 10 category detectors against it.
//
//   • SQL mode  — paste one or more queries (MySQL / PostgreSQL /
//                  SQLite / T-SQL / generic) for a deep dive on injection
//                  risks, missing parameterisation and unsafe dynamic SQL.
//
// Detectors run in the browser. The scanner is dependency-free, so it
// works offline and never uploads the source.
//
// The layout is a three-column instrument panel:
//
//   ┌─────────────┬──────────────────────────┬────────────────┐
//   │ Instrument  │ Source editor             │ Findings       │
//   │ rail        │ + status bar              │ + score        │
//   │ (score,     │                          │ + triage       │
//   │  detectors) │                          │                │
//   └─────────────┴──────────────────────────┴────────────────┘
// ---------------------------------------------------------------------------

const SAMPLE_CODE = `// Sample vulnerable endpoint — paste your own code to scan
app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  db.query(query, (err, rows) => {
    res.json(rows);
  });
});

const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
const md5 = require('md5');
const hashed = md5(password);

function run(cmd) {
  return exec(cmd, { shell: true });
}
`;

const SAMPLE_SQL = `-- Sample queries — paste your own to scan
SELECT * FROM users WHERE id = '" + userId + "';
UPDATE accounts SET balance = balance - " + amount + " WHERE id = " + userId;
SELECT * FROM orders WHERE name LIKE '%" + search + "%';
`;

const LANG_SAMPLES = {
  javascript: `// Node / Express — paste your own to scan
app.get('/user/:id', (req, res) => {
  const id = req.params.id;
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  db.query(query, (err, rows) => {
    res.json(rows);
  });
});

const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
const md5 = require('md5');
const hashed = md5(password);

function run(cmd) {
  return exec(cmd, { shell: true });
}
`,
  typescript: `import express from 'express';
import { exec } from 'child_process';
import crypto from 'crypto';

const app = express();

app.get('/user/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const query = \`SELECT * FROM users WHERE id = '\${id}'\`;
  db.query(query, (err: any, rows: any[]) => {
    res.json(rows);
  });
});

const apiKey: string = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
const hashed = md5(password);

function run(cmd: string) {
  return exec(cmd, { shell: true });
}
`,
  python: `# Flask / Django — paste your own to scan
from flask import Flask, request
import subprocess

app = Flask(__name__)

@app.route('/user/<uid>')
def get_user(uid):
    query = "SELECT * FROM users WHERE id = '" + uid + "'"
    cursor.execute(query)
    return {"data": cursor.fetchall()}

API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY"
password_hash = md5(password)

def run(cmd):
    subprocess.call(cmd, shell=True)
`,
  java: `// Spring Boot — paste your own to scan
@RestController
public class UserController {
    @GetMapping("/user/{id}")
    public List<User> getUser(@PathVariable String id) {
        String query = "SELECT * FROM users WHERE id = '" + id + "'";
        return jdbcTemplate.query(query);
    }
}
`,
  go: `// net/http — paste your own to scan
func getUser(w http.ResponseWriter, r *http.Request) {
    id := r.URL.Query().Get("id")
    query := "SELECT * FROM users WHERE id = '" + id + "'"
    db.Query(query)
}

const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY"
hashed := md5.Sum([]byte(password))

func run(cmd string) {
    exec.Command("sh", "-c", cmd).Run()
}
`,
  php: `<?php
// Laravel / PHP — paste your own to scan
public function getUser($id) {
    $query = "SELECT * FROM users WHERE id = '" . $id . "'";
    return DB::select($query);
}

$apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
$hashed = md5($password);

function run($cmd) {
    shell_exec($cmd);
}
`,
  csharp: `// ASP.NET — paste your own to scan
public IActionResult GetUser(string id)
{
    var query = "SELECT * FROM users WHERE id = '" + id + "'";
    return Ok(_context.Database.SqlQueryRaw(query).ToList());
}

const string apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
var hashed = MD5.Create().ComputeHash(passwordBytes);

public void Run(string cmd) {
    Process.Start("cmd.exe", "/c " + cmd);
}
`,
  rust: `// Actix / Axum — paste your own to scan
async fn get_user(id: String) {
    let query = format!("SELECT * FROM users WHERE id = '{}'", id);
    sqlx::query(&query).execute(&pool).await;
}

const API_KEY: &str = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

fn run(cmd: &str) {
    std::process::Command::new("sh").arg("-c").arg(cmd).spawn();
}
`,
  ruby: `# Rails — paste your own to scan
def get_user
  id = params[:id]
  query = "SELECT * FROM users WHERE id = '\#{id}'"
  ActiveRecord::Base.connection.execute(query)
end

API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY"
hashed = Digest::MD5.hexdigest(password)

def run(cmd)
  system(cmd)
end
`,
  cpp: `// paste your own to scan
std::string getUser(const std::string& id) {
    std::string query = "SELECT * FROM users WHERE id = '" + id + "'";
    return db.query(query);
}

const char* API_KEY = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";

void run(const std::string& cmd) {
    system(cmd.c_str());
}
`,
  other: `// Generic snippet — paste your own to scan
function getUser(id) {
  const query = "SELECT * FROM users WHERE id = '" + id + "'";
  return db.query(query);
}

const apiKey = "sk_live_REPLACE_WITH_YOUR_OWN_KEY";
const hashed = md5(password);
`,
};

const getSampleCode = (mode, language, dialect) => {
  if (mode === 'sql') {
    if (dialect === 'postgresql') {
      return `-- PostgreSQL — paste your own queries
SELECT * FROM users WHERE id = '${userId}';
UPDATE accounts SET balance = balance - ${amount} WHERE id = ${userId};
`;
    }
    return SAMPLE_SQL;
  }
  return LANG_SAMPLES[language] || SAMPLE_CODE;
};

// ---------------------------------------------------------------------------
// Background — a quieter version of the old one, so the workbench reads
// as the focus.
// ---------------------------------------------------------------------------
const ScannerBackground = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
    <div
      className="absolute w-[600px] h-[600px] rounded-full opacity-40 blur-3xl animate-orb-1"
      style={{
        background: 'radial-gradient(circle, rgba(16,185,129,0.5) 0%, rgba(16,185,129,0) 70%)',
        top: '-220px',
        left: '-140px',
      }}
    />
    <div
      className="absolute w-[520px] h-[520px] rounded-full opacity-35 blur-3xl animate-orb-2"
      style={{
        background: 'radial-gradient(circle, rgba(59,130,246,0.5) 0%, rgba(59,130,246,0) 70%)',
        bottom: '-180px',
        right: '-160px',
      }}
    />
    <div
      className="absolute w-[420px] h-[420px] rounded-full opacity-25 blur-3xl animate-orb-3"
      style={{
        background: 'radial-gradient(circle, rgba(139,92,246,0.5) 0%, rgba(139,92,246,0) 70%)',
        top: '45%',
        left: '38%',
      }}
    />
    <div
      className="absolute inset-0 opacity-[0.12]"
      style={{
        backgroundImage:
          'linear-gradient(rgba(59,130,246,0.3) 1px, transparent 1px),' +
          'linear-gradient(90deg, rgba(59,130,246,0.3) 1px, transparent 1px)',
        backgroundSize: '48px 48px',
        maskImage:
          'radial-gradient(ellipse 85% 60% at 50% 35%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
        WebkitMaskImage:
          'radial-gradient(ellipse 85% 60% at 50% 35%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.3) 60%, transparent 100%)',
      }}
    />
  </div>
);

// ---------------------------------------------------------------------------
// Mode picker — Code or SQL.
// ---------------------------------------------------------------------------
const ModePicker = ({ mode, onChange }) => (
  <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
    {[
      { id: 'code', label: 'Code', Icon: Code2 },
      { id: 'sql', label: 'SQL', Icon: Database },
    ].map((m) => {
      const active = mode === m.id;
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          aria-pressed={active}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
            active
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          }`}
        >
          <m.Icon className="w-3.5 h-3.5" />
          {m.label}
        </button>
      );
    })}
  </div>
);

// ---------------------------------------------------------------------------
// Instrument panel header — one consistent shell for the left rail.
// ---------------------------------------------------------------------------
const Instrument = ({ icon: Icon, title, subtitle, children, action, className = '' }) => (
  <section className={`minimal-card overflow-hidden ${className}`}>
    <header className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-center gap-2 min-w-0">
        {Icon && (
          <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-500 dark:text-slate-400">
            <Icon className="w-3.5 h-3.5" />
          </span>
        )}
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight truncate">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
          )}
        </div>
      </div>
      {action}
    </header>
    <div className="p-3.5">{children}</div>
  </section>
);

// ---------------------------------------------------------------------------
// The scanner
// ---------------------------------------------------------------------------
const OWASPScanner = () => {
  const { showToast, lastScanResult, setLastScanResult, markScanUnpersisted, clearUnpersistedScan } =
    useApp();
  const [mode, setMode] = useState('code');
  const [language, setLanguage] = useState('javascript');
  const [dialect, setDialect] = useState('generic');
  const [code, setCode] = useState(() => getSampleCode('code', 'javascript', 'generic'));
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [filter, setFilter] = useState('all');
  const [recentScans, setRecentScans] = useState([]);

  // Layout state ------------------------------------------------------
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showDetectorGrid, setShowDetectorGrid] = useState(true);
  const [railOpen, setRailOpen] = useState(true);

  // File upload --------------------------------------------------------
  const [uploadedFile, setUploadedFile] = useState(null);
  const fileInputRef = useRef(null);

  // PDF report ---------------------------------------------------------
  const [report, setReport] = useState(null);
  const [isBuildingReport, setIsBuildingReport] = useState(false);

  // Editor refs --------------------------------------------------------
  const editorBgRef = useRef(null);

  // Persistence ------------------------------------------------------
  useEffect(() => {
    try {
      const saved = readUserScoped('owasp_scanner_history', null);
      if (Array.isArray(saved)) setRecentScans(saved.slice(0, 8));
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    // Only a finished scan belongs in the history.
    //
    // The scanner publishes a partial result after every detector, so the
    // result object changes several times during a single run. Keying the
    // history on the score therefore wrote one row per detector — eight
    // rows for one scan, each with a different score. `scannedAt` is only
    // set on the final result, so it identifies exactly one completed run.
    if (!results || results.running || !results.scannedAt) return;
    const entry = {
      id: `${Date.now()}`,
      mode: results.mode,
      language: results.languageLabel || results.language,
      score: results.score,
      summary: results.summary,
      issues: results.totalIssues,
      when: results.scannedAt,
    };
    setRecentScans((prev) => {
      const next = [entry, ...prev].slice(0, 8);
      try {
        writeUserScoped('owasp_scanner_history', next);
      } catch {
        /* noop */
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results?.scannedAt]);

  // Reset sample when mode flips -------------------------------------
  //
  // An uploaded file is never replaced by a sample: the user picked that
  // file deliberately, and switching the language or the SQL dialect
  // should re-scan the same content, not swap it for the demo snippet.
  //
  // The same goes for pasted code. The auto-detection changes the
  // language as the user types, and this effect must not answer that by
  // replacing their code with the sample. The editor is only re-seeded
  // while it still holds the previous sample — once the user has typed
  // or pasted anything, their content stays.
  const sampleSeedRef = useRef(code);

  useEffect(() => {
    if (results || uploadedFile) return;
    if (code !== sampleSeedRef.current) return;

    const next = getSampleCode(mode, language, dialect);
    sampleSeedRef.current = next;
    setCode(next);
  }, [mode, language, dialect, results, uploadedFile, code]);

  // Derived ----------------------------------------------------------
  const filteredFindings = useMemo(() => {
    if (!results) return [];
    if (filter === 'all') return results.findings;
    return results.findings.filter((f) => f.status === filter);
  }, [results, filter]);

  const summary = useMemo(() => {
    if (!results) return { pass: 0, warn: 0, fail: 0 };
    return {
      pass: results.findings.filter((f) => f.status === 'pass').length,
      warn: results.findings.filter((f) => f.status === 'warning').length,
      fail: results.findings.filter((f) => f.status === 'fail').length,
    };
  }, [results]);

  // The per-severity split of the issues this scan raised.
  const severityCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 };
    if (!results) return counts;
    results.findings.forEach((f) => {
      if (f.status === 'pass') return;
      const key = String(f.severity || 'low').toLowerCase();
      if (key in counts) counts[key] += f.count || 1;
    });
    return counts;
  }, [results]);

  const lineCount = useMemo(() => code.split('\n').length, [code]);
  const charCount = useMemo(() => code.length, [code]);

  // The previous run, so the comparison strip has something to compare
  // against. The history is the only record of earlier runs.
  const previousRun = useMemo(() => {
    if (!results?.scannedAt || recentScans.length === 0) return null;
    const prior = recentScans.find((s) => s.when !== results.scannedAt);
    if (!prior) return null;
    return { score: prior.score, totalIssues: prior.issues };
  }, [results?.scannedAt, recentScans]);

  const highlightedHTML = useMemo(
    () => highlight(code, highlightLanguage(language, mode, dialect)),
    [code, language, mode, dialect]
  );

  const languageLabel = scannerLanguageLabel(mode, language, dialect);

  const syncEditorScroll = useCallback((e) => {
    const bg = editorBgRef.current;
    if (!bg) return;
    bg.scrollTop = e.target.scrollTop;
    bg.scrollLeft = e.target.scrollLeft;
  }, []);

  // Scan -------------------------------------------------------------
  const scanAbortRef = useRef(false);

  const runScan = useCallback(async () => {
    if (!code.trim()) {
      showToast('Paste some code or SQL first.', 'warning');
      return;
    }
    if (isRunning) return;
    setIsRunning(true);
    setProgress(0);
    setResults(null);
    scanAbortRef.current = false;

    const start = performance.now();
    try {
      const findings = await runDetectors(code, mode, mode === 'sql' ? dialect : language, ({ done, total, latest }) => {
        if (scanAbortRef.current) return;
        setProgress(Math.round((done / total) * 100));
        setResults((prev) => {
          const acc = prev?.findings ? [...prev.findings] : [];
          acc.push(latest);
          const totalIssues = acc.reduce((a, f) => a + (f.count || 0), 0);
          const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));
          const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
          return {
            score,
            summary,
            scanTime: ((performance.now() - start) / 1000).toFixed(1) + 's',
            findings: acc,
            totalIssues,
            running: true,
            mode,
            language: mode === 'sql' ? dialect : language,
            languageLabel,
          };
        });
      });

      if (scanAbortRef.current) {
        setIsRunning(false);
        return;
      }

      const totalIssues = findings.reduce((a, f) => a + (f.count || 0), 0);
      const score = Math.max(0, Math.min(100, 100 - totalIssues * 4));
      const summary = score >= 85 ? 'Low Risk' : score >= 65 ? 'Medium Risk' : 'High Risk';
      setProgress(100);
      const finalResult = {
        score,
        summary,
        scanTime: ((performance.now() - start) / 1000).toFixed(1) + 's',
        findings,
        totalIssues,
        running: false,
        mode,
        language: mode === 'sql' ? dialect : language,
        languageLabel,
        // Saved inputs so the destination pages can show what was scanned
        // and let the user re-run the scan from there.
        snippetPreview: code.split('\n').slice(0, 6).join('\n'),
        lineCount: code.split('\n').length,
        scannedAt: new Date().toISOString(),
      };
      setResults(finalResult);
      // Share with the rest of the app so the Analysis / Threats /
      // Reports pages can show this result without a re-scan.
      setLastScanResult(finalResult);
      showToast(`OWASP scan complete · score ${score}/100`, 'success');

      // Persist the scan to the XAMPP/MySQL backend so the dashboard and
      // the data pages read the same stored state. A failure here must not
      // lose the local result — the user still sees their findings.
      //
      // Only finding metadata is sent — never the source code. The evidence
      // snippets stay in the browser so the "your code never leaves the
      // device" promise on this page stays true.
      const persistedFindings = findings.map((f) => ({
        id: f.id,
        name: f.name,
        status: f.status,
        count: f.count,
        severity: f.severity,
        description: f.description,
        cwe: f.cwe,
        remediation: f.remediation,
        evidence: Array.isArray(f.evidence) ? f.evidence.map((e) => ({ line: e.line })) : [],
      }));

      try {
        await dashboardAPI.saveScan({
          projectName: `Scan · ${languageLabel}`,
          language: languageLabel,
          framework: 'OWASP Scanner',
          scanType: 'full',
          mode,
          score,
          summary,
          lineCount: finalResult.lineCount,
          findings: persistedFindings,
        });
        // Tell the dashboard (and anything else listening) that the stored
        // numbers changed. The backend holds this scan now, so it no longer
        // counts as a local-only scan.
        clearUnpersistedScan(finalResult);
        window.dispatchEvent(new CustomEvent('project-eric:scan-persisted'));
      } catch (persistError) {
        // The backend is up but refused the write. The scan is real work the
        // user did, so keep it in the local list and let the dashboard add
        // it on top of the stored figures instead of silently dropping it.
        markScanUnpersisted(finalResult);
        window.dispatchEvent(new CustomEvent('project-eric:scan-not-persisted', { detail: finalResult }));
        showToast(
          `Scan saved locally, but the backend rejected the save: ${persistError?.message || 'unknown error'}`,
          'warning'
        );
      }
    } catch (e) {
      showToast(`Scan failed: ${e?.message || String(e)}`, 'error');
    } finally {
      setIsRunning(false);
    }
  }, [code, mode, language, dialect, isRunning, showToast, markScanUnpersisted, clearUnpersistedScan, setLastScanResult, languageLabel]);

  const cancelScan = () => {
    scanAbortRef.current = true;
    setIsRunning(false);
  };

  const handleReset = () => {
    setResults(null);
    setProgress(0);
    setExpanded(null);
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    const next = getSampleCode(mode, language, dialect);
    sampleSeedRef.current = next;
    setCode(next);
    showToast('Scanner reset', 'info');
  };

  const handleExport = useCallback(() => {
    if (!results) return;
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `owasp-${mode}-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('OWASP report exported', 'success');
  }, [results, mode, showToast]);

  // ---- Download the CSV summary -----------------------------------------
  const handleExportCsv = useCallback(() => {
    if (!results) return;

    try {
      const sourceName = uploadedFile?.name || 'pasted-snippet';
      const built = buildScanReportCsv({
        fileName: sourceName,
        languageLabel,
        mode,
        results,
      });

      const blob = new Blob([built.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = built.fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // The object URL is released on the next tick so the download has
      // started before it is revoked.
      setTimeout(() => URL.revokeObject(url), 1000);

      showToast('CSV summary downloaded', 'success');
    } catch (error) {
      showToast(`Could not build the CSV: ${error?.message || String(error)}`, 'error');
    }
  }, [results, mode, languageLabel, uploadedFile, showToast]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      showToast('Snippet copied to clipboard', 'success');
    } catch {
      showToast('Copy failed — your browser may have blocked clipboard access.', 'warning');
    }
  };

  const handleClear = () => {
    // The editor is emptied on purpose, so the sample seed is cleared
    // too — otherwise the "reset the sample" effect would put the
    // sample straight back.
    sampleSeedRef.current = '';
    setCode('');
    setResults(null);
    setUploadedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ---- Upload a source file -------------------------------------------
  const handleFileUpload = useCallback(async (event) => {
    const result = await readSourceFileFromEvent(event);
    if (!result) return;

    if (!result.ok) {
      showToast(result.error, 'warning');
      return;
    }

    const detected = result.detection;

    // The uploaded file is now the editor's content, so the sample seed
    // is cleared. If the user removes the file chip later, the effect
    // below must not treat the file as "still the sample" and swap it out
    // for the demo snippet.
    sampleSeedRef.current = '';

    setUploadedFile({ name: result.fileName, size: result.size });
    setCode(result.code);
    setMode(detected.mode);
    setDialect(detected.dialect);
    if (detected.mode === 'code') setLanguage(detected.language);
    setResults(null);
    setExpanded(null);

    showToast(`Loaded ${result.fileName} — ${detected.label} detected`, 'success');
  }, [showToast]);

  // ---- Auto-detect the language of pasted / edited code ---------------
  //
  // The user should not have to pick a language by hand. When the content
  // changes and the scanner is in code mode, the language is worked out
  // from the content itself.
  //
  // Two guards keep this from fighting the user:
  //
  //   • The detection only runs once there is enough text to be
  //     conclusive. A single word is not a language.
  //
  //   • The user can still override it by clicking a language chip. The
  //     override is remembered, and the auto-detection stands down until
  //     the user picks a language again.
  const languageOverriddenRef = useRef(false);

  useEffect(() => {
    languageOverriddenRef.current = false;
  }, [uploadedFile?.name]);

  const handleCodeChange = useCallback((value) => {
    setCode(value);

    if (languageOverriddenRef.current) return;
    if (mode !== 'code') return;

    // Too short to identify. The scanner is happy with a partial
    // snippet, so the language is left alone until there is more.
    const trimmed = value.trim();
    if (trimmed.length < 12) return;

    const detected = detectCodeLanguage(value);
    // A fallback means "no idea" — keep whatever was already selected
    // rather than resetting to "Other".
    if (detected.confidence !== 'content') return;

    setLanguage(detected.language);
  }, [mode]);

  const handleLanguageSelect = useCallback((id) => {
    languageOverriddenRef.current = true;
    setLanguage(id);

    const holdsSample = code === sampleSeedRef.current;
    if (holdsSample && !uploadedFile && !results) {
      const next = getSampleCode('code', id, 'generic');
      sampleSeedRef.current = next;
      setCode(next);
    }
  }, [code, uploadedFile, results]);

  const handleDialectSelect = useCallback((id) => {
    setDialect(id);
  }, []);

  // ---- Paste detection --------------------------------------------------
  //
  // `onPaste` fires before the textarea's `onChange`, so the pasted text
  // is read here and used to pick the language. The `onChange` handler
  // above then keeps the same value, so nothing is duplicated.
  const handlePaste = useCallback((event) => {
    if (languageOverriddenRef.current) return;
    if (mode !== 'code') return;

    const pasted = event.clipboardData?.getData('text') || '';
    if (pasted.trim().length < 12) return;

    const detected = detectCodeLanguage(pasted);
    if (detected.confidence !== 'content') return;

    if (detected.mode === 'sql') {
      setMode('sql');
      setDialect(detected.dialect);
    } else {
      setMode('code');
      setLanguage(detected.language);
    }
  }, [mode]);

  // ---- Generate the PDF report ----------------------------------------
  const handleGenerateReport = useCallback(async () => {
    if (!results || isBuildingReport) return;

    setIsBuildingReport(true);
    try {
      const sourceName = uploadedFile?.name || 'pasted-snippet';

      const built = buildScanReportPdf({
        fileName: sourceName,
        languageLabel,
        mode,
        code,
        results,
        ttlHours: 24,
      });

      setReport({
        blob: built.blob,
        fileName: built.fileName,
        meta: {
          fileName: sourceName,
          languageLabel,
          score: results.score,
          summary: results.summary,
          totalIssues: results.totalIssues,
          scanTime: results.scanTime,
          scannedAt: results.scannedAt,
        },
      });
    } catch (error) {
      showToast(`Could not generate the report: ${error?.message || String(error)}`, 'error');
    } finally {
      setIsBuildingReport(false);
    }
  }, [results, code, mode, languageLabel, uploadedFile, isBuildingReport, showToast]);

  // ---- Keyboard shortcuts ----------------------------------------------
  //
  // ⌘Enter runs the scan, ⌘E exports the JSON, ⌘⇧E the CSV, ⌘P builds
  // the PDF, ⌘U opens the file picker, ⌘/ shows this sheet. The handler
  // stands down while a text field has focus, so typing in the editor is
  // safe.
  useEffect(() => {
    const handleKeyDown = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      const key = e.key.toLowerCase();

      if (key === 'enter') {
        e.preventDefault();
        if (!isRunning) runScan();
        return;
      }
      if (key === 'e') {
        e.preventDefault();
        if (e.shiftKey) handleExportCsv();
        else handleExport();
        return;
      }
      if (key === 'p') {
        e.preventDefault();
        handleGenerateReport();
        return;
      }
      if (key === 'u') {
        e.preventDefault();
        fileInputRef.current?.click();
        return;
      }
      if (key === '/') {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runScan, handleExport, handleExportCsv, handleGenerateReport, isRunning]);

  // The filter counts, for the segmented control.
  const filterCounts = useMemo(
    () => ({
      all: results?.findings.length ?? 0,
      fail: summary.fail,
      warning: summary.warn,
      pass: summary.pass,
    }),
    [results, summary]
  );

  // ---- Render -----------------------------------------------------------
  return (
    <div className="relative min-h-[calc(100vh-56px)] p-4 lg:p-5">
      <ScannerBackground />

      <div className="relative z-10 max-w-[1900px] mx-auto">
        <PageTip
          pageId="owasp-scanner"
          variant="info"
          title="Scan code or SQL for OWASP Top 10 risks"
          body="Pick a mode — Code or SQL — paste a snippet, then run the scan. All ten OWASP 2026 categories are checked; the left rail shows every detector, the right panel shows the findings with evidence, CWE and remediation."
        />

        {/* ==========================================================
            COMMAND BAR — the top of the workbench
            ========================================================== */}
        <div className="minimal-card overflow-hidden mb-4 animate-page-enter">
          <div className="flex flex-col xl:flex-row xl:items-center gap-3 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 flex-shrink-0">
                <ShieldCheck className="w-5 h-5 text-white" />
              </span>
              <div className="min-w-0">
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight tracking-tight">
                  OWASP Security Scanner
                </h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Static analysis against the OWASP Top 10 (2026) — nothing executes, everything runs locally.
                </p>
              </div>
            </div>

            <div className="xl:ml-auto flex items-center gap-2 flex-wrap">
              <ModePicker mode={mode} onChange={setMode} />

              <button
                type="button"
                onClick={runScan}
                disabled={isRunning}
                title="Run the scan (⌘↵)"
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isRunning
                    ? 'bg-amber-500 text-white'
                    : 'bg-gradient-to-r from-emerald-500 to-blue-500 text-white hover:shadow-emerald-500/30 hover:-translate-y-0.5'
                }`}
              >
                {isRunning ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Scanning… {progress}%
                  </>
                ) : (
                  <>
                    <Zap className="w-3.5 h-3.5" />
                    Run OWASP Scan
                  </>
                )}
              </button>

              {isRunning ? (
                <button
                  type="button"
                  onClick={cancelScan}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleReset}
                  title="Reset the editor and the results"
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}

              {results && !isRunning && (
                <>
                  <button
                    type="button"
                    onClick={handleExport}
                    title="Export the results as JSON (⌘E)"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    JSON
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    title="Download a spreadsheet of the findings (⌘⇧E)"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    <Table2 className="w-3.5 h-3.5" />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerateReport}
                    disabled={isBuildingReport}
                    title="Generate the PDF report (⌘P)"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                  >
                    {isBuildingReport ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <FileBarChart className="w-3.5 h-3.5" />
                    )}
                    {isBuildingReport ? 'Building…' : 'PDF report'}
                  </button>
                </>
              )}

              {/* Layout toggles */}
              <div className="inline-flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => setRailOpen((r) => !r)}
                  title={railOpen ? 'Hide the instrument rail' : 'Show the instrument rail'}
                  aria-label={railOpen ? 'Hide the instrument rail' : 'Show the instrument rail'}
                  aria-pressed={!railOpen}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    railOpen
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Grid3x3 className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setPanelCollapsed((c) => !c)}
                  title={panelCollapsed ? 'Show the results panel' : 'Hide the results panel'}
                  aria-label={panelCollapsed ? 'Show the results panel' : 'Hide the results panel'}
                  aria-pressed={panelCollapsed}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    panelCollapsed
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {panelCollapsed ? <PanelRightOpen className="w-4 h-4" /> : <PanelRightClose className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setFocusMode((f) => !f)}
                  title={focusMode ? 'Leave focus mode' : 'Focus mode — hide the page chrome'}
                  aria-label={focusMode ? 'Leave focus mode' : 'Enter focus mode'}
                  aria-pressed={focusMode}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    focusMode
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  {focusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setShowShortcuts((s) => !s)}
                  title="Keyboard shortcuts (⌘/)"
                  aria-label="Toggle the keyboard shortcuts"
                  aria-pressed={showShortcuts}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                    showShortcuts
                      ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
                  }`}
                >
                  <Keyboard className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* The status bar — one row that always says what is loaded. */}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
            <ScanStatusBar
              mode={mode}
              languageLabel={languageLabel}
              lines={lineCount}
              chars={charCount}
              running={isRunning}
              progress={progress}
              score={results?.score ?? null}
              summary={results?.summary ?? null}
              pass={summary.pass}
              warn={summary.warn}
              fail={summary.fail}
            />
          </div>
        </div>

        {/* ==========================================================
            THE WORKBENCH — rail | editor | findings
            ========================================================== */}
        <div
          className={`grid grid-cols-1 gap-4 ${
            panelCollapsed
              ? railOpen
                ? 'xl:grid-cols-[280px_minmax(0,1fr)]'
                : 'xl:grid-cols-1'
              : railOpen
              ? 'xl:grid-cols-[280px_minmax(0,1.15fr)_minmax(0,1fr)]'
              : 'xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]'
          }`}
        >
          {/* ---------- LEFT RAIL — the instrument panel ----------- */}
          {railOpen && (
            <div className="space-y-4">
              <Instrument
                icon={Gauge}
                title="Secure score"
                subtitle={results ? results.summary : 'Awaiting a scan'}
              >
                <div className="flex justify-center py-1">
                  <ScoreGauge
                    score={results?.score ?? 0}
                    summary={results?.summary}
                    findings={results?.totalIssues ?? 0}
                    size={160}
                  />
                </div>
              </Instrument>

              <Instrument
                icon={Radar}
                title="Detectors"
                subtitle="All ten OWASP categories"
                action={
                  <button
                    type="button"
                    onClick={() => setShowDetectorGrid((g) => !g)}
                    className="text-[10px] font-semibold text-slate-500 hover:text-blue-600 transition-colors"
                  >
                    {showDetectorGrid ? 'Hide' : 'Show'}
                  </button>
                }
              >
                {showDetectorGrid ? (
                  <DetectorGrid
                    findings={results?.findings || []}
                    running={isRunning}
                    activeId={expanded}
                    onSelect={(id) => {
                      setFilter('all');
                      setExpanded((prev) => (prev === id ? null : id));
                    }}
                  />
                ) : (
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center py-6">
                    The detector list is hidden.
                  </p>
                )}
              </Instrument>

              <Instrument icon={Activity} title="Severity split" subtitle="What the scan raised">
                <SeverityHistogram
                  counts={severityCounts}
                  total={results?.totalIssues ?? 0}
                />
              </Instrument>

              {recentScans.length > 0 && (
                <Instrument icon={Clock} title="Run history" subtitle={`${recentScans.length} recorded`}>
                  <RunHistoryStrip runs={recentScans} />
                </Instrument>
              )}

              {showShortcuts && (
                <Instrument icon={Keyboard} title="Keyboard map" subtitle="Everything is reachable">
                  <KeyboardMap
                    shortcuts={[
                      { keys: ['⌘', '↵'], label: 'Run the scan' },
                      { keys: ['⌘', 'E'], label: 'Export JSON' },
                      { keys: ['⌘', '⇧', 'E'], label: 'Export CSV' },
                      { keys: ['⌘', 'P'], label: 'Build the PDF report' },
                      { keys: ['⌘', 'U'], label: 'Upload a source file' },
                      { keys: ['⌘', '/'], label: 'Toggle this sheet' },
                    ]}
                  />
                </Instrument>
              )}
            </div>
          )}

          {/* ---------- CENTRE — the source editor ------------------ */}
          <div className="space-y-4 min-w-0">
            <div className="minimal-card overflow-hidden">
              {/* Panel header — file actions live next to the title. */}
              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  </span>
                  <FileCode className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {mode === 'sql' ? 'SQL queries' : 'Source code'}
                  </h3>
                  <span className="font-mono text-[10px] text-slate-400 truncate hidden md:inline">
                    {mode === 'sql'
                      ? `${dialect === 'generic' ? 'query' : dialect}.sql`
                      : `${language === 'other' ? 'snippet' : language}.${
                          CODE_LANGUAGES.find((l) => l.id === language)?.ext || 'txt'
                        }`}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {uploadedFile && (
                    <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200/70 dark:border-blue-500/30 text-[10px] font-semibold text-blue-700 dark:text-blue-300 max-w-[160px]">
                      <FileCode className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{uploadedFile.name}</span>
                      <button
                        type="button"
                        onClick={handleClear}
                        aria-label="Remove the uploaded file"
                        className="text-blue-400 hover:text-blue-700 dark:hover:text-blue-200 transition-colors flex-shrink-0"
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </span>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    aria-label="Upload a source code file"
                    accept={SOURCE_FILE_ACCEPT}
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload a source file (⌘U)"
                    className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleCopy}
                    disabled={!code}
                    title="Copy the snippet to your clipboard"
                    aria-label="Copy the snippet"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleClear}
                    disabled={!code}
                    title="Clear the editor"
                    aria-label="Clear the editor"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Language / dialect chips */}
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 mb-2">
                  <Cpu className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-[10px] uppercase tracking-wider font-bold text-slate-500">
                    {mode === 'code' ? 'Language' : 'SQL dialect'}
                  </span>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">
                    Detected automatically — click to override
                  </span>
                </div>
                {mode === 'code' ? (
                  <div className="flex flex-wrap gap-1.5">
                    {CODE_LANGUAGES.map((l) => {
                      const active = language === l.id;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => handleLanguageSelect(l.id)}
                          title={l.hint}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                            active
                              ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-2 ring-blue-200 dark:ring-blue-500/30'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          {l.label}
                          <span className="font-mono text-[9px] font-medium opacity-60">.{l.ext}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {SQL_DIALECTS.map((d) => {
                      const active = dialect === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => handleDialectSelect(d.id)}
                          title={d.hint}
                          className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-all ${
                            active
                              ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/15 text-blue-700 dark:text-blue-300 ring-2 ring-blue-200 dark:ring-blue-500/30'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-blue-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                          }`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Editor */}
              <div className="relative bg-slate-950">
                <pre
                  ref={editorBgRef}
                  aria-hidden="true"
                  className="absolute inset-0 p-4 m-0 text-[12.5px] leading-relaxed font-mono text-slate-100 whitespace-pre-wrap break-words overflow-auto pointer-events-none rounded-none"
                  style={{ tabSize: 2 }}
                  dangerouslySetInnerHTML={{ __html: highlightedHTML + ' ' }}
                />
                <textarea
                  value={code}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  onPaste={handlePaste}
                  onScroll={syncEditorScroll}
                  spellCheck={false}
                  placeholder={mode === 'sql' ? 'Paste your SQL here (one or more queries)…' : 'Paste your code here…'}
                  className={`relative block w-full resize-y p-4 text-[12.5px] leading-relaxed font-mono bg-transparent text-transparent caret-emerald-200 placeholder:text-slate-500 focus:outline-none selection:bg-blue-500/40 ${
                    focusMode ? 'min-h-[78vh]' : 'min-h-[460px] max-h-[680px]'
                  }`}
                  style={{ tabSize: 2, WebkitTextFillColor: 'transparent' }}
                />
              </div>

              <div className="flex items-center justify-between px-3.5 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 text-[11px] text-slate-500 dark:text-slate-400 gap-3">
                <span className="flex items-center gap-1.5 min-w-0">
                  <Eye className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">Static analysis — your code never leaves the browser.</span>
                </span>
                <span className="font-mono flex-shrink-0">
                  {lineCount} lines · {charCount.toLocaleString()} chars
                </span>
              </div>
            </div>

            {/* The privacy guarantee and the OWASP scope, side by side. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="minimal-card p-4">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <Lock className="w-4 h-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Your source stays here
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Detectors run in this browser tab. Only finding metadata — category,
                      severity, CWE and line numbers — is ever saved to your workspace.
                    </p>
                  </div>
                </div>
              </div>

              <div className="minimal-card p-4">
                <div className="flex items-start gap-3">
                  <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md flex-shrink-0">
                    <Target className="w-4 h-4 text-white" />
                  </span>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                      Ten categories, one pass
                    </h4>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      Every run checks all ten OWASP 2026 categories in sequence, so a single
                      scan gives you the full picture.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ---------- RIGHT — findings ---------------------- */}
          {!panelCollapsed && (
            <div className="space-y-4 min-w-0">
              {/* The triage summary. */}
              <div className="minimal-card overflow-hidden">
                <header className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center flex-shrink-0 text-slate-500 dark:text-slate-400">
                      <Lightbulb className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                        Triage
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        What the result means
                      </p>
                    </div>
                  </div>
                  {results && (
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        results.score >= 85
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                          : results.score >= 65
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                      }`}
                    >
                      {results.summary}
                    </span>
                  )}
                </header>

                <div className="p-3.5 space-y-3">
                  <TriageGuide
                    totalIssues={results?.totalIssues ?? 0}
                    fail={summary.fail}
                    warn={summary.warn}
                  />

                  {results && !results.running && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500 mb-2 flex items-center gap-1.5">
                        <GitCompare className="w-3 h-3" /> Against the previous run
                      </p>
                      <ComparisonStrip
                        current={{ score: results.score, totalIssues: results.totalIssues }}
                        previous={previousRun}
                      />
                    </div>
                  )}

                  {results && (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 dark:text-slate-500">
                        Filter findings
                      </span>
                      <FindingsFilter value={filter} counts={filterCounts} onChange={setFilter} />
                    </div>
                  )}
                </div>
              </div>

              {/* Findings */}
              <div className="minimal-card overflow-hidden">
                <header className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0 text-emerald-600 dark:text-emerald-400">
                      <Shield className="w-3.5 h-3.5" />
                    </span>
                    <div className="min-w-0">
                      <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-tight">
                        OWASP Top 10 results
                      </h3>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {results
                          ? `${filteredFindings.length} of ${results.findings.length} shown`
                          : 'Run a scan to see findings'}
                      </p>
                    </div>
                  </div>
                </header>

                <div className="p-3.5">
                  {/* The progress bar during a scan. */}
                  {isRunning && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
                          Analyzing{' '}
                          {results?.findings?.length || 0} / 10 detectors
                          {results?.findings?.length > 0 && (
                            <>
                              {' · '}
                              <strong className="text-slate-700 dark:text-slate-200 normal-case">
                                {results.findings[results.findings.length - 1]?.name || '…'}
                              </strong>
                            </>
                          )}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                          {progress}%
                        </span>
                      </div>
                      <div className="h-1.5 bg-slate-200/70 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-emerald-500 via-blue-500 to-violet-500 rounded-full transition-all duration-200"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Nothing has been scanned yet. */}
                  {!results && !isRunning && (
                    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700/60 bg-slate-50/40 dark:bg-slate-800/30">
                      <EmptyState
                        icon={Search}
                        iconColor="from-emerald-500 to-blue-500"
                        iconBg="bg-emerald-50"
                        title="Ready to scan"
                        description={`Paste ${mode === 'sql' ? 'your SQL queries' : 'a code snippet'} on the left and press Run OWASP Scan. All ten OWASP 2026 categories are checked in sequence, and findings appear here with evidence, CWE references and remediation steps.`}
                        size="sm"
                        primaryCta={{ label: 'Run a quick scan', onClick: runScan }}
                        secondaryCta={{
                          label: 'Load sample',
                          onClick: () => {
                            const next = getSampleCode(mode, language, dialect);
                            sampleSeedRef.current = next;
                            setCode(next);
                          },
                        }}
                      />
                    </div>
                  )}

                  {/* The findings list. */}
                  {results && (
                    <div className="space-y-2.5">
                      {filteredFindings.length === 0 ? (
                        <div className="text-center py-8">
                          <ShieldCheck className="w-8 h-8 mx-auto mb-2 text-emerald-400" />
                          <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                            No findings match this filter
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            Switch back to “All” to see every category.
                          </p>
                        </div>
                      ) : (
                        filteredFindings.map((f) => (
                          <CategoryCard
                            key={f.id}
                            finding={f}
                            expanded={expanded === f.id}
                            onToggle={() => setExpanded(expanded === f.id ? null : f.id)}
                            mode={mode}
                            onToast={showToast}
                            code={code}
                            language={mode === 'sql' ? dialect : language}
                            dialect={dialect}
                            aiPanel={
                              f.status !== 'pass' ? (
                                <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                                  <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2 flex items-center gap-1.5">
                                    <Sparkles className="w-3 h-3" /> AI fix advisor
                                  </p>
                                  <AiFixPanel
                                    mode="fix"
                                    code={code}
                                    finding={f}
                                    language={mode === 'sql' ? dialect : language}
                                    dialect={dialect}
                                    scannerMode={mode}
                                    onToast={showToast}
                                    compact
                                  />
                                </div>
                              ) : null
                            }
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* The "send to" hand-off bar and the overall fix plan. */}
              {results && !results.running && (
                <>
                  <div className="minimal-card p-3.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 dark:text-blue-300 uppercase tracking-wider pr-1">
                        <Send className="w-3.5 h-3.5" />
                        Send to
                      </span>
                      <Link
                        to="/security?tab=findings"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all"
                        title="Open these findings in the Security page"
                      >
                        <FileBarChart className="w-3.5 h-3.5 text-blue-600" />
                        Findings
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </Link>
                      <Link
                        to="/security?tab=threats"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all"
                        title="Open these findings as active threats"
                      >
                        <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                        Threats
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </Link>
                      <Link
                        to="/security?tab=reports"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-700 text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-all"
                        title="Generate a report from this scan"
                      >
                        <FileText className="w-3.5 h-3.5 text-violet-600" />
                        Reports
                        <ArrowRight className="w-3 h-3 text-slate-400" />
                      </Link>
                      {lastScanResult?.scannedAt && (
                        <span className="ml-auto text-[10px] text-slate-500 dark:text-slate-400">
                          Shared to all pages
                        </span>
                      )}
                    </div>
                  </div>

                  {/* AI fix advisor — one plan for the whole scan. Gemini
                      reads every finding and returns a prioritised list of
                      what to fix first, why, and the fixed code. */}
                  {results.totalIssues > 0 && (
                    <div className="minimal-card p-3.5">
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-600 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-3.5 h-3.5 text-white" />
                        </span>
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
                            Overall fix plan
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Gemini reviews all {results.totalIssues} finding
                            {results.totalIssues === 1 ? '' : 's'} and orders them by risk.
                          </p>
                        </div>
                      </div>
                      <AiFixPanel
                        mode="plan"
                        code={code}
                        findings={results.findings}
                        language={mode === 'sql' ? dialect : language}
                        dialect={dialect}
                        scannerMode={mode}
                        onToast={showToast}
                      />
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* ==========================================================
            FOOTER — what the scanner covers
            ========================================================== */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              Icon: ShieldCheck,
              tone: 'from-emerald-500 to-teal-600',
              title: '10 OWASP categories',
              body: 'Every detector follows the OWASP Top 10 (2026). Each finding maps to a CWE identifier and ships with a concrete remediation step.',
            },
            {
              Icon: Lock,
              tone: 'from-blue-500 to-indigo-600',
              title: 'In-browser analysis',
              body: 'All analysis runs locally. Your code never leaves the device and never executes — only finding metadata is saved.',
            },
            {
              Icon: TrendingUp,
              tone: 'from-violet-500 to-purple-600',
              title: 'Deeper scans',
              body: 'Open the bundled code-server workbench for live squigglies, or jump to the full OWASP Analysis page for the AI advisor.',
            },
          ].map((c, i) => (
            <div key={c.title} className="minimal-card p-4 flex items-start gap-3">
              <span
                className={`w-9 h-9 rounded-xl bg-gradient-to-br ${c.tone} flex items-center justify-center shadow-md flex-shrink-0`}
              >
                <c.Icon className="w-4 h-4 text-white" />
              </span>
              <div className="min-w-0">
                <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">{c.title}</h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  {c.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* The PDF report popup. */}
      {report && (
        <ReportReadyModal
          report={report}
          onClose={() => setReport(null)}
        />
      )}
    </div>
  );
};

export default OWASPScanner;
