const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');

const chromium = process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const testUrl = 'http://localhost:80/tests/audio-export.html';
const timeoutMs = 120_000;

function waitForDevTools(child) {
  return new Promise((resolve, reject) => {
    let stderr = '';
    const timeout = setTimeout(() => reject(new Error('Chromium did not open its DevTools connection.')), 15_000);
    child.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timeout);
      reject(new Error(`Chromium exited before opening DevTools (code ${code ?? 'unknown'}). ${stderr}`));
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
      const endpoint = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/)?.[1];
      if (!endpoint) return;
      clearTimeout(timeout);
      resolve(endpoint);
    });
  });
}

async function getPageTarget(port) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = targets.find((target) => target.type === 'page');
      if (page) return page;
    } catch {
      // DevTools may not accept HTTP requests immediately after it prints its URL.
    }
    await delay(100);
  }
  throw new Error('Chromium did not expose a page target for the audio export check.');
}

function connectDevTools(endpoint) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(endpoint);
    const pending = new Map();
    let sequence = 0;
    socket.addEventListener('open', () => resolve({
      socket,
      send(method, params = {}) {
        return new Promise((sendResolve, sendReject) => {
          const id = ++sequence;
          pending.set(id, { resolve: sendResolve, reject: sendReject });
          socket.send(JSON.stringify({ id, method, params }));
        });
      },
    }), { once: true });
    socket.addEventListener('error', () => reject(new Error('Could not connect to Chromium DevTools.')), { once: true });
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message);
    });
    socket.addEventListener('close', () => {
      for (const request of pending.values()) request.reject(new Error('Chromium DevTools disconnected.'));
      pending.clear();
    });
  });
}

async function run() {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cutline-audio-export-'));
  const child = spawn(chromium, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-extensions',
    '--remote-allow-origins=*',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  let devtools;

  try {
    const browserEndpoint = await waitForDevTools(child);
    const page = await getPageTarget(new URL(browserEndpoint).port);
    devtools = await connectDevTools(page.webSocketDebuggerUrl);
    await devtools.send('Runtime.enable');
    await devtools.send('Page.enable');
    await devtools.send('Page.navigate', { url: testUrl });

    const deadline = Date.now() + timeoutMs;
    let lastResult = '';
    while (Date.now() < deadline) {
      const response = await devtools.send('Runtime.evaluate', {
        expression: 'JSON.stringify({ state: document.documentElement.dataset.result, text: document.querySelector("#result")?.textContent })',
        returnByValue: true,
      });
      lastResult = response.result?.result?.value || '';
      if (lastResult) {
        const result = JSON.parse(lastResult);
        if (result.state === 'pass' || result.state === 'fail') {
          process.stdout.write(`${result.text || 'No encoded export result was returned.'}\n`);
          if (result.state !== 'pass') process.exitCode = 1;
          return;
        }
      }
      await delay(250);
    }

    throw new Error(`Timed out waiting for the encoded export result. Last browser state: ${lastResult || 'page not ready'}`);
  } finally {
    devtools?.socket.close();
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('close', resolve)),
      delay(3_000).then(() => child.kill('SIGKILL')),
    ]);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
