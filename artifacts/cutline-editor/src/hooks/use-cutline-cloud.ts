import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import type { Asset, AssetMetadata, Project, ProjectSelection, SavedProject } from '@/lib/composition';
import { supabaseClient } from '@/lib/supabase';
import {
  CloudProjectConflictError, hashCloudEditorState, listCloudProjects, loadCloudProject,
  makeCloudEditorState, saveCloudProject,
  type CloudProjectLink, type CloudProjectSummary,
} from '@/lib/cloud-projects';
import { createSerializedWriteQueue } from '@/lib/save-queue';

export type CloudSaveState = 'off' | 'checking' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict';
type CloudSnapshot = { project: Project; assets: Asset[]; selection: ProjectSelection };
type CloudSaveJob = CloudSnapshot & { ownerId: string; allowRestore: boolean };
type Props = {
  project: Project;
  assets: Asset[];
  selection: ProjectSelection;
  projectHydrated: boolean;
  hasActiveProject: boolean;
  persistLocalSnapshot: (project: Project, assets: Asset[], selection: ProjectSelection) => Promise<void>;
  readLocalProject: (projectId: string) => Promise<SavedProject | null>;
  readLocalCloudLinks: () => Promise<CloudProjectLink[]>;
  readLocalCloudLink: (projectId: string) => Promise<CloudProjectLink | null>;
  writeLocalCloudLink: (link: CloudProjectLink) => Promise<void>;
};

function accountSchemaError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'Supabase request failed.';
  if (/(cutline_projects|cutline_project_state|save_cutline_project)/i.test(message)) {
    return `${message} Apply the Cutline migration in Supabase before syncing projects.`;
  }
  return message;
}

