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

## Validation before a Windows release

Run these automated checks from the repository root before packaging:

```bash
pnpm --filter @workspace/cutline-editor run test:audio
pnpm --filter @workspace/cutline-editor run test:composition
pnpm --filter @workspace/cutline-editor run test:desktop
```

The browser codec check (`pnpm --filter @workspace/cutline-editor run test:audio:browser`) must run in the Replit environment with the editor preview available at `/`. It encodes and decodes a synthetic 18.114-second audio/video sample; it does not replace checking a real project export on Windows.

On a native Windows machine, build and launch the installer, then verify both formats against actual browser/system codec support:

1. Export a project with continuous audio, a trimmed clip, a split clip, overlapping audio, and audio from a video/overlay clip. Confirm there are no gaps and audio ends with the video.
2. Confirm MP4 is offered only when AVC/AAC encoding is available, WebM still exports when VP8/Opus are available, and unsupported codecs produce a clear error.
3. Enable Rich Presence only after configuring a Discord Application ID. Verify activity updates and reconnect behavior with Discord open and closed; keep project-name sharing off unless explicitly testing the opt-in.
4. Run the installer, launch Cutline, and confirm it opens before treating the installer as distributable.

Current verification is limited to the Linux/Replit host: the browser WebM sample passes with no silent windows and 13 ms audio/video duration difference; this Chromium does not support the MP4 profile. The Windows installer, actual Windows codec selection, and live Discord behavior still require native Windows testing.
