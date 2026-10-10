import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cloudMediaReferencesMatch,
  hashCloudEditorState,
  makeCloudEditorState,
  parseCloudEditorState,
} from './cloud-projects.ts';
import type { Asset, AssetMetadata, Project, ProjectSelection } from './composition.ts';

const project = {
  id: 'project-cloud-test',
  name: 'Cloud timeline',
  width: 1920,
  height: 1080,
  frameRate: 30,
  settings: { backgroundColor: '#101010', audioEnabled: true },
  tracks: [
    { id: 'video-track', name: 'Video 1', kind: 'video', order: 0, muted: false, visible: true, locked: false },
    { id: 'text-track', name: 'Titles', kind: 'text', order: 1, muted: false, visible: true, locked: false },
  ],
  clips: [
    {
      id: 'clip-video',
      assetId: 'media-local',
      trackId: 'video-track',
      timelineStart: 2.5,
      sourceIn: 1,
      sourceOut: 9,
      speed: 1,
      volume: 0.8,
      effects: { brightness: 0.2, contrast: 1.1, enabled: { brightness: true } },
    },
    {
      id: 'clip-title',
      trackId: 'text-track',
      timelineStart: 3,
      sourceIn: 0,
      sourceOut: 4,
      speed: 1,
      volume: 0,
      text: { content: 'A saved title', fontFamily: 'sans-serif', fontSize: 48, color: '#fff' },
    },
  ],
  transitions: [{ id: 'transition-1', fromClipId: 'clip-video', toClipId: 'clip-title', duration: 0.5, type: 'dissolve' }],
  markups: [{ id: 'markup-1', points: [{ x: 10, y: 20 }] }],
  removedAssetIds: [],
  exports: [],
} as unknown as Project;

test('cloud editor state keeps editable project data and excludes local media bytes', () => {
  const localAsset = {
    id: 'media-local',
    name: 'camera.mp4',
    type: 'video/mp4',
    size: 12,
    duration: 8,
    thumbnail: 'data:image/png;base64,local-thumbnail',
    blob: new Blob(['do-not-upload-local-media']),
  } as unknown as Asset;
  const missingAsset = {
    id: 'media-missing',
    name: 'offline.wav',
    type: 'audio/wav',
    size: 20,
    thumbnail: 'data:image/png;base64,missing-thumbnail',
  } as unknown as AssetMetadata;
  const selection: ProjectSelection = { clipId: 'clip-title', assetId: 'media-local' };

  const state = makeCloudEditorState(project, [localAsset], [missingAsset], selection);
  assert.deepEqual(state.project, project);
  assert.deepEqual(state.selection, selection);
  assert.deepEqual(state.project.tracks.map((track) => track.id), ['video-track', 'text-track']);
  assert.deepEqual(state.project.clips.map((clip) => clip.id), ['clip-video', 'clip-title']);
  assert.equal(state.project.transitions[0].id, 'transition-1');
  assert.equal(state.project.clips[1].text?.content, 'A saved title');
  assert.deepEqual(state.assets.map((asset) => asset.id).sort(), ['media-local', 'media-missing']);
  assert.equal('blob' in state.assets[0], false);
  assert.equal('thumbnail' in state.assets[0], false);
  assert.equal('thumbnail' in state.assets[1], false);
  assert.equal(JSON.stringify(state).includes('do-not-upload-local-media'), false);
  assert.equal(JSON.stringify(state).includes('base64,local-thumbnail'), false);
  assert.equal(cloudMediaReferencesMatch([localAsset], state.assets), true);
  assert.equal(cloudMediaReferencesMatch([{ ...localAsset, byteSize: 99 } as Asset], state.assets), false);
});

test('cloud editor state validates the project id and round-trips with a stable hash', () => {
  const selection: ProjectSelection = { clipId: null, assetId: null };
  const state = makeCloudEditorState(project, [], [], selection);
  const parsed = parseCloudEditorState(JSON.parse(JSON.stringify(state)), project.id);

  assert.deepEqual(parsed, state);
  assert.equal(hashCloudEditorState(parsed), hashCloudEditorState(state));
  const reorderedProject = Object.fromEntries(Object.entries(state.project).reverse()) as Project;
  assert.equal(
    hashCloudEditorState({ ...state, project: reorderedProject }),
    hashCloudEditorState(state),
  );
  assert.throws(
    () => parseCloudEditorState({ ...state, project: { ...state.project, id: 'another-project' } }, project.id),
    /unsupported or incomplete/,
  );
  assert.throws(() => parseCloudEditorState(null, project.id), /valid saved editor state/);
});
