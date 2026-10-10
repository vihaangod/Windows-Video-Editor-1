import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getExportFrameCount,
  getExportProgress,
  getExportVideoBitrate,
  getUniqueExportBaseName,
  sanitizeExportBaseName,
} from './export-utils.ts';

test('30, 60, and 120 fps export schedules contain the expected frames', () => {
  for (const frameRate of [30, 60, 120]) {
    assert.equal(getExportFrameCount(10, frameRate), frameRate * 10);
    assert.equal(getExportFrameCount(10 * 60, frameRate), frameRate * 600);
  }
});

test('4K60 keeps its resolution-based bitrate and higher frame rates are not capped at 50 Mbps', () => {
  assert.equal(getExportVideoBitrate(3840, 2160, 60), 39_813_120);
  assert.equal(getExportVideoBitrate(3840, 2160, 120), 79_626_240);
});

test('export progress follows completed frames and waits for finalization before 100%', () => {
  assert.equal(getExportProgress(0, 100), 0);
  assert.equal(getExportProgress(50, 100), 50);
  assert.equal(getExportProgress(100, 100), 99);
});

test('export filenames are safe across Windows and browser download paths', () => {
  assert.equal(sanitizeExportBaseName('  final/cut?.mp4  '), 'final-cut-');
  assert.equal(sanitizeExportBaseName('  .  '), 'cutline-export');
  assert.equal(sanitizeExportBaseName('CON'), '_CON');
  assert.equal(sanitizeExportBaseName('CON.txt'), '_CON.txt');
  assert.equal(sanitizeExportBaseName('clip'.repeat(40)).length, 120);
});

test('export filenames get a unique suffix without silently reusing a recorded name', () => {
  assert.equal(
    getUniqueExportBaseName('edit', 'mp4', ['EDIT.MP4', 'edit-2.mp4']),
    'edit-3',
  );
  assert.equal(getUniqueExportBaseName('edit', 'webm', ['edit.mp4']), 'edit');
});
