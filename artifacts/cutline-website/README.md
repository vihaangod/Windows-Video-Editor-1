# Cutline download website

Single-route static marketing and download site for Cutline, the local-first Windows x64 desktop video editor.

## Download URL configuration

The download link is controlled by the single frontend value `VITE_CUTLINE_DOWNLOAD_URL`. If it is unset, the site uses this placeholder:

`https://downloads.example.com/cutline/Cutline-1.0.0-Setup.exe`

The installer is not hosted yet. Before publishing a release, set `VITE_CUTLINE_DOWNLOAD_URL` to the actual public installer URL in the build environment (or in a local `.env` file for a local build), for example:

```env
VITE_CUTLINE_DOWNLOAD_URL=https://your-domain.example/downloads/Cutline-1.0.0-Setup.exe
```

Rebuild and deploy after changing it. Keep this as a public download URL; Vite embeds `VITE_` variables into the static site.

## Cloudflare Pages

Create a Pages project connected to this repository and use these settings:

- **Repository root / Root directory:** `/` (the repository root)
- **Framework preset:** None (static Vite build)
- **Build command:** `PORT=21109 BASE_PATH=/ pnpm --filter @workspace/cutline-website run build`
- **Build output directory:** `artifacts/cutline-website/dist/public`
- **Production environment variable:** `VITE_CUTLINE_DOWNLOAD_URL` = the real, publicly reachable Cutline Windows x64 installer URL

The current installer is not hosted. Set the production variable only when a release URL is available; until then, the default placeholder is shown on the page and explicitly identified as not hosted.

## Local development

From the repository root:

```sh
pnpm --filter @workspace/cutline-website run dev
```

Build:

```sh
PORT=21109 BASE_PATH=/ pnpm --filter @workspace/cutline-website run build
```
