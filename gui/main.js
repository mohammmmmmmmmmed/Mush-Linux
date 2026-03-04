const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const BIN_DIR = path.join(PROJECT_ROOT, 'bin');
const DUMMY_SOURCE = path.join(PROJECT_ROOT, 'dummy_source.bin');
const HISTORY_FILE = path.join(app.getPath('userData'), 'history.json');

// ——— History Helper Functions ———
function getHistory() {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
  } catch (e) {
    console.error('getHistory error:', e);
    return [];
  }
}

function saveHistory(history) {
  try {
    const tmp = HISTORY_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(history, null, 2));
    fs.renameSync(tmp, HISTORY_FILE);
  } catch (e) {
    console.error('saveHistory error:', e);
  }
}

function addToHistory(item) {
  const history = getHistory();
  // Check if already exists (by ID) - loose check
  const idx = history.findIndex(h => String(h.id) === String(item.id));
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...item };
  } else {
    history.unshift(item);
  }
  saveHistory(history);
  return history;
}

function updateHistoryItem(id, updates) {
  console.log('Update history:', id, updates);
  const history = getHistory();
  const idx = history.findIndex(h => String(h.id) === String(id));
  if (idx >= 0) {
    history[idx] = { ...history[idx], ...updates };
    saveHistory(history);
  } else {
    console.warn('History item not found via ID:', id);
  }
  return history;
}

let mainWindow = null;
let currentProc = null;
let currentPhase = null;
const PROGRESS_RE = /\[\s*(\d+)\s*\/\s*(\d+)\]/;
const VIA_RE = /via\s+(\S+)\s+->/;

function getPhaseCommand(phase, options) {
  const out = options.outputDir.startsWith('/') ? options.outputDir : path.join(PROJECT_ROOT, options.outputDir);
  const paths = {
    interfaces: path.join(out, 'interfaces.json'),
    chunks: path.join(out, 'chunks.json'),
    integrity: path.join(out, 'integrity.json'),
    sockets: path.join(out, 'sockets.json'),
    measurements: path.join(out, 'measurements.json'),
    predictions: path.join(out, 'predictions.json'),
    schedule: path.join(out, 'schedule.json'),
    execution: path.join(out, 'execution.json'),
    chunks_dir: path.join(out, 'chunks'),
    verified: path.join(out, 'verified.json'),
    output_file: path.join(out, options.outputFilename || 'final_video.mp4'),
  };

  const get = (key, def) => (options[key] != null && options[key] !== '') ? String(options[key]).trim() : def;

  switch (phase) {
    case 1:
      return [path.join(BIN_DIR, 'mush_phase1_discovery'), '--output', paths.interfaces];
    case 2: {
      const size = get('file_size', '740927792');
      try {
        const fd = fs.openSync(DUMMY_SOURCE, 'w');
        fs.ftruncateSync(fd, parseInt(size, 10));
        fs.closeSync(fd);
      } catch (e) {
        fs.writeFileSync(DUMMY_SOURCE, Buffer.alloc(0));
        const buf = Buffer.alloc(1);
        fs.writeSync(fs.openSync(DUMMY_SOURCE, 'r+'), buf, 0, 1, parseInt(size, 10) - 1);
      }
      return [path.join(BIN_DIR, 'mush_phase2_chunker'), '--file', DUMMY_SOURCE, '--chunk-size', get('chunk_size', '262144'), '--output', paths.chunks];
    }
    case 3:
      return [path.join(BIN_DIR, 'mush_phase3_integrity'), '--chunks', paths.chunks, '--file', DUMMY_SOURCE, '--output', paths.integrity];
    case 4:
      return [path.join(BIN_DIR, 'mush_phase4_sockets'), '--interfaces', paths.interfaces, '--dest', get('dest', '34.233.56.235:443'), '--output', paths.sockets];
    case 5:
      return [path.join(BIN_DIR, 'mush_phase5_measurements'), '--sockets', paths.sockets, '--intervals', get('intervals', '5'), '--interval-ms', get('interval_ms', '1000'), '--output', paths.measurements];
    case 6:
      return [path.join(BIN_DIR, 'mush_phase6_modeler'), '--measurements', paths.measurements, '--output', paths.predictions, '--alpha', get('alpha', '0.3')];
    case 7:
      return [path.join(BIN_DIR, 'mush_phase7_scheduler'), '--predictions', paths.predictions, '--chunks', paths.chunks, '--output', paths.schedule,
        '--w-throughput', get('wt', '0.4'), '--w-latency', get('wl', '0.3'), '--w-loss', get('wp', '0.2'), '--w-stability', get('ws', '0.1')];
    case 8: {
      const url = get('url', '');
      if (!url) return null;
      return [path.join(BIN_DIR, 'mush_phase8_executor'), '--url', url, '--schedule', paths.schedule, '--chunks', paths.chunks, '--sockets', paths.sockets,
        '--concurrency', get('concurrency', '8'), '--timeout', get('timeout', '30'), '--output', paths.execution, '--output-dir', paths.chunks_dir];
    }
    case 9:
      return [path.join(BIN_DIR, 'mush_phase9_verification'), '--execution', paths.execution, '--chunks', paths.chunks, '--verified', paths.verified, '--output-file', paths.output_file];
    default:
      return null;
  }
}

