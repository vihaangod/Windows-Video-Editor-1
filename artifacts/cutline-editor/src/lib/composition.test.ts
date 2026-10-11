import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureProjectTimelineTracks, getActiveTimelineFilters, getPreviewCanvasSize, removeAssetReferencesFromProject, renderProjectFrame, restoreProjectSelection, shouldDeferPreviewVideoFrame, type Project } from './composition.ts';

function createContext(width: number, height: number) {
  const calls: Array<{ name: string; args: unknown[] }> = [];
  const context = {
    canvas: { width, height },
    save: () => calls.push({ name: 'save', args: [] }),
    restore: () => calls.push({ name: 'restore', args: [] }),
    setTransform: (...args: number[]) => calls.push({ name: 'setTransform', args }),
    clearRect: (...args: number[]) => calls.push({ name: 'clearRect', args }),
    fillRect: (...args: number[]) => calls.push({ name: 'fillRect', args }),
    measureText: (text: string) => ({ width: text.length * 22 }),
    translate: (...args: number[]) => calls.push({ name: 'translate', args }),
    rotate: (...args: number[]) => calls.push({ name: 'rotate', args }),
    scale: (...args: number[]) => calls.push({ name: 'scale', args }),
    fillText: (...args: unknown[]) => calls.push({ name: 'fillText', args }),
  } as unknown as CanvasRenderingContext2D;

  return { context, calls };
}

function textProject(): Project {
  return {
    id: 'project-1',
    name: 'Overlay test',
    width: 3840,
    height: 2160,
    frameRate: 60,
    tracks: [{ id: 'text-track', name: 'Text 1', kind: 'text', order: 0, muted: false, visible: true, locked: false }],
    clips: [{
      id: 'title-1',
      trackId: 'text-track',
      timelineStart: 0,
      sourceIn: 0,
      sourceOut: 4,
      volume: 0,
      speed: 1,
      text: {
        templateId: 'plain',
        templateName: 'Plain',
        content: 'Independent title layer',
        fontFamily: 'sans-serif',
        fontSize: 72,
        fontWeight: 500,
        color: '#ffffff',
        align: 'center',
        x: .5,
        y: .5,
        backgroundColor: '',
        outlineColor: '#000000',
        outlineWidth: 0,
        shadow: false,
        opacity: 1,
      },
    }],
  };
}

