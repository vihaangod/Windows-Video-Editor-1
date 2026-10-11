const { spawnSync } = require('node:child_process');

const chromium = process.env.CHROME_BIN || '/repl/tools/bin/chromium';
const result = spawnSync(chromium, [
  '--headless',
  '--no-sandbox',
  '--disable-gpu',
  '--hide-scrollbars',
  '--virtual-time-budget=10000',
  '--dump-dom',
  'http://localhost:80/tests/transition-pixels.html',
], {
  encoding: 'utf8',
  timeout: 60_000,
  maxBuffer: 4 * 1024 * 1024,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  process.stderr.write(result.stderr || '');
  process.exit(result.status || 1);
}

const output = result.stdout;
const state = output.match(/<html[^>]*data-result="(pass|fail|running)"/)?.[1];
const details = output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || 'No browser pixel-check result was returned.';
process.stdout.write(`${details.replaceAll('&quot;', '"').replaceAll('&amp;', '&')}\n`);
if (state !== 'pass') process.exit(1);
