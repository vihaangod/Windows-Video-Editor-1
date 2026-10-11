---
name: CSS marquee test isolation
description: Browser-test ordering for CSS animation seam and pause checks.
---

When validating a CSS marquee, run tests that use the Web Animations API to seek or play the CSS animation only after natural hover and focus pause/resume checks. Instrumenting the live animation can perturb CSS play-state semantics in Chromium.

**Why:** Mixing programmatic animation seeking with user-like interactions led to misleading pause-state results and unstable browser checks.

**How to apply:** Complete hover/focus pause and position-preservation assertions first. Run controlled seam-boundary checks in a separate state or at the end.
