---
name: Cutline Windows release dependencies
description: Preserve the native package targets required by Windows Electron builds.
---

Keep optional native dependency packages for both Linux x64 and Windows x64 available when configuring the workspace for desktop releases.

**Why:** Excluding Windows x64 packages from the pnpm resolution prevented a native Windows runner from installing the dependencies required to build the installer.

**How to apply:** Before changing platform-specific package overrides, compare them with the intended build targets; Windows x64 must remain resolvable for the Electron installer workflow.
