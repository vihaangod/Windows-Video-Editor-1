---
name: WebCodecs encoder selection
description: Prefer browser-selected hardware acceleration so local export can fall back when a GPU encoder configuration is unavailable.
---

For local WebCodecs export, avoid pinning `hardwareAcceleration` to `prefer-hardware` unless hardware-only export is an explicit requirement. Generic codec support can pass while the exact hardware encoder configuration still fails.

**Why:** testing Cutline in a headless Chromium environment showed VP8 support at the codec level, but the requested hardware-accelerated canvas configuration was rejected. `no-preference` allowed the browser to select a working software path and produce a valid WebM.

**How to apply:** let the browser choose its available encoder for both preview-sized and export-sized outputs. Verify with the exact codec, dimensions, and bitrate used by the export path rather than relying only on a generic codec capability probe.
