# Repository instructions

- Build and package LiveNAT exclusively in the cloud with the
  `.github/workflows/windows-build.yml` GitHub Actions workflow.
- Never run dependency installation, Electron, packaging, or build commands
  locally in this repository.
- Local validation must be limited to checks that use tools already available
  without installing dependencies.
