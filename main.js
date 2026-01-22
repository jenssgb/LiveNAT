const { app, BrowserWindow, Menu, screen, ipcMain } = require('electron');
const path = require('node:path');
const https = require('node:https');
const { performance } = require('node:perf_hooks');

const WINDOW_SIZE = { width: 260, height: 190 };
const MINI_WINDOW_HEIGHT = 78;
const WINDOW_MARGIN = 20;
const SAMPLE_WINDOW = 20;
const BASE_INTERVAL_MS = 3000;
const BACKOFF_INTERVAL_MS = 6000;
const TIMEOUT_MS = 2500;
const HISTORY_WINDOW_MS = 5 * 60 * 1000;

const TARGETS = [
  { id: 'google', label: 'Google', url: 'https://www.google.com/generate_204' },
  { id: 'cloudflare', label: 'Cloudflare', url: 'https://www.cloudflare.com/cdn-cgi/trace' }
];

class LatencyMonitor {
  constructor(notify) {
    this.notify = notify;
    this.samples = TARGETS.reduce((acc, target) => {
      acc[target.id] = [];
      return acc;
    }, {});
    this.pollTimer = null;
    this.currentInterval = BASE_INTERVAL_MS;
    this.isPolling = false;
    this.internetHistory = [];
  }

  start() {
    if (this.pollTimer) return;
    this.emitState();
    this.poll();
  }

  stop() {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
  }

  async poll() {
    if (this.isPolling) return;
    this.isPolling = true;
    try {
      for (const target of TARGETS) {
        await this.measureTarget(target);
      }
      const state = this.buildState();
      this.adjustInterval(state.readiness?.aggregate?.failRate ?? 0);
      this.emitState(state);
    } finally {
      this.isPolling = false;
      this.scheduleNextPoll();
    }
  }

