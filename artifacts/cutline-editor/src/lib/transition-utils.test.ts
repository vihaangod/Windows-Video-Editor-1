import assert from 'node:assert/strict';
import test from 'node:test';
import type { Project } from './composition.ts';
import { getTransitionDirection, getTransitionMode, getTransitionTimelineRange } from './transition-utils.ts';

function createProject(): Project {
  return {
    id: 'transition-test',
    name: 'Transition geometry',
    width: 1080,
    height: 1920,
    frameRate: 30,
    tracks: [{ id: 'clips', name: 'Clips', kind: 'video', order: 0, muted: false }],
    clips: [
      { id: 'clip-a', assetId: 'asset-a', trackId: 'clips', timelineStart: 0, sourceIn: 0, sourceOut: 2, volume: 1, speed: 1 },
      { id: 'clip-b', assetId: 'asset-b', trackId: 'clips', timelineStart: 2, sourceIn: 0, sourceOut: 4, volume: 1, speed: 1 },
    ],
  };
}

test('legacy transitions keep between-clip timing and default direction', () => {
  const project = createProject();
  const transition = { id: 'legacy', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'wipe' as const, duration: 1 };

  assert.equal(getTransitionMode(transition), 'between');
  assert.equal(getTransitionDirection(transition), 'right');
  assert.deepEqual(getTransitionTimelineRange(project, transition), {
    start: 1.5,
    end: 2.5,
    duration: 1,
    anchor: 2,
    mode: 'between',
    clipIds: ['clip-a', 'clip-b'],
  });
});

test('between-clip duration cannot exceed the shorter adjacent clip', () => {
  const project = createProject();
  const transition = { id: 'long', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'cross-dissolve' as const, duration: 3 };
  const range = getTransitionTimelineRange(project, transition);

  assert.equal(range?.duration, 2);
  assert.equal(range?.start, 1);
  assert.equal(range?.end, 3);
});

test('transitions cannot stack on the same clip edge and clamp at opposite edges', () => {
  const project = createProject();
  const between = { id: 'between', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'wipe' as const, duration: 2 };
  const entranceOnB = {
    id: 'entrance-on-b',
    fromClipId: 'clip-b',
    toClipId: 'clip-b',
    targetClipId: 'clip-b',
    mode: 'entrance' as const,
    type: 'fade' as const,
    duration: .5,
  };
  project.transitions = [between, entranceOnB];
  assert.equal(getTransitionTimelineRange(project, between), null);
  assert.equal(getTransitionTimelineRange(project, entranceOnB), null);

  const entranceOnA = { ...entranceOnB, id: 'entrance-on-a', fromClipId: 'clip-a', toClipId: 'clip-a', targetClipId: 'clip-a', duration: 2 };
  project.transitions = [between, entranceOnA];
  assert.equal(getTransitionTimelineRange(project, entranceOnA)?.duration, 1);
  assert.equal(getTransitionTimelineRange(project, between)?.duration, 1);
});

test('entrance and exit transitions attach to clip edges and clamp to the available length', () => {
  const project = createProject();
  const entrance = {
    id: 'intro',
    fromClipId: 'clip-a',
    toClipId: 'clip-a',
    targetClipId: 'clip-a',
    mode: 'entrance' as const,
    type: 'fade' as const,
    duration: 8,
  };
  const exit = {
    id: 'outro',
    fromClipId: 'clip-a',
    toClipId: 'clip-a',
    targetClipId: 'clip-a',
    mode: 'exit' as const,
    type: 'slide' as const,
    direction: 'up' as const,
    duration: 1.5,
  };
  project.transitions = [entrance, exit];

  assert.deepEqual(getTransitionTimelineRange(project, entrance), {
    start: 0,
    end: 1,
    duration: 1,
    anchor: 0,
    mode: 'entrance',
    clipIds: ['clip-a'],
  });
  assert.deepEqual(getTransitionTimelineRange(project, exit), {
    start: 1,
    end: 2,
    duration: 1,
    anchor: 2,
    mode: 'exit',
    clipIds: ['clip-a'],
  });
  assert.equal(getTransitionDirection(exit), 'up');
});

test('transitions are rejected when the clip pair is separated or the target is not on a video track', () => {
  const project = createProject();
  const between = { id: 'between', fromClipId: 'clip-a', toClipId: 'clip-b', type: 'cross-dissolve' as const, duration: 1 };
  project.clips[1].timelineStart = 2.2;
  assert.equal(getTransitionTimelineRange(project, between), null);

  project.tracks[0].kind = 'audio';
  const entrance = { id: 'entrance', fromClipId: 'clip-a', toClipId: 'clip-a', mode: 'entrance' as const, type: 'fade' as const, duration: .5 };
  assert.equal(getTransitionTimelineRange(project, entrance), null);
});
