# Project status

Last updated: 2026-08-28

## Current state

LiveNAT 1.1.1 is available for Windows x64 and Windows ARM64/Snapdragon.

- Release: https://github.com/jenssgb/LiveNAT/releases/tag/v1.1.1
- Successful build: https://github.com/jenssgb/LiveNAT/actions/runs/33173325856
- ARM64 installer: `LiveNAT-Setup-1.1.1-arm64.exe`
  - Size: 83,843,681 bytes
  - SHA-256: `cebc2c82e68881ef09449d2cf6f1c270708bbba592d9bf674f93884a9ded0e8f`
- x64 installer: `LiveNAT-Setup-1.1.1-x64.exe`
  - Size: 80,013,195 bytes
  - SHA-256: `2c05adbcbecce9672edd6ddde3f56edac6cced13276270ddbf3b6e02127a0b08`

The 1.1.1 ARM64 installer was downloaded and validated on a Windows Snapdragon
device:

- Installed version: 1.1.1
- Installed executable machine type: ARM64
- Installer SHA-256 matched the published release digest
- LiveNAT starts and remains responsive
- Native interactive window region: 200 x 60 pixels
- Desktop and Start Menu shortcuts exist

## Implemented

- Constrained the transparent Windows input region to the visible indicator.
- Fixed the content size at 200 x 60 device-independent pixels.
- Published version 1.1.1 from GitHub Actions.
- Documented that LiveNAT must only be built in GitHub Actions.
- Added explicit `dist:x64`, `dist:arm64`, and `dist:all` npm scripts.
- Added the target architecture to installer filenames.
- Added `.github/workflows/windows-build.yml`.
- Builds run on GitHub Actions for both x64 and ARM64.
- Successful installers are attached directly to the matching GitHub release.
- GitHub CLI and Git HTTPS use the `jenssgb` account.
- Git commit author is `Jens Schneider
  <59275967+jenssgb@users.noreply.github.com>`.

Relevant commits:

- `7e85e7d` - Fix oversized transparent window input region
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
