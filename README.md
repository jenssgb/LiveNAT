# LiveNAT Overlay

LiveNAT is an Electron-based desktop overlay for Windows and macOS that keeps a persistent, always-on-top latency readout for Google and Cloudflare backbone probes. It focuses on ultra-fast visibility: a frameless 180×80 px glass panel that updates every three seconds without relying on ICMP.

## Features
- Transparent, draggable overlay pinned to the top-right corner (20 px inset) with context menu access to quit.
- Single "Internet" line that aggregates the Google + Cloudflare probes (worst-case RTT / jitter / fail-rate) so users see one easy status, plus a 5‑minute sparkline trend to spot instability.
- Sliding window of the latest 20 samples per target (≈1 minute) with configurable color tiers:
  - Red: fail rate ≥ 20% or median latency > 600 ms
  - Orange: fail rate ≥ 5% or median latency > 200 ms
  - Green: otherwise
- HTTP round-trip timing (request start → response headers) with a 2.5 s timeout and no body persistence.
- Minimal footprint: two HTTPS checks (Google `generate_204`, Cloudflare `cdn-cgi/trace`) per interval.
- Teams call readiness lane that centers the original Teams logo chip with LED-style Audio + Video status bars (green / gelb / rot). The Details micro-panel still reveals per-target medians, jitter, fail-rate, and latest errors without exposing the underlying providers on the main overlay.
- Window chrome with two controls: **Mini** collapses the overlay (and shrinks the Electron window via IPC) so only the Internet line remains, while **Move** is a drag handle so you can reposition the overlay even when interactive regions are locked.

## Getting Started
1. **Install prerequisites**
   - [Node.js](https://nodejs.org/) 20+ (bundles the latest npm).
2. **Install dependencies**
   ```bash
   npm install
   ```
3. **Run the overlay**
   ```bash
   npm start
   ```

The overlay launches immediately, stays above other windows, and can be repositioned via drag. Right-click to access the Quit action.

## Troubleshooting downloads
If `npm install` stalls while fetching Electron (e.g., due to flaky network/proxy rules), seed the cache manually:

```powershell
$version = "32.3.3"
$cache = Join-Path $env:LOCALAPPDATA "electron\Cache"
New-Item -ItemType Directory -Force -Path $cache | Out-Null
Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$version/electron-v$version-win32-x64.zip" -OutFile (Join-Path $cache "electron-v$version-win32-x64.zip")
Invoke-WebRequest "https://github.com/electron/electron/releases/download/v$version/SHASUMS256.txt" -OutFile (Join-Path $cache "SHASUMS256.txt-$version")
```

Re-run `npm install` afterward so `@electron/get` can verify and reuse the cached artifact.

## Teams readiness logic
- The overlay takes the worst-case median RTT, fail-rate, and jitter across Google + Cloudflare (sliding window of 20 samples ≈ 1 minute).
- Stability tiers:
   - `stable`: fail-rate < 5%
   - `degraded`: 5% ≤ fail-rate < 20%
   - `bad`: fail-rate ≥ 20% (also triggers probe backoff to 6s)
- Latency + jitter heuristics now drive only two modes:
   - 🎧 **Audio** turns red once RTT > 800 ms or stability is `bad`; it stays green for stable networks with RTT ≤ 300 ms.
   - 🎥 **Video** requires `stable` + ≤ 200 ms RTT + low jitter (≤ 30 ms) for green. RTT > 600 ms or jitter > 80 ms pushes it to red, anything in-between is amber.
- The UI uses the Teams logo plus LED-style labels; hover tooltips reveal “Stabil / Achtung / Kritisch” while the entire card re-tints according to aggregate stability. Mini mode automatically hides the Teams lane to keep the overlay featherweight.
- Click “Details” to see per-target medians, jitter, fail-rate, and the latest error cause without leaving the overlay.

## Privacy & resource notes
- No telemetry, analytics, or persistence: timing data stays in-memory and rolls off after 20 samples.
- Only HTTPS response headers are inspected; bodies are discarded immediately.
- Probes run serially every 3 seconds (6 seconds under sustained failure) to stay train-WiFi friendly.
- Speed-burst micro-tests are not enabled by default; add your own trigger if you need Mbps estimates.

## Project Structure
- `main.js` — Electron bootstrap plus latency monitor running in the main process via the `https` module.
- `preload.js` — Exposes a minimal, read-only bridge for renderer updates.
- `src/index.html`, `src/styles.css`, `src/renderer.js` — The overlay UI and client-side wiring for live updates.

## Configuration
Targets, intervals, and thresholds are defined at the top of `main.js`. Tune them as needed for alternative endpoints or stricter alerting rules.

## Notes
- Because the app depends on HTTPS requests instead of ICMP, outbound HTTPS traffic must be allowed (ports 443 to Google and Cloudflare).
- The measurement engine records only aggregated stats; response bodies are discarded immediately after headers arrive.
