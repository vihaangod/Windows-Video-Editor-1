const path = require('node:path');
const { spawn } = require('node:child_process');

const packageRoot = path.resolve(__dirname, '..');
const viteBin = require.resolve('vite/bin/vite.js');
const electronBin = require('electron');
const viteUrl = 'http://127.0.0.1:5173';
const viteProcess = spawn(process.execPath, [
  viteBin,
  '--config',
  path.join(packageRoot, 'vite.config.ts'),
  '--host',
  '127.0.0.1',
  '--port',
  '5173',
  '--strictPort',
], {
  cwd: packageRoot,
  env: { ...process.env, PORT: '5173', BASE_PATH: '/' },
  stdio: 'inherit',
});

let electronProcess = null;
let shuttingDown = false;

function stopVite() {
  if (!viteProcess.killed) viteProcess.kill();
}

async function waitForVite() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (viteProcess.exitCode !== null) throw new Error(`Vite exited with code ${viteProcess.exitCode}.`);
    try {
      const response = await fetch(viteUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Vite did not become ready within 30 seconds.');
}

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  stopVite();
  if (electronProcess && !electronProcess.killed) electronProcess.kill(signal || 'SIGTERM');
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

waitForVite().then(() => {
  electronProcess = spawn(electronBin, [
    path.join(packageRoot, 'desktop', 'main.cjs'),
    ...(process.env.CUTLINE_ELECTRON_NO_SANDBOX === '1' ? ['--no-sandbox'] : []),
  ], {
    cwd: packageRoot,
    env: { ...process.env, VITE_DEV_SERVER_URL: viteUrl },
    stdio: 'inherit',
  });
  electronProcess.on('error', (error) => {
    console.error('Could not start Electron:', error);
    shutdown('SIGTERM');
    process.exitCode = 1;
  });
  electronProcess.on('exit', (code, signal) => {
    stopVite();
    if (!shuttingDown) process.exitCode = code ?? (signal ? 1 : 0);
  });
}).catch((error) => {
  console.error(error.message);
  shutdown('SIGTERM');
  process.exitCode = 1;
});
