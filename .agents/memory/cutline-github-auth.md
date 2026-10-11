---
name: Cutline GitHub release authentication
description: Replit GitHub integration status and Git CLI authentication may diverge during private Windows release pushes.
---

Before pushing a private release branch, verify access through the actual Git remote. An OAuth connection can appear healthy or report already attached while GitHub HTTPS rejects the credentials and the integration list still shows `not_added`.

**Why:** During Cutline's Windows installer setup, GitHub rejected the push even though the connection returned healthy OAuth status and `addIntegration` reported it was already added. The reauthorization flow was unavailable while the live integration status remained `not_added`.

**How to apply:** Test the target repository with a read-only Git operation before pushing. If it fails, keep the local release branch and `main` unchanged, reconnect GitHub through Replit, and retry without requesting or handling credentials in chat.
