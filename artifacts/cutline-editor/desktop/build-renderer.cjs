const path = require('node:path');
const fs = require('node:fs/promises');

async function buildRenderer() {
  const packageRoot = path.resolve(__dirname, '..');
  process.env.PORT = process.env.CUTLINE_BUILD_PORT || '5173';
  process.env.BASE_PATH = '/';
  const { build, loadEnv } = await import('vite');
  const env = loadEnv('production', packageRoot, 'VITE_');
  let supabaseOrigin = '';
  try {
    supabaseOrigin = new URL(env.VITE_SUPABASE_URL || '').origin;
  } catch {
    // The renderer will show its existing configuration error when Supabase is unset or invalid.
  }
  await build({ configFile: path.join(packageRoot, 'vite.config.ts') });
  const configPath = path.join(packageRoot, 'dist', 'public', 'cutline-desktop-config.json');
  await fs.writeFile(configPath, JSON.stringify({ supabaseOrigin }), 'utf8');
}

buildRenderer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
