# Build the Cutline Windows installer

## Prerequisites

- Windows 10 or 11, 64-bit.
- Node.js 24.x with npm. The workspace was checked with Node.js 24.13.0.
- Git for Windows. Run the commands below in **Git Bash** from the repository root (the directory containing `pnpm-workspace.yaml`); the root install script requires `sh`.
- pnpm 10.26.1.

## Build

In Git Bash, run:

```bash
npm install --global pnpm@10.26.1
pnpm --version

# Preserve an existing local Supabase configuration; create one only if missing.
if [ ! -f artifacts/cutline-editor/.env ]; then
  cp artifacts/cutline-editor/.env.example artifacts/cutline-editor/.env
fi
notepad artifacts/cutline-editor/.env
# Ensure the existing VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY values are set, then save and close the file.

pnpm install --frozen-lockfile
pnpm --filter @workspace/cutline-editor run electron:dist:win
```

The build command first creates the production renderer, then runs electron-builder for the configured full NSIS installer target on Windows x64. A successful build exits with code 0 and writes:

`artifacts/cutline-editor/desktop-release/Cutline-1.0.0-Setup.exe`

Do not use a leftover `.exe` if the build exits with an error; NSIS can leave a small stub behind. Check that the file exists after a successful build, then run it on Windows and confirm the installer completes and Cutline launches before distributing it. Keep the local `.env` out of source control.

## Linux/Replit limitation

The current Replit Linux/Nix host can package the Windows app payload but cannot finish the NSIS installer: Wine fails while starting its RPC service. It leaves a small NSIS stub without the application payload; that file is not a usable installer. Build on a native Windows machine instead. The Windows build has not yet been run or verified.
