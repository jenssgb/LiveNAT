const api = window.livenat;

const pill = document.querySelector('.pill');
const label = document.querySelector('.label');
const msEl = document.querySelector('.ms');
const sparkPath = document.querySelector('.spark-line');

const TEXT = { online: 'Online', slow: 'Instabil', offline: 'Offline' };
const SW = 172;
const SH = 20;

function apply(state) {
  if (!state) return;

  pill.dataset.s = state.status;
  label.textContent = TEXT[state.status] ?? 'Offline';
  msEl.textContent = state.status === 'offline'
    ? ''
    : state.latency != null ? `${state.latency} ms` : '…';

  // sparkline
  const pts = (state.history || []).filter(h => h.rtt != null);
  if (pts.length < 2) { sparkPath.setAttribute('d', ''); return; }

  const rtts = pts.map(p => p.rtt);
  let min = Math.min(...rtts), max = Math.max(...rtts);
  if (max - min < 20) max = min + 20;

  const step = SW / (pts.length - 1);
  const d = pts.map((p, i) => {
    const x = (i * step).toFixed(1);
    const y = (SH - ((p.rtt - min) / (max - min)) * SH).toFixed(1);
    return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
  }).join(' ');
  sparkPath.setAttribute('d', d);
}

async function init() {
  if (!api) return;
  try {
    apply(await api.getState());
  } catch (e) {
    console.error('init failed', e);
  }
  api.onUpdate(apply);
}

init();

// Custom drag (so right-click context menu works)
let dragging = false, sx = 0, sy = 0;
pill.addEventListener('mousedown', e => {
  if (e.button === 0) { dragging = true; sx = e.screenX; sy = e.screenY; }
});
document.addEventListener('mousemove', e => {
  if (!dragging) return;
  api.moveWindow(e.screenX - sx, e.screenY - sy);
  sx = e.screenX; sy = e.screenY;
});
document.addEventListener('mouseup', () => { dragging = false; });
