# Project status

Last updated: 2026-08-28

## Current state

LiveNAT 1.1.0 is available for Windows x64 and Windows ARM64/Snapdragon.

- Release: https://github.com/jenssgb/LiveNAT/releases/tag/v1.1.0
- Successful build: https://github.com/jenssgb/LiveNAT/actions/runs/33097580147
- ARM64 installer: `LiveNAT-Setup-1.1.0-arm64.exe`
  - Size: 83,843,521 bytes
  - SHA-256: `798d7667ba5f0db39e941ec28a67435d89358a3bdd5f120041201418c6eb25a8`
- x64 installer: `LiveNAT-Setup-1.1.0-x64.exe`
  - Size: 80,013,054 bytes
  - SHA-256: `5783e97eae135e48454c1805f66968d748a036afce5c88c578bcf0753536e8f8`
- The original architecture-neutral x64 asset remains available as
  `LiveNAT-Setup-1.1.0.exe`.

The ARM64 installer was downloaded and validated on a Windows Snapdragon
device:

- Installed version: 1.1.0
- Installed executable machine type: ARM64
- Installer SHA-256 matched the published release digest
- LiveNAT starts and remains responsive
- Desktop and Start Menu shortcuts exist

## Implemented

- Added explicit `dist:x64`, `dist:arm64`, and `dist:all` npm scripts.
- Added the target architecture to installer filenames.
- Added `.github/workflows/windows-build.yml`.
- Builds run on GitHub Actions for both x64 and ARM64.
- Successful installers are attached directly to the matching GitHub release.
- GitHub CLI and Git HTTPS use the `jenssgb` account.
- Git commit author is `Jens Schneider
  <59275967+jenssgb@users.noreply.github.com>`.

Relevant commits:

- `e7b789d` - Add Windows ARM64 builds
- `85d4558` - Disable implicit CI publishing
- `61a2047` - Publish Windows installers from CI
- `82e8bc7` - Document ARM64 release status

## Local network issue

The Microsoft-managed npm configuration points to:

`https://packagefeedproxy.microsoft.io/npm/`

Package installation repeatedly failed with `ECONNRESET`. Direct npm downloads
also encountered TLS handshake failures. This is consistent with a managed
network or package-proxy restriction, not with a detected LiveNAT security
incident. The GitHub Actions build avoids relying on local npm downloads.

## Remaining follow-up

1. Update the GitHub Actions action versions when stable releases without the
   Node.js 20 deprecation warning are available.
2. Consider removing the original architecture-neutral x64 release asset after
   confirming that existing download links no longer depend on it.
