import type { SupabaseClient } from '@supabase/supabase-js';
import type { Asset, AssetMetadata, Project, ProjectSelection } from './composition.ts';

export type CloudEditorState = {
  schemaVersion: 1;
  project: Project;
  assets: AssetMetadata[];
  selection: ProjectSelection;
};

export type CloudProjectSummary = {
  id: string;
  owner_id: string;
  name: string;
  version: number;
  updated_at: string;
};

export type CloudProjectLink = {
  projectId: string;
  ownerId: string;
  version: number;
  stateHash: string;
};

export class CloudProjectConflictError extends Error {
  constructor(message = 'This project changed in the cloud. Reload the cloud copy before saving again.') {
    super(message);
    this.name = 'CloudProjectConflictError';
  }
}

export function makeCloudEditorState(
  project: Project,
  assets: Asset[],
  missingAssets: AssetMetadata[],
  selection: ProjectSelection,
): CloudEditorState {
  const metadataById = new Map<string, AssetMetadata>();
  for (const asset of missingAssets) metadataById.set(asset.id, asset);
  for (const { blob: _blob, thumbnail: _thumbnail, ...metadata } of assets) {
    metadataById.set(metadata.id, metadata);
  }

  return {
    schemaVersion: 1,
    project,
    assets: [...metadataById.values()].map(({ thumbnail: _thumbnail, ...metadata }) => metadata),
    selection,
  };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function cloudMediaReferencesMatch(localAssets: Asset[], cloudAssets: AssetMetadata[]): boolean {
  const cloudById = new Map(cloudAssets.map((asset) => [asset.id, asset]));
  return localAssets.every((asset) => {
    const remote = cloudById.get(asset.id);
    if (!remote) return false;
    const { blob: _blob, thumbnail: _localThumbnail, ...localMetadata } = asset;
    const { thumbnail: _cloudThumbnail, ...cloudMetadata } = remote;
    return canonicalize(localMetadata) === canonicalize(cloudMetadata);
  });
}

export function hashCloudEditorState(state: CloudEditorState): string {
  const serialized = canonicalize(state);
  let hash = 0x811c9dc5;
  let secondHash = 0x9e3779b9;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    hash ^= code;
    hash = Math.imul(hash, 0x01000193);
    secondHash = Math.imul(secondHash ^ (code + index), 0x85ebca6b);
    secondHash ^= secondHash >>> 13;
  }
  return `${(hash >>> 0).toString(16).padStart(8, '0')}${(secondHash >>> 0).toString(16).padStart(8, '0')}`;
}

export function parseCloudEditorState(value: unknown, expectedProjectId: string): CloudEditorState {
  if (!value || typeof value !== 'object') {
    throw new Error('The cloud project has no valid saved editor state.');
  }
  const candidate = value as Partial<CloudEditorState>;
  const project = candidate.project;
  if (
    candidate.schemaVersion !== 1 ||
    !project ||
    project.id !== expectedProjectId ||
    typeof project.name !== 'string' ||
    !Array.isArray(project.tracks) ||
    !Array.isArray(project.clips) ||
    !Array.isArray(candidate.assets) ||
    !candidate.selection ||
    typeof candidate.selection !== 'object'
  ) {
    throw new Error('This cloud project uses an unsupported or incomplete editor-state format.');
  }

  return candidate as CloudEditorState;
}

export async function listCloudProjects(client: SupabaseClient): Promise<CloudProjectSummary[]> {
  const { data, error } = await client
    .from('cutline_projects')
    .select('id, owner_id, name, version, updated_at')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data || []) as CloudProjectSummary[];
}

export async function loadCloudProject(
  client: SupabaseClient,
  projectId: string,
): Promise<{ summary: CloudProjectSummary; state: CloudEditorState }> {
  const { data: summary, error: projectError } = await client
    .from('cutline_projects')
    .select('id, owner_id, name, version, updated_at')
    .eq('id', projectId)
    .single();
  if (projectError) throw projectError;

  const { data: savedState, error: stateError } = await client
    .from('cutline_project_state')
    .select('state')
    .eq('project_id', projectId)
    .maybeSingle();
  if (stateError) throw stateError;
  if (!savedState) throw new Error('This cloud project has no saved editor state yet.');

  return {
    summary: summary as CloudProjectSummary,
    state: parseCloudEditorState(savedState.state, projectId),
  };
}

export async function saveCloudProject(
  client: SupabaseClient,
  state: CloudEditorState,
  expectedVersion: number | null,
): Promise<number> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(state.project.id)) {
    throw new Error('This local project has an unsupported ID format. Use Save As to create a cloud-compatible copy.');
  }
  const { data, error } = await client.rpc('save_cutline_project', {
    p_project_id: state.project.id,
    p_name: state.project.name,
    p_state: state,
    p_expected_version: expectedVersion,
  });
  if (error) {
    if (error.code === '40001' || error.code === '23505') throw new CloudProjectConflictError();
    throw error;
  }
  const version = Number(data);
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error('The cloud save completed without returning a valid project version.');
  }
  return version;
}

export async function deleteCloudProject(client: SupabaseClient, projectId: string): Promise<void> {
  const { error } = await client.from('cutline_projects').delete().eq('id', projectId);
  if (error) throw error;
}
