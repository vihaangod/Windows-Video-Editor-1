# Cutline download website

Single-route static marketing and download site for Cutline, the local-first Windows x64 desktop video editor.

## Download URL configuration

The download link is controlled by the frontend build value `VITE_CUTLINE_DOWNLOAD_URL`. The website accepts only an HTTPS GitHub Release asset URL ending in `Cutline-1.0.0-Setup.exe`.

If the value is unset or invalid, the Download for Windows links remain disabled. There is no fallback or placeholder URL.

Publish the installer as a public GitHub Release asset first. Then set `VITE_CUTLINE_DOWNLOAD_URL` to the asset's real direct-download URL in the build environment. Do not use the release page URL or a private repository URL. Vite embeds `VITE_` variables into the static site, so rebuild and redeploy after changing the value.

## Cloudflare Pages

Create a Pages project connected to this repository and use these settings:

- **Repository root / Root directory:** `/` (the repository root)
- **Framework preset:** None (static Vite build)
- **Build command:** `PORT=21109 BASE_PATH=/ pnpm --filter @workspace/cutline-website run build`
- **Build output directory:** `artifacts/cutline-website/dist/public`
- **Production environment variable:** Set `VITE_CUTLINE_DOWNLOAD_URL` to the verified direct URL of the public `Cutline-1.0.0-Setup.exe` release asset

Do not set the production variable until the public release asset exists. Verify that the direct URL serves the installer, then rebuild/redeploy the Pages project.

## Local development

From the repository root:

```sh
pnpm --filter @workspace/cutline-website run dev
```

Build:

```sh
PORT=21109 BASE_PATH=/ pnpm --filter @workspace/cutline-website run build
```