export function useCutlineCloud({
  project,
  assets,
  selection,
  projectHydrated,
  hasActiveProject,
  persistLocalSnapshot,
  readLocalProject,
  readLocalCloudLinks,
  readLocalCloudLink,
  writeLocalCloudLink,
}: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(Boolean(supabaseClient));
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [cloudLinks, setCloudLinks] = useState<Record<string, CloudProjectLink>>({});
  const [cloudReady, setCloudReady] = useState(false);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudSaveState, setCloudSaveState] = useState<CloudSaveState>(supabaseClient ? 'checking' : 'off');
  const [cloudError, setCloudError] = useState('');
  const [cloudBusyProjectId, setCloudBusyProjectId] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveRevision = useRef(0);
  const activeProjectIdRef = useRef(project.id);
  const sessionRef = useRef<Session | null>(null);
  const cloudProjectsRef = useRef<CloudProjectSummary[]>([]);
  const cloudLinksRef = useRef<Record<string, CloudProjectLink>>({});
  const saveWorkerRef = useRef<(job: CloudSaveJob) => Promise<CloudProjectLink>>(async () => {
    throw new Error('Cloud save queue is unavailable.');
  });
  const saveQueue = useRef<((job: CloudSaveJob) => Promise<void>) | null>(null);

  sessionRef.current = session;
  activeProjectIdRef.current = project.id;
  cloudProjectsRef.current = cloudProjects;
  cloudLinksRef.current = cloudLinks;
  if (!saveQueue.current) {
    saveQueue.current = createSerializedWriteQueue(async (job) => {
      await saveWorkerRef.current(job);
    });
  }

  const refreshCloudProjects = useCallback(async () => {
    if (!supabaseClient || !sessionRef.current) return;
    setCloudLoading(true);
    setCloudError('');
    try {
      const [projects, links] = await Promise.all([listCloudProjects(supabaseClient), readLocalCloudLinks()]);
      const nextLinks = Object.fromEntries(links.map((link) => [link.projectId, link]));
      setCloudProjects(projects);
      setCloudLinks(nextLinks);
      setCloudReady(true);
      return projects;
    } catch (error) {
      const message = accountSchemaError(error);
      setCloudError(message);
      setCloudReady(true);
      throw error;
    } finally {
      setCloudLoading(false);
    }
  }, [readLocalCloudLinks]);

  useEffect(() => {
    if (!supabaseClient) {
      setAuthLoading(false);
      setCloudReady(true);
      setCloudSaveState('off');
      return;
    }

    let active = true;
    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession);
      if (!nextSession) {
        setCloudProjects([]);
        setCloudLinks({});
        setCloudReady(true);
        setCloudSaveState('off');
        setCloudError('');
      }
    });

    void supabaseClient.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) setCloudError(error.message);
      setSession(data.session);
      setAuthLoading(false);
    }).catch((error: unknown) => {
      if (!active) return;
      setCloudError(accountSchemaError(error));
      setAuthLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const userId = session?.user.id;
    if (!userId) {
      setCloudProjects([]);
      setCloudLinks({});
      setCloudReady(true);
      setCloudLoading(false);
      setCloudSaveState('off');
      return;
    }

    let active = true;
    setCloudProjects([]);
    setCloudLinks({});
    setCloudReady(false);
    setCloudSaveState('checking');
    setCloudError('');
    setCloudLoading(true);
    void Promise.all([listCloudProjects(supabaseClient!), readLocalCloudLinks()])
      .then(([projects, links]) => {
        if (!active) return;
        setCloudProjects(projects);
        setCloudLinks(Object.fromEntries(links.map((link) => [link.projectId, link])));
        setCloudReady(true);
      })
      .catch((error: unknown) => {
        if (!active) return;
        setCloudError(accountSchemaError(error));
        setCloudReady(true);
      })
      .finally(() => {
        if (active) setCloudLoading(false);
      });
    return () => { active = false; };
  }, [session?.user.id, readLocalCloudLinks]);

  saveWorkerRef.current = async (job) => {
    if (!supabaseClient) throw new Error('Supabase is not configured.');
    const { data: { session: currentSession }, error: sessionError } = await supabaseClient.auth.getSession();
    if (sessionError) throw sessionError;
    if (!currentSession || currentSession.user.id !== job.ownerId) {
      throw new Error('The account changed before this cloud save started. The local copy is still available.');
    }

    await persistLocalSnapshot(job.project, job.assets, job.selection);
    const localRecord = await readLocalProject(job.project.id);
    const physicalAssetIds = new Set(job.assets.map((asset) => asset.id));
    const missingMetadata = (localRecord?.assets || []).filter((asset) => !physicalAssetIds.has(asset.id));
    const state = makeCloudEditorState(job.project, job.assets, missingMetadata, job.selection);
    const stateHash = hashCloudEditorState(state);
    const link = await readLocalCloudLink(job.project.id);
    const remote = cloudProjectsRef.current.find((entry) => entry.id === job.project.id);

    if (link && link.ownerId !== job.ownerId) {
      throw new CloudProjectConflictError('This local project is linked to another Cutline account. It was kept local and was not uploaded.');
    }
    if (!link && remote) {
      throw new CloudProjectConflictError('A cloud project with this ID already exists. Open its cloud copy before linking local data.');
    }
    if (link && !remote && !job.allowRestore) {
      throw new CloudProjectConflictError('The cloud project is no longer available. Local changes are safe; use the explicit cloud restore action to upload again.');
    }
    if (link && remote && remote.version !== link.version) {
      throw new CloudProjectConflictError();
    }
    if (link && remote && link.stateHash === stateHash && remote.version === link.version) {
      return link;
    }

    const version = await saveCloudProject(supabaseClient, state, link && remote ? link.version : null);
    const nextLink: CloudProjectLink = { projectId: job.project.id, ownerId: job.ownerId, version, stateHash };
    await writeLocalCloudLink(nextLink);
    setCloudLinks((current) => ({ ...current, [nextLink.projectId]: nextLink }));
    const updatedAt = new Date().toISOString();
    setCloudProjects((current) => {
      const summary: CloudProjectSummary = {
        id: nextLink.projectId,
        owner_id: job.ownerId,
        name: state.project.name,
        version,
        updated_at: updatedAt,
      };
      return [summary, ...current.filter((item) => item.id !== summary.id)];
    });
    return nextLink;
  };

  const saveCloudSnapshot = useCallback(async (
    snapshot: CloudSnapshot = { project, assets, selection },
    options: { allowRestore?: boolean } = {},
  ) => {
    const ownerId = sessionRef.current?.user.id;
    if (!supabaseClient || !ownerId) throw new Error('Sign in to save projects to the cloud.');
    const job: CloudSaveJob = { ...snapshot, ownerId, allowRestore: options.allowRestore === true };
    const isActiveProject = snapshot.project.id === activeProjectIdRef.current;
    const revision = isActiveProject ? ++saveRevision.current : null;
    if (isActiveProject) {
      setCloudSaveState('saving');
      setCloudError('');
    }
    try {
      await saveQueue.current!(job);
      if (isActiveProject && sessionRef.current?.user.id === ownerId && revision === saveRevision.current) {
        setCloudSaveState('saved');
        setCloudError('');
      }
      return;
    } catch (error) {
      if (isActiveProject && sessionRef.current?.user.id === ownerId && revision === saveRevision.current) {
        setCloudSaveState(error instanceof CloudProjectConflictError ? 'conflict' : 'error');
        setCloudError(accountSchemaError(error));
      }
      throw error;
    }
  }, [assets, project, selection]);

  useEffect(() => {
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    saveTimer.current = undefined;
    ++saveRevision.current;
    const ownerId = session?.user.id;
    if (!ownerId || !projectHydrated || !hasActiveProject || !cloudReady) {
      if (!ownerId) setCloudSaveState('off');
      return;
    }

    setCloudSaveState('dirty');
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      void saveCloudSnapshot({ project, assets, selection }).catch(() => undefined);
    }, 600);
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
      }
    };
  }, [project, assets, selection, projectHydrated, hasActiveProject, session?.user.id, cloudReady, saveCloudSnapshot]);

  const flushCloudSave = useCallback(async () => {
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    if (!sessionRef.current || !projectHydrated || !hasActiveProject || !cloudReady) return;
    await saveCloudSnapshot({ project, assets, selection });
  }, [assets, project, selection, projectHydrated, hasActiveProject, cloudReady, saveCloudSnapshot]);

  const fetchCloudProject = useCallback(async (projectId: string) => {
    if (!supabaseClient || !sessionRef.current) throw new Error('Sign in to open a cloud project.');
    return loadCloudProject(supabaseClient, projectId);
  }, []);

  const removeCloudProject = useCallback(async (projectId: string) => {
    if (!supabaseClient || !sessionRef.current) throw new Error('Sign in to delete a cloud project.');
    const { error } = await supabaseClient.from('cutline_projects').delete().eq('id', projectId);
    if (error) throw error;
    setCloudProjects((current) => current.filter((item) => item.id !== projectId));
    if (projectId === activeProjectIdRef.current) {
      setCloudSaveState('conflict');
      setCloudError('The cloud copy was deleted. Your local project and media are safe; use Restore from the local project list to upload it again.');
    }
  }, []);

  return {
    session,
    authLoading,
    cloudProjects,
    cloudLinks,
    cloudReady,
    cloudLoading,
    cloudSaveState,
    cloudError,
    cloudBusyProjectId,
    setCloudBusyProjectId,
    refreshCloudProjects,
    saveCloudSnapshot,
    flushCloudSave,
    fetchCloudProject,
    removeCloudProject,
  };
}
