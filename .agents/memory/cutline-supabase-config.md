---
name: Cutline Supabase configuration
description: User-stated preference for configuring the Supabase client in Cutline.
---

Configure Cutline's Supabase browser client with Vite environment variables in the editor's `.env` configuration. The user explicitly said not to use Replit Secrets; `VITE_SUPABASE_ANON_KEY` will contain their Supabase Publishable Key.

**Why:** the user specified this setup when requesting the reusable client scaffold.

**How to apply:** keep future Supabase client setup compatible with the Vite browser editor and Electron app, and keep the `.env` file out of version control.