function runPhase(phase, options) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const cmd = getPhaseCommand(phase, options);
    if (!cmd || !cmd[0]) {
      resolve({ code: -1, log: 'Invalid phase or missing URL.', duration: 0 });
      return;
    }
    if (!fs.existsSync(cmd[0])) {
      resolve({ code: -1, log: 'Binary not found. Build the project first.', duration: 0 });
      return;
    }
    const outDir = options.outputDir.startsWith('/') ? options.outputDir : path.join(PROJECT_ROOT, options.outputDir);
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (_) { }

    const proc = spawn(cmd[0], cmd.slice(1), { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d.toString(); });
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      const duration = (Date.now() - startTime) / 1000;
      resolve({ code: code ?? -1, log: (stdout + stderr) || '(no output)', duration });
    });
    proc.on('error', (err) => {
      const duration = (Date.now() - startTime) / 1000;
      resolve({ code: -1, log: err.message, duration });
    });
  });
}

function sendPhaseEvent(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('phase-event', payload);
  }
}

function startPhaseStream(phase, options) {
  if (currentProc) {
    return Promise.resolve({ started: false, error: 'A phase is already running.' });
  }
  const cmd = getPhaseCommand(phase, options);
  if (!cmd || !cmd[0]) {
    return Promise.resolve({ started: false, error: 'Invalid phase or missing URL.' });
  }
  if (!fs.existsSync(cmd[0])) {
    return Promise.resolve({ started: false, error: 'Binary not found. Build the project first.' });
  }
  const outDir = options.outputDir.startsWith('/') ? options.outputDir : path.join(PROJECT_ROOT, options.outputDir);
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (_) { }

  if (phase === 8) {
    const schedulePath = path.join(outDir, 'schedule.json');
    try {
      const raw = fs.readFileSync(schedulePath, 'utf8');
      const sched = JSON.parse(raw);
      const assignments = sched.chunk_assignments || [];
      const total = assignments.length;
      const perInterface = {};
      for (const a of assignments) {
        const name = a.assigned_interface_name || ('id-' + (a.assigned_interface_id ?? ''));
        perInterface[name] = (perInterface[name] || 0) + 1;
      }
      sendPhaseEvent({ type: 'phase8_totals', total, perInterface });
    } catch (_) { }
  }

  const proc = spawn(cmd[0], cmd.slice(1), { cwd: PROJECT_ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  currentProc = proc;
  currentPhase = phase;

  let buffer = '';
  function processLine(line) {
    if (phase === 8) {
      const m = line.match(PROGRESS_RE);
      if (m) {
        sendPhaseEvent({ type: 'progress', current: parseInt(m[1], 10), total: parseInt(m[2], 10) });
        const via = line.match(VIA_RE);
        if (via) sendPhaseEvent({ type: 'chunk_done', interface_name: via[1] });
      }
    }
  }

  proc.stdout.on('data', (d) => {
    const text = d.toString();
    sendPhaseEvent({ type: 'output', chunk: text });
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(processLine);
  });
  proc.stderr.on('data', (d) => {
    const text = d.toString();
    sendPhaseEvent({ type: 'output', chunk: text });
    buffer += text;
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    lines.forEach(processLine);
  });

  proc.on('close', (code, signal) => {
    currentProc = null;
    currentPhase = null;
    sendPhaseEvent({ type: 'exit', code: code ?? -1, signal: signal || null });
  });
  proc.on('error', (err) => {
    currentProc = null;
    currentPhase = null;
    sendPhaseEvent({ type: 'exit', code: -1, error: err.message });
  });

  return Promise.resolve({ started: true, phase });
}

function stopPhase() {
  if (currentProc) {
    currentProc.kill('SIGKILL');
    currentProc = null;
    currentPhase = null;
    return true;
  }
  return false;
}

function pausePhase() {
  if (currentProc && currentPhase === 8) {
    try {
      currentProc.kill('SIGSTOP');
      return true;
    } catch (_) { }
  }
  return false;
}

function resumePhase() {
  if (currentProc && currentPhase === 8) {
    try {
      currentProc.kill('SIGCONT');
      return true;
    } catch (_) { }
  }
  return false;
}

function fetchMetadata(urlStr) {
  return new Promise((resolve) => {
    try {
      const u = new URL(urlStr);
      const isHttps = u.protocol === 'https:';
      const lib = isHttps ? https : http;
      const opts = { method: 'HEAD', hostname: u.hostname, port: u.port || (isHttps ? 443 : 80), path: u.pathname + u.search, timeout: 15000 };
      const req = lib.request(opts, (res) => {
        const headers = res.headers;
        const contentLength = headers['content-length'];
        let suggestedName = null;
        const disp = headers['content-disposition'];
        if (disp) {
          const fnStar = disp.match(/filename\*=(?:UTF-8'')?([^";\n]+)/i);
          const fn = disp.match(/filename=["']?([^";\n]+)["']?/i);
          if (fnStar) {
            try { suggestedName = decodeURIComponent(fnStar[1].trim().replace(/^["']|["']$/g, '')); } catch (_) { suggestedName = fnStar[1].trim(); }
          } else if (fn) suggestedName = fn[1].trim().replace(/^["']|["']$/g, '');
        }
        if (!suggestedName && u.pathname) {
          const seg = u.pathname.split('/').filter(Boolean).pop();
          if (seg) suggestedName = decodeURIComponent(seg);
        }
        resolve({
          contentLength: contentLength ? String(contentLength).trim() : null,
          suggestedFilename: suggestedName || 'download.bin',
          contentType: headers['content-type'] || null,
          acceptRanges: headers['accept-ranges'] || null,
        });
      });
      req.on('error', (err) => resolve({ error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ error: 'Timeout' }); });
      req.setTimeout(15000);
      req.end();
    } catch (e) {
      resolve({ error: e.message });
    }
  });
}

function readOutputFile(outputDir, filename) {
  const out = outputDir.startsWith('/') ? outputDir : path.join(PROJECT_ROOT, outputDir);
  const filePath = path.join(out, filename);
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function getTestCases() {
  const p = path.join(PROJECT_ROOT, 'test_cases.json');
  try {
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    const files = data.test_files || [];
    return files.length ? files[0] : null;
  } catch {
    return null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1e1e1e',
    show: false,
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  createWindow();
  app.on('window-all-closed', () => app.quit());
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

ipcMain.handle('runPhase', (_, phase, options) => runPhase(phase, options));
ipcMain.handle('startPhaseStream', (_, phase, options) => startPhaseStream(phase, options));
ipcMain.handle('stopPhase', () => stopPhase());
ipcMain.handle('pausePhase', () => pausePhase());
ipcMain.handle('resumePhase', () => resumePhase());
ipcMain.handle('fetchMetadata', (_, url) => fetchMetadata(url));
ipcMain.handle('readOutputFile', (_, outputDir, filename) => readOutputFile(outputDir, filename));
ipcMain.handle('writeReportFile', (_, filepath, content) => {
  try {
    fs.writeFileSync(filepath, content, 'utf8');
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});
ipcMain.handle('getProjectRoot', () => PROJECT_ROOT);
ipcMain.handle('getTestCases', () => getTestCases());
ipcMain.handle('getHistory', () => getHistory());
ipcMain.handle('addToHistory', (_, item) => addToHistory(item));
ipcMain.handle('updateHistoryItem', (_, id, updates) => updateHistoryItem(id, updates));
ipcMain.handle('deleteHistoryItem', (_, id) => {
  const history = getHistory();
  const newHistory = history.filter(h => h.id !== id);
  saveHistory(newHistory);
  return newHistory;
});
ipcMain.handle('openHistoryFile', (_, filepath) => {
  if (fs.existsSync(filepath)) {
    shell.openPath(filepath);
    return true;
  }
  return false;
});
ipcMain.handle('showItemInFolder', (_, filepath) => {
  if (fs.existsSync(filepath)) {
    shell.showItemInFolder(filepath);
    return true;
  }
  return false;
});
