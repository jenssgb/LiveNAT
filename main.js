const { app, BrowserWindow, Menu, screen, ipcMain, dialog } = require('electron');
const path = require('node:path');
const https = require('node:https');
const { performance } = require('node:perf_hooks');

const WIDTH = 200;
const HEIGHT = 60;
const MARGIN = 16;
const POLL_MS = 3000;
const TIMEOUT_MS = 4000;
const SAMPLE_COUNT = 10;
const HISTORY_MS = 3 * 60 * 1000;

const TARGETS = [
  { id: 'google', url: 'https://www.google.com/generate_204' },
  { id: 'cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace' }
];

class ConnectivityMonitor {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.buckets = Object.fromEntries(TARGETS.map(t => [t.id, []]));
    this.history = [];
    this.timer = null;
    this.state = null;
  }

  start() { this.tick(); }

  stop() {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
  }

  getState() {
    return this.state ?? { status: 'offline', latency: null, failRate: 1, history: [] };
  }

  async tick() {
    const probes = await Promise.all(TARGETS.map(t => this.probe(t)));
    probes.forEach(p => {
      const b = this.buckets[p.id];
      b.push(p);
      if (b.length > SAMPLE_COUNT) b.shift();
    });
    this.state = this.compute();
    this.onUpdate(this.state);
    this.timer = setTimeout(() => this.tick(), POLL_MS);
  }

  probe(target) {
    return new Promise(resolve => {
      const t0 = performance.now();
      const req = https.request(target.url, {
        method: 'GET',
        headers: { 'Cache-Control': 'no-cache' }
      }, res => {
        const ms = Math.round(performance.now() - t0);
        res.destroy();
        resolve({ id: target.id, ok: res.statusCode >= 200 && res.statusCode < 400, ms, ts: Date.now() });
      });
      req.setTimeout(TIMEOUT_MS, () => req.destroy(new Error('timeout')));
      req.on('error', () => resolve({ id: target.id, ok: false, ms: null, ts: Date.now() }));
      req.end();
    });
  }

  compute() {
    const now = Date.now();
    const recent = Object.values(this.buckets).flat().filter(s => now - s.ts < 15000);
    const total = recent.length || 1;
    const failRate = recent.filter(s => !s.ok).length / total;
    const rtts = recent.filter(s => s.ok && s.ms != null).map(s => s.ms).sort((a, b) => a - b);
    const latency = rtts.length ? rtts[Math.floor(rtts.length / 2)] : null;

    let status = 'online';
    if (failRate > 0.5 || (latency === null && recent.length > 2)) status = 'offline';
    else if (failRate >= 0.1 || (latency !== null && latency > 300)) status = 'slow';

    this.history.push({ ts: now, rtt: latency, status });
    const cutoff = now - HISTORY_MS;
    while (this.history.length && this.history[0].ts < cutoff) this.history.shift();

    return { status, latency, failRate, history: [...this.history] };
  }
}

let win, monitor;
const DEFAULT_STATE = { status: 'offline', latency: null, failRate: 1, history: [] };

ipcMain.handle('get-state', () => monitor?.getState() ?? DEFAULT_STATE);
ipcMain.on('window-move', (_e, { dx, dy }) => {
  if (!win || win.isDestroyed()) return;
  const [x, y] = win.getPosition();
  win.setPosition(x + dx, y + dy);
});

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(launch);
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });
}

app.on('window-all-closed', () => {
  if (monitor) { monitor.stop(); monitor = null; }
  if (process.platform !== 'darwin') app.quit();
});

function launch() {
  const { x, y, width } = screen.getPrimaryDisplay().workArea;

  win = new BrowserWindow({
    width: WIDTH, height: HEIGHT,
    x: Math.round(x + width - WIDTH - MARGIN),
    y: Math.round(y + MARGIN),
    frame: false, transparent: true, resizable: false, movable: true,
    skipTaskbar: true, alwaysOnTop: true, fullscreenable: false,
    hasShadow: false, backgroundColor: '#00000000', show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false, contextIsolation: true
    }
  });

  win.once('ready-to-show', () => { win.show(); win.setAlwaysOnTop(true, 'screen-saver'); });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
  win.setMenuBarVisibility(false);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Über LiveNAT',
      click: () => {
        dialog.showMessageBox(win, {
          type: 'info',
          title: 'LiveNAT v1.0.0',
          message: 'LiveNAT v1.0.0',
          detail: 'Minimal internet connectivity indicator für ICE-Züge.\n\nCredits:\n• Jens Schneider — Idee, Design & Entwicklung\n• GitHub Copilot (Claude) — Pair Programming & Implementierung\n\ngithub.com/jenssgb/LiveNAT',
          buttons: ['OK']
        });
      }
    },
    { type: 'separator' },
    { label: 'Beenden', click: () => app.quit() }
  ]);
  win.webContents.on('context-menu', e => { e.preventDefault(); menu.popup({ window: win }); });

  monitor = new ConnectivityMonitor(state => {
    if (win && !win.isDestroyed()) win.webContents.send('state-update', state);
  });
  monitor.start();

  win.on('closed', () => { if (monitor) { monitor.stop(); monitor = null; } win = null; });
}
