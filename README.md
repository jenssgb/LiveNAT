# LiveNAT

Minimal always-on-top internet connectivity indicator for ICE trains (or anywhere with flaky Wi-Fi).

A tiny 200x60 px pill overlay that tells you at a glance whether you're online:

- **Green: Online** - connection is good, shows latency in ms
- **Yellow: Instabil** - packet loss or high latency (>300 ms)
- **Red: Offline** - pulsing red dot, no connectivity
- **Sparkline** - 3-minute RTT trend so you can see tunnels and dead zones

Drag anywhere. Right-click > **Beenden** to quit.

## Quick start

```bash
npm install
npm start
```

## How it works

Every 3 seconds, LiveNAT pings Google (`generate_204`) and Cloudflare (`cdn-cgi/trace`) via HTTPS. The worst-case median RTT and packet loss across both probes determines your status. No ICMP, no telemetry - everything stays in-memory.

## Configuration

Targets, thresholds, and intervals are defined at the top of `main.js`.
