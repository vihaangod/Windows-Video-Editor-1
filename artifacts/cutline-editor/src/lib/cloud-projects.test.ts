import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  CloudProjectConflictError,
  cloudMediaReferencesMatch,
  deleteCloudProject,
  hashCloudEditorState,
  listCloudProjects,
  loadCloudProject,
  makeCloudEditorState,
  parseCloudEditorState,
  saveCloudProject,
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

test('cloud project list, load, and delete use the existing Supabase project tables', async () => {
  const summary = {
    id: 'b37d6ed4-9edf-46d9-9b28-4d5c7669ab94',
    owner_id: 'cdd4df4b-693b-4d14-9ef5-92a263d83c64',
    name: 'Cloud timeline',
    version: 3,
    updated_at: '2026-10-10T12:00:00.000Z',
  };
  const state = makeCloudEditorState({ ...project, id: summary.id }, [], [], { clipId: null, assetId: null });
  const fromCalls: string[] = [];
  const fakeClient = {
    from(table: string) {
      fromCalls.push(table);
      return {
        select() {
          return {
            order: async () => ({ data: [summary], error: null }),
            eq(_column: string, _value: string) {
              return {
                single: async () => ({ data: summary, error: null }),
                maybeSingle: async () => ({ data: { state }, error: null }),
              };
            },
          };
        },
        delete() {
          return {
            eq: async () => ({ error: null }),
          };
        },
      };
    },
  } as unknown as SupabaseClient;

  assert.deepEqual(await listCloudProjects(fakeClient), [summary]);
  const loaded = await loadCloudProject(fakeClient, summary.id);
  assert.deepEqual(loaded.summary, summary);
  assert.deepEqual(loaded.state, state);
  await deleteCloudProject(fakeClient, summary.id);
  assert.deepEqual(fromCalls, ['cutline_projects', 'cutline_projects', 'cutline_project_state', 'cutline_projects']);
});

test('cloud save uses the existing optimistic-version RPC and surfaces conflicts', async () => {
  const cloudProject = { ...project, id: 'b37d6ed4-9edf-46d9-9b28-4d5c7669ab94' };
  const state = makeCloudEditorState(cloudProject, [], [], { clipId: null, assetId: null });
  let rpcName = '';
  let rpcPayload: Record<string, unknown> | null = null;
  const successfulClient = {
    rpc: async (name: string, payload: Record<string, unknown>) => {
      rpcName = name;
      rpcPayload = payload;
      return { data: 4, error: null };
    },
  } as unknown as SupabaseClient;

  assert.equal(await saveCloudProject(successfulClient, state, 3), 4);
  assert.equal(rpcName, 'save_cutline_project');
  assert.deepEqual(rpcPayload, {
    p_project_id: cloudProject.id,
    p_name: cloudProject.name,
    p_state: state,
    p_expected_version: 3,
  });

  const conflictingClient = {
    rpc: async () => ({ data: null, error: { code: '40001', message: 'version mismatch' } }),
  } as unknown as SupabaseClient;
  await assert.rejects(
    saveCloudProject(conflictingClient, state, 3),
    (error: unknown) => error instanceof CloudProjectConflictError,
  );
});