  scheduleNextPoll(delay = this.currentInterval) {
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
    }
    this.pollTimer = setTimeout(() => this.poll(), delay);
  }

  async measureTarget(target) {
    const started = performance.now();

    return new Promise((resolve) => {
      const request = https.request(target.url, { method: 'GET', headers: { 'Cache-Control': 'no-cache' } }, (response) => {
        const duration = Math.round(performance.now() - started);
        const statusCode = response.statusCode ?? 0;
        const success = statusCode >= 200 && statusCode < 400;

        response.destroy();

        this.recordSample({
          targetId: target.id,
          success,
          durationMs: success ? duration : null,
          timestamp: Date.now(),
          statusCode
        });

        resolve();
      });

      request.setTimeout(TIMEOUT_MS, () => {
        request.destroy(new Error('timeout'));
      });

      request.on('error', (error) => {
        this.recordSample({
          targetId: target.id,
          success: false,
          durationMs: null,
          timestamp: Date.now(),
          error: error?.message ?? 'request failed'
        });
        resolve();
      });

      request.end();
    });
  }

  recordSample(sample) {
    const bucket = this.samples[sample.targetId];
    bucket.push(sample);
    if (bucket.length > SAMPLE_WINDOW) {
      bucket.shift();
    }

    // State emission happens after each full poll to keep UI updates cohesive.
  }

  buildSnapshot(targetId) {
    const bucket = this.samples[targetId];
    return {
      targetId,
      lastSample: bucket[bucket.length - 1] ?? null,
      metrics: this.computeMetrics(bucket)
    };
  }

  getAllSnapshots() {
    return TARGETS.map((target) => this.buildSnapshot(target.id));
  }

  extractMetrics(snapshots) {
    if (!Array.isArray(snapshots)) return [];
    return snapshots.map((snapshot) => ({
      targetId: snapshot.targetId,
      failRate: snapshot.metrics?.failRate ?? 0,
      medianMs: snapshot.metrics?.medianMs ?? null,
      jitterMs: snapshot.metrics?.jitterMs ?? null
    }));
  }

  computeInternetSummary(aggregate) {
    if (!aggregate) {
      return { tier: 'orange', rtt: null, failRate: 0, jitterMs: null };
    }
    return {
      tier: this.resolveTier(aggregate.failRate ?? 0, aggregate.rtt),
      rtt: aggregate.rtt,
      failRate: aggregate.failRate ?? 0,
      jitterMs: aggregate.jitterMs ?? null
    };
  }

  recordInternetHistory(summary) {
    if (!summary) return;
    const timestamp = Date.now();
    this.internetHistory.push({
      timestamp,
      rtt: typeof summary.rtt === 'number' ? summary.rtt : null,
      tier: summary.tier,
      failRate: summary.failRate ?? 0
    });

    const cutoff = timestamp - HISTORY_WINDOW_MS;
    while (this.internetHistory.length && this.internetHistory[0].timestamp < cutoff) {
      this.internetHistory.shift();
    }

    const maxSamples = Math.ceil(HISTORY_WINDOW_MS / BASE_INTERVAL_MS) + 10;
    while (this.internetHistory.length > maxSamples) {
      this.internetHistory.shift();
    }
  }

  buildState() {
    const targets = this.getAllSnapshots();
    const metrics = this.extractMetrics(targets);
    const aggregate = this.computeAggregate(metrics);
    const internet = this.computeInternetSummary(aggregate);
    this.recordInternetHistory(internet);
    return {
      targets,
      readiness: this.computeReadiness(metrics, aggregate),
      internet,
      history: { internet: [...this.internetHistory] },
      updatedAt: Date.now()
    };
  }

  emitState(state) {
    if (typeof this.notify !== 'function') return;
    this.notify(state ?? this.buildState());
  }

  computeMetrics(bucket) {
    if (!bucket.length) {
      return { failRate: 0, medianMs: null, jitterMs: null, tier: 'green' };
    }

    const failures = bucket.filter((sample) => !sample.success).length;
    const failRate = bucket.length ? failures / bucket.length : 0;
    const successfulDurations = bucket
      .filter((sample) => sample.success && typeof sample.durationMs === 'number')
      .map((sample) => sample.durationMs)
      .sort((a, b) => a - b);

    const jitterSamples = this.computeJitterSamples(bucket);
    const medianMs = successfulDurations.length ? this.median(successfulDurations) : null;
    const jitterMs = jitterSamples.length ? this.median(jitterSamples) : null;
    const tier = this.resolveTier(failRate, medianMs);

    return { failRate, medianMs, jitterMs, tier };
  }

  computeJitterSamples(bucket) {
    const orderedByTime = bucket
      .filter((sample) => sample.success && typeof sample.durationMs === 'number')
      .sort((a, b) => a.timestamp - b.timestamp);

    const deltas = [];
    for (let i = 1; i < orderedByTime.length; i += 1) {
      const prev = orderedByTime[i - 1].durationMs;
      const curr = orderedByTime[i].durationMs;
      deltas.push(Math.abs(curr - prev));
    }
    return deltas;
  }

  median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2 === 0) {
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
    }
    return sorted[mid];
  }

  resolveTier(failRate, medianMs) {
    if (failRate >= 0.2 || (medianMs !== null && medianMs > 600)) {
      return 'red';
    }

    if (failRate >= 0.05 || (medianMs !== null && medianMs > 200)) {
      return 'orange';
    }

    return 'green';
  }

  computeReadiness(metrics, aggregateInput) {
    const list = metrics ?? [];
    const aggregate = aggregateInput ?? this.computeAggregate(list);

    if (!list.length) {
      return {
        modes: this.emptyModes(),
        aggregate: { failRate: 0, rtt: null, jitterMs: null, stability: 'stable' }
      };
    }

    const modes = {
      audio: this.evaluateAudio(aggregate),
      video: this.evaluateVideo(aggregate)
    };

    return { modes, aggregate };
  }

  computeAggregate(metrics) {
    const failRate = metrics.reduce((max, metric) => Math.max(max, metric.failRate ?? 0), 0);
    const rtt = this.maxMetric(metrics, 'medianMs');
    const jitterMs = this.maxMetric(metrics, 'jitterMs');
    const stability = failRate >= 0.2 ? 'bad' : failRate >= 0.05 ? 'degraded' : 'stable';

    return { failRate, rtt, jitterMs, stability };
  }

  maxMetric(metrics, key) {
    let value = null;
    metrics.forEach((metric) => {
      if (typeof metric[key] === 'number' && (value === null || metric[key] > value)) {
        value = metric[key];
      }
    });
    return value;
  }

  evaluateAudio(aggregate) {
    const rtt = typeof aggregate.rtt === 'number' ? aggregate.rtt : 400;
    if (aggregate.stability === 'bad' || rtt > 800) {
      return { mode: 'audio', state: 'red' };
    }
    if (aggregate.stability === 'degraded' || rtt > 300) {
      return { mode: 'audio', state: 'orange' };
    }
    return { mode: 'audio', state: 'green' };
  }

  evaluateVideo(aggregate) {
    const rtt = typeof aggregate.rtt === 'number' ? aggregate.rtt : 400;
    const jitter = typeof aggregate.jitterMs === 'number' ? aggregate.jitterMs : 90;
    const goodRTT = rtt <= 200;
    const okRTT = rtt > 200 && rtt <= 600;
    const badRTT = rtt > 600;
    const goodJit = jitter <= 30;
    const okJit = jitter > 30 && jitter <= 80;
    const badJit = jitter > 80;

    if (aggregate.stability === 'bad' || badRTT || badJit) {
      return { mode: 'video', state: 'red' };
    }

    if ((aggregate.stability === 'stable' && goodRTT && goodJit)) {
      return { mode: 'video', state: 'green' };
    }

    if ((aggregate.stability === 'stable' && okRTT) || (aggregate.stability === 'degraded' && goodRTT)) {
      return { mode: 'video', state: 'orange' };
    }

    if (aggregate.stability === 'degraded' && okJit) {
      return { mode: 'video', state: 'orange' };
    }

    return { mode: 'video', state: 'red' };
  }

  emptyModes() {
    return {
      audio: { mode: 'audio', state: 'orange' },
      video: { mode: 'video', state: 'orange' }
    };
  }

  adjustInterval(maxFailRate) {
    this.currentInterval = maxFailRate >= 0.2 ? BACKOFF_INTERVAL_MS : BASE_INTERVAL_MS;
  }
}

