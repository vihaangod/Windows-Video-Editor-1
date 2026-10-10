const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  createNativeMediaDescriptor,
  confirmMediaRemoval,
  createContentSecurityPolicy,
  createMediaRemovalDialogOptions,
  getSupabaseConnectSources,
  getMediaContentType,
  normalizeMediaRemovalRequest,
  resolveRendererFile,
  SUPPORTED_MEDIA_EXTENSIONS,
} = require('./security-utils.cjs');

test('desktop content policy permits only the configured Supabase origin and its realtime socket', () => {
  assert.deepEqual(getSupabaseConnectSources('https://cutline-project.supabase.co'), [
    'https://cutline-project.supabase.co',
    'wss://cutline-project.supabase.co',
  ]);
  const policy = createContentSecurityPolicy('https://cutline-project.supabase.co');
  assert.match(policy, /connect-src 'self' blob: https:\/\/cutline-project\.supabase\.co wss:\/\/cutline-project\.supabase\.co/);
  assert.doesNotMatch(policy, /connect-src[^;]*https: /);
  assert.deepEqual(getSupabaseConnectSources('https://cutline-project.supabase.co/path'), []);
  assert.deepEqual(getSupabaseConnectSources('javascript:alert(1)'), []);
  assert.deepEqual(getSupabaseConnectSources(''), []);
});

test('native media descriptors expose safe metadata without changing the selected source file', (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cutline-electron-media-'));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mediaPath = path.join(root, 'source.MP4');
  fs.writeFileSync(mediaPath, Buffer.from('video data'));

  const descriptor = createNativeMediaDescriptor(mediaPath, '12345678-1234-4234-8234-123456789abc');
  assert.deepEqual({
    name: descriptor.fileName,
    mimeType: descriptor.mimeType,
    byteSize: descriptor.byteSize,
  }, {
    name: 'source.MP4',
    mimeType: 'video/mp4',
    byteSize: 10,
  });
  assert.equal(fs.readFileSync(mediaPath, 'utf8'), 'video data');
  assert.equal(getMediaContentType('still.AVIF'), 'image/avif');
  assert.ok(SUPPORTED_MEDIA_EXTENSIONS.includes('mkv'));
  assert.equal(createNativeMediaDescriptor(mediaPath, 'invalid-token'), null);
  assert.equal(createNativeMediaDescriptor(path.join(root, 'missing.mp4'), '12345678-1234-4234-8234-123456789abc'), null);
  assert.equal(createNativeMediaDescriptor(root, '12345678-1234-4234-8234-123456789abc'), null);
});

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
