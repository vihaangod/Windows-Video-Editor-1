const path = require('node:path');

async function buildRenderer() {
  process.env.PORT = process.env.CUTLINE_BUILD_PORT || '5173';
  process.env.BASE_PATH = '/';
  const { build } = await import('vite');
  await build({ configFile: path.join(__dirname, '..', 'vite.config.ts') });
}

buildRenderer().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
