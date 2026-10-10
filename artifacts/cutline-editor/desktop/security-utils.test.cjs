const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  confirmMediaRemoval,
  createMediaRemovalDialogOptions,
  normalizeMediaRemovalRequest,
  resolveRendererFile,
} = require('./security-utils.cjs');

test('media-removal confirmation defaults to Cancel and explains project-only changes', () => {
  const options = createMediaRemovalDialogOptions({ fileName: 'clip.mp4', clipCount: 2 });
  assert.equal(options.defaultId, 0);
  assert.equal(options.cancelId, 0);
  assert.deepEqual(options.buttons, ['Cancel', 'Remove media']);
  assert.match(options.message, /clip\.mp4/);
  assert.match(options.detail, /2 timeline clips/);
  assert.match(options.detail, /original source file .* will not be deleted/);
});

test('native confirmation only authorizes removal when the explicit Remove button is chosen', async () => {
  const optionsSeen = [];
  assert.equal(await confirmMediaRemoval(async (options) => {
    optionsSeen.push(options);
    return { response: 0 };
  }, null, { fileName: 'clip.mp4', clipCount: 1 }), false);
  assert.equal(await confirmMediaRemoval(async (_parent, options) => {
    optionsSeen.push(options);
    return { response: 1 };
  }, { id: 'window' }, { fileName: 'clip.mp4', clipCount: 1 }), true);
  assert.equal(optionsSeen.length, 2);
});

test('invalid removal requests are rejected and display names are bounded and sanitized', () => {
  assert.equal(normalizeMediaRemovalRequest(null), null);
  assert.equal(normalizeMediaRemovalRequest({ fileName: 'clip.mp4', clipCount: -1 }), null);
  assert.equal(normalizeMediaRemovalRequest({ fileName: 'clip.mp4', clipCount: 1.5 }), null);
  const safe = normalizeMediaRemovalRequest({ fileName: `  clip\n${'a'.repeat(140)} `, clipCount: 0 });
  assert.equal(safe.fileName.length, 120);
  assert.ok(!/[\r\n]/.test(safe.fileName));
});

test('renderer protocol serves app files, falls back to index, and rejects other origins or path escapes', (context) => {
  const rendererRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cutline-electron-protocol-'));
  context.after(() => fs.rmSync(rendererRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(rendererRoot, 'assets'));
  fs.writeFileSync(path.join(rendererRoot, 'index.html'), '<main>Cutline</main>');
  fs.writeFileSync(path.join(rendererRoot, 'assets', 'app.js'), 'console.log(\"Cutline\")');

  assert.equal(resolveRendererFile(rendererRoot, 'cutline://editor/assets/app.js'), path.join(rendererRoot, 'assets', 'app.js'));
  assert.equal(resolveRendererFile(rendererRoot, 'cutline://editor/projects'), path.join(rendererRoot, 'index.html'));
  assert.equal(resolveRendererFile(rendererRoot, 'https://example.com/index.html'), null);
  assert.equal(resolveRendererFile(rendererRoot, 'cutline://editor/%2e%2e%2fsecret'), null);
});