test('preview backing stores preserve 1080p and cap 4K dimensions without changing project settings', () => {
  assert.deepEqual(getPreviewCanvasSize(1920, 1080), { width: 1920, height: 1080 });
  assert.deepEqual(getPreviewCanvasSize(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(getPreviewCanvasSize(3840, 2160, 1280), { width: 1280, height: 720 });
  assert.deepEqual(getPreviewCanvasSize(7680, 4320), { width: 1920, height: 1080 });
  assert.equal(textProject().frameRate, 60);
});

test('legacy projects gain a separate Clip Track without changing saved clip or base-track IDs', () => {
  const original: Project = {
    ...textProject(),
    tracks: [
      { id: 'legacy-video', name: 'Clips', kind: 'video', order: 0, muted: false },
      { id: 'legacy-audio', name: 'Audio 1', kind: 'audio', order: 1, muted: false },
      { id: 'text-track', name: 'Text 1', kind: 'text', order: 2, muted: false },
    ],
  };
  let id = 0;
  const upgraded = ensureProjectTimelineTracks(original, () => `migrated-${++id}`);

  assert.notEqual(upgraded, original);
  assert.deepEqual(upgraded.tracks.map(({ id: trackId, name, kind, order }) => ({ id: trackId, name, kind, order })), [
    { id: 'legacy-video', name: 'Video Track', kind: 'video', order: 0 },
    { id: 'migrated-1', name: 'Clip Track', kind: 'overlay', order: 1 },
    { id: 'legacy-audio', name: 'Audio 1', kind: 'audio', order: 2 },
    { id: 'text-track', name: 'Text 1', kind: 'text', order: 3 },
  ]);
  assert.equal(upgraded.clips, original.clips, 'clip IDs and timeline data are retained');
  assert.equal(ensureProjectTimelineTracks(upgraded), upgraded, 'repeat migration is idempotent');
});

test('preview waits for a decoded video frame instead of clearing to black during a seek', () => {
  assert.equal(shouldDeferPreviewVideoFrame(1, false, 0, 0), true);
  assert.equal(shouldDeferPreviewVideoFrame(2, true, 1, 1), true);
  assert.equal(shouldDeferPreviewVideoFrame(2, false, 1, 1.5), true);
  assert.equal(shouldDeferPreviewVideoFrame(2, false, 1, 1.2), false);
});

test('base and transparent overlay render independently at scaled preview resolution', () => {
  const project = textProject();
  const base = createContext(1920, 1080);
  const overlay = createContext(1920, 1080);

  renderProjectFrame(base.context, project, [], new Map(), 1, true, null, null, undefined, { layer: 'base' });
  renderProjectFrame(overlay.context, project, [], new Map(), 1, true, null, null, undefined, { layer: 'overlay' });

  assert.ok(base.calls.some((call) => call.name === 'fillRect'), 'video base gets an opaque background');
  assert.ok(!base.calls.some((call) => call.name === 'fillText'), 'text is not painted into the video base');
  assert.ok(overlay.calls.some((call) => call.name === 'clearRect'), 'overlay is cleared independently');
  assert.ok(overlay.calls.some((call) => call.name === 'fillText'), 'text is rendered on the transparent overlay');
  assert.ok(overlay.calls.some((call) => call.name === 'setTransform' && call.args[0] === .5 && call.args[3] === .5), '4K project coordinates scale to the preview backing store');
});

test('default rendering still composites text for full-resolution exports', () => {
  const { context, calls } = createContext(3840, 2160);
  renderProjectFrame(context, textProject(), [], new Map(), 1, false);
  assert.ok(calls.some((call) => call.name === 'fillRect'));
  assert.ok(calls.some((call) => call.name === 'fillText'));
});

test('timeline filters activate only inside both their own range and the linked video range', () => {
  const project: Project = {
    id: 'filter-test',
    name: 'Filter timing',
    width: 1920,
    height: 1080,
    frameRate: 30,
    tracks: [
      { id: 'video', name: 'Video 1', kind: 'video', order: 0, muted: false },
      { id: 'effects', name: 'Effects', kind: 'effects', order: 1, muted: false },
    ],
    clips: [
      { id: 'shot', assetId: 'asset-1', trackId: 'video', timelineStart: 2, sourceIn: 0, sourceOut: 4, volume: 1, speed: 1 },
      { id: 'filter', trackId: 'effects', timelineStart: 3, sourceIn: 0, sourceOut: 2, volume: 0, speed: 1, filterEffect: { presetId: 'cinematic', intensity: 75, targetClipId: 'shot' } },
    ],
  };

  assert.deepEqual(getActiveTimelineFilters(project, 'shot', 2.5), []);
  assert.deepEqual(getActiveTimelineFilters(project, 'shot', 3.5), [{ presetId: 'cinematic', intensity: 75, targetClipId: 'shot' }]);
  assert.deepEqual(getActiveTimelineFilters(project, 'shot', 5), []);
  assert.deepEqual(getActiveTimelineFilters(project, 'other-shot', 3.5), []);
});

test('saved selections restore by stable IDs and stale IDs are cleared', () => {
  const project: Project = {
    id: 'selection-test',
    name: 'Selection persistence',
    width: 1920,
    height: 1080,
    frameRate: 30,
    tracks: [{ id: 'video', name: 'Video 1', kind: 'video', order: 0, muted: false }],
    clips: [{ id: 'clip-stable-id', assetId: 'asset-stable-id', trackId: 'video', timelineStart: 0, sourceIn: 0, sourceOut: 2, volume: 1, speed: 1 }],
  };
  const assets = [{ id: 'asset-stable-id' }];

  assert.deepEqual(
    restoreProjectSelection(project, assets, { clipId: 'clip-stable-id', assetId: 'asset-stable-id' }),
    { clipId: 'clip-stable-id', assetId: 'asset-stable-id' },
  );
  assert.deepEqual(
    restoreProjectSelection(project, assets, { clipId: 'deleted-clip', assetId: 'deleted-asset' }),
    { clipId: null, assetId: null },
  );
});

test('removing media clears only its clips and linked effects while preserving unrelated timeline content', () => {
  const project: Project = {
    id: 'removal-test',
    name: 'Safe media removal',
    width: 1920,
    height: 1080,
    frameRate: 30,
    tracks: [
      { id: 'video', name: 'Video 1', kind: 'video', order: 0, muted: false },
      { id: 'audio', name: 'Audio 1', kind: 'audio', order: 1, muted: false },
      { id: 'effects', name: 'Effects 1', kind: 'effects', order: 2, muted: false },
    ],
    clips: [
      { id: 'removed-clip-1', assetId: 'removed-asset', trackId: 'video', timelineStart: 0, sourceIn: 0, sourceOut: 2, volume: 1, speed: 1 },
      { id: 'removed-clip-2', assetId: 'removed-asset', trackId: 'video', timelineStart: 2, sourceIn: 0, sourceOut: 2, volume: 1, speed: 1 },
      { id: 'unrelated-clip', assetId: 'kept-asset', trackId: 'video', timelineStart: 4, sourceIn: 0, sourceOut: 2, volume: 1, speed: 1 },
      { id: 'unrelated-audio', assetId: 'audio-asset', trackId: 'audio', timelineStart: 0, sourceIn: 0, sourceOut: 3, volume: 1, speed: 1, audioOnly: true },
      { id: 'linked-filter', trackId: 'effects', timelineStart: 0, sourceIn: 0, sourceOut: 2, volume: 0, speed: 1, filterEffect: { presetId: 'cinematic', intensity: 50, targetClipId: 'removed-clip-1' } },
    ],
    transitions: [
      { id: 'removed-transition', fromClipId: 'removed-clip-1', toClipId: 'unrelated-clip', type: 'cross-dissolve', duration: 0.5 },
      { id: 'kept-transition', fromClipId: 'unrelated-audio', toClipId: 'unrelated-clip', type: 'wipe', duration: 0.3 },
    ],
  };

  const next = removeAssetReferencesFromProject(project, 'removed-asset');

  assert.deepEqual(next.clips.map((clip) => clip.id), ['unrelated-clip', 'unrelated-audio']);
  assert.deepEqual(next.transitions?.map((transition) => transition.id), ['kept-transition']);
  assert.deepEqual(next.removedAssetIds, ['removed-asset']);
  assert.equal(project.clips.length, 5, 'the original project is unchanged');
});