let mainWindow;
let monitor;
let isMiniMode = false;

ipcMain.handle('latency:get-initial', () => (
  composeSnapshot(
    monitor
      ? monitor.buildState()
      : {
          targets: [],
          readiness: null,
          internet: { tier: 'orange', rtt: null, failRate: 0, jitterMs: null },
          history: { internet: [] }
        }
  )
));

ipcMain.handle('overlay:set-mini', (_event, desired) => {
  if (typeof desired === 'boolean') {
    isMiniMode = desired;
    applyWindowMode();
  }
  return { mini: isMiniMode };
});

const singleInstance = app.requestSingleInstanceLock();
if (!singleInstance) {
  app.quit();
} else {
  app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

app.on('window-all-closed', () => {
  if (monitor) {
    monitor.stop();
    monitor = null;
  }

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { x, y, width } = primaryDisplay.workArea;

  const targetX = Math.round(x + width - WINDOW_SIZE.width - WINDOW_MARGIN);
  const targetY = Math.round(y + WINDOW_MARGIN);

  mainWindow = new BrowserWindow({
    width: WINDOW_SIZE.width,
    height: WINDOW_SIZE.height,
    x: targetX,
    y: targetY,
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    hasShadow: false,
    backgroundColor: '#00000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    applyWindowMode();
    mainWindow.show();
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);
  setupContextMenu(mainWindow);

  monitor = new LatencyMonitor((snapshot) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('latency:update', composeSnapshot(snapshot));
    }
  });

  monitor.start();

  mainWindow.on('closed', () => {
    if (monitor) {
      monitor.stop();
      monitor = null;
    }
    mainWindow = null;
  });
}

function setupContextMenu(window) {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Quit',
      click: () => app.quit()
    }
  ]);

  window.webContents.on('context-menu', (event) => {
    event.preventDefault();
    menu.popup({ window });
  });
}

function composeSnapshot(state) {
  return {
    ...state,
    uiMode: { mini: isMiniMode }
  };
}

function applyWindowMode() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const targetHeight = isMiniMode ? MINI_WINDOW_HEIGHT : WINDOW_SIZE.height;
  mainWindow.setSize(WINDOW_SIZE.width, targetHeight);
}
