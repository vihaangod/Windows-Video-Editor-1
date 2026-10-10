import { type DragEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, ArrowDown, ArrowUp, AudioLines, Check, CircleAlert, Clapperboard,
  Copy, Download, Eye, EyeOff, FileAudio, FileImage, FilePlus2, Film, FolderOpen, Grid2X2,
  Folder, FolderInput, HardDrive, Info, Layers2, LockKeyhole, Magnet, Minus, Music2, Pause, Pencil, Play, Plus, Redo2,
  RefreshCw, Search, SlidersHorizontal, SkipBack, SkipForward, Sparkles, Split,
  Trash2, Type, Undo2, UnlockKeyhole, Upload, Volume2, VolumeX, WandSparkles,
} from 'lucide-react';
import {
  ALL_FORMATS, BlobSource, BufferTarget, CanvasSource, Input, MediaStreamAudioTrackSource, Mp4OutputFormat,
  Output, Quality, StreamTarget, WebMOutputFormat, canEncode,
  type StreamTargetChunk,
} from 'mediabunny';
import NotFound from '@/pages/not-found';
import ContextMenu, { type ContextMenuItem } from '@/components/ContextMenu';
import CutlineSelect from '@/components/CutlineSelect';
import EffectWorkspace from '@/components/EffectWorkspace';
import InspectorPanel from '@/components/InspectorPanel';
import MarkupWorkspace from '@/components/MarkupWorkspace';
import TitleTemplatesPanel, { type TitleTemplate } from '@/components/TitleTemplatesPanel';
import {
  createProjectRenderIndex, DEFAULT_EFFECTS, DEFAULT_TRANSFORM, getAudioFade, getClipDuration,
  getTextOverlayBounds, renderProjectFrame, type Asset, type AssetMetadata, type Clip, type ClipEffects,
  getPreviewCanvasSize, type ClipTransform, type ClipTransition, type MarkupDrawing, type MarkupTool, type Project, type ProjectFolder, type SavedProject, type TextOverlay, type Track, type TrackKind,
} from '@/lib/composition';
import {
  getExportFrameCount,
  getExportProgress,
  getExportVideoBitrate,
  getUniqueExportBaseName,
  sanitizeExportBaseName,
} from '@/lib/export-utils';
import { getProjectFolderNameError, getProjectNameError, MAX_PROJECT_FOLDERS } from '@/lib/project-library-utils';
import { createSerializedWriteQueue, retryWrite } from '@/lib/save-queue';
import cutlineAppIcon from '@/assets/cutline-app-icon.svg';
import {
  adjustTimelineZoom, formatTimelineTick, getPlaybackDeltaSeconds, getTimelineEnd, getTimelineRuler,
  MAX_TIMELINE_ZOOM, MIN_TIMELINE_ZOOM,
} from '@/lib/timeline-geometry';
import { Route, Switch, Router as WouterRouter } from 'wouter';

type Notice = { message: string; error?: boolean };
const DB_NAME = 'cutline-local-editor-v1';
const DB_VERSION = 4;
const LEGACY_STORE = 'projects';
const PROJECT_STORE = 'project-meta';
const MEDIA_STORE = 'project-media';
const MEDIA_BLOB_STORE = 'media-blobs';
const FOLDER_STORE = 'project-folders';
type StoredMediaRecord = { key: string; projectId: string; asset: AssetMetadata; blobId: string };
type StoredMediaBlob = { id: string; blob: Blob };
type WritableFile = {
  write: (chunk: { type: 'write'; position: number; data: Uint8Array }) => Promise<void>;
  close: () => Promise<void>;
  abort: (reason?: unknown) => Promise<void>;
};
type WritableFileHandle = { createWritable: () => Promise<unknown>; name?: string };
type WritableDirectoryHandle = {
  name: string;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<WritableFileHandle>;
  queryPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
  requestPermission?: (options: { mode: 'readwrite' }) => Promise<PermissionState>;
};
type FileAccessWindow = Window & {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: Array<{ description: string; accept: Record<string, string[]> }>;
  }) => Promise<WritableFileHandle>;
  showDirectoryPicker?: (options: { mode: 'readwrite' }) => Promise<WritableDirectoryHandle>;
};
const DEFAULT_TRACKS: Track[] = [
  { id: 'video-1', name: 'Video 1', kind: 'video', order: 0, muted: false, visible: true, locked: false },
  { id: 'audio-1', name: 'Audio 1', kind: 'audio', order: 1, muted: false, visible: true, locked: false },
  { id: 'text-1', name: 'Text 1', kind: 'text', order: 2, muted: false, visible: true, locked: false },
];
const TRACK_LABEL_WIDTH = 198;
const AUTOSAVE_DELAY_MS = 500;
const CANVAS_ASPECTS = [
  { id: 'landscape', label: 'Landscape · 16:9', width: 1920, height: 1080 },
  { id: 'shorts', label: 'Shorts · 9:16', width: 1080, height: 1920 },
  { id: 'square', label: 'Square · 1:1', width: 1080, height: 1080 },
  { id: 'portrait', label: 'Instagram portrait · 4:5', width: 1080, height: 1350 },
] as const;
const CANVAS_SIZES = [
  { value: '3840x2160', label: '3840 × 2160 · 4K' },
  { value: '2560x1440', label: '2560 × 1440 · 1440p' },
  { value: '1920x1080', label: '1920 × 1080 · 1080p' },
  { value: '1280x720', label: '1280 × 720 · 720p' },
  { value: '854x480', label: '854 × 480 · 480p' },
  { value: '1080x1920', label: '1080 × 1920 · Shorts' },
  { value: '1080x1080', label: '1080 × 1080 · Square' },
  { value: '1080x1350', label: '1080 × 1350 · 4:5 portrait' },
] as const;
const getCanvasAspectId = (width: number, height: number) => {
  const ratio = width / Math.max(1, height);
  return CANVAS_ASPECTS.find((preset) => Math.abs(ratio - preset.width / preset.height) < .012)?.id || 'custom';
};
const getCanvasSizeValue = (width: number, height: number) => {
  const value = `${width}x${height}`;
  return CANVAS_SIZES.some((preset) => preset.value === value) ? value : 'custom';
};
type LibraryWorkspace = 'media' | 'audio' | 'overlays' | 'text' | 'effects' | 'transitions' | 'filters' | 'markup' | 'templates';
type SaveState = 'saved' | 'dirty' | 'saving' | 'error';
type ProjectSaveSnapshot = { project: Project; assets: Asset[] };
type MarkupToolMode = MarkupTool | 'eraser';
type ContextTarget = { kind: 'empty' | 'media' | 'project' | 'clip'; id?: string; x: number; y: number };
type ClipPatch = Omit<Partial<Clip>, 'transform' | 'effects' | 'text'> & {
  transform?: Partial<ClipTransform>;
  effects?: Partial<ClipEffects>;
  text?: Partial<TextOverlay>;
};
type TextPointerDrag = {
  clipId: string;
  pointerId: number;
  mode: 'move' | 'scale' | 'rotate';
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  startDistance: number;
  startAngle: number;
  initialTransform: ClipTransform;
  initialProject: Project;
};
type MarkupPointerDrag = {
  pointerId: number;
  drawing: MarkupDrawing;
  initialProject: Project;
};
const WORKSPACE_ITEMS: Array<{ id: LibraryWorkspace; label: string; icon: ReactNode }> = [
  { id: 'media', label: 'Media', icon: <Film size={16} /> },
  { id: 'audio', label: 'Audio', icon: <Music2 size={16} /> },
  { id: 'text', label: 'Text', icon: <Type size={16} /> },
  { id: 'overlays', label: 'Overlays', icon: <Layers2 size={16} /> },
  { id: 'effects', label: 'Effects', icon: <WandSparkles size={16} /> },
  { id: 'transitions', label: 'Transitions', icon: <Sparkles size={16} /> },
  { id: 'filters', label: 'Filters', icon: <SlidersHorizontal size={16} /> },
  { id: 'markup', label: 'Markup', icon: <Pencil size={16} /> },
  { id: 'templates', label: 'Templates', icon: <Grid2X2 size={16} /> },
];
const createProject = (name = 'New Project 1', folderId: string | null = null): Project => ({
  id: crypto.randomUUID(), name, folderId, width: 1920, height: 1080, frameRate: 30,
  tracks: DEFAULT_TRACKS.map((track) => ({ ...track, id: crypto.randomUUID() })), clips: [],
});
const nextProjectName = (projects: SavedProject[]) => {
  const names = new Set(projects.map((record) => record.project.name.trim().toLowerCase()));
  let number = 1;
  while (names.has(`new project ${number}`)) number += 1;
  return `New Project ${number}`;
};
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const transaction = request.transaction;
      const projects = db.objectStoreNames.contains(PROJECT_STORE)
        ? transaction!.objectStore(PROJECT_STORE)
        : db.createObjectStore(PROJECT_STORE, { keyPath: 'project.id' });
      const media = db.objectStoreNames.contains(MEDIA_STORE)
        ? transaction!.objectStore(MEDIA_STORE)
        : db.createObjectStore(MEDIA_STORE, { keyPath: 'key' });
      const mediaBlobs = db.objectStoreNames.contains(MEDIA_BLOB_STORE)
        ? transaction!.objectStore(MEDIA_BLOB_STORE)
        : db.createObjectStore(MEDIA_BLOB_STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FOLDER_STORE)) db.createObjectStore(FOLDER_STORE, { keyPath: 'id' });
      if (!media.indexNames.contains('projectId')) media.createIndex('projectId', 'projectId', { unique: false });
      if (!media.indexNames.contains('blobId')) media.createIndex('blobId', 'blobId', { unique: false });
      if (event.oldVersion < 4) {
        const existingMedia = media.openCursor();
        existingMedia.onsuccess = () => {
          const cursor = existingMedia.result;
          if (!cursor) return;
          const record = cursor.value as { key: string; projectId: string; asset?: Asset; blobId?: string };
          if (!record.blobId && record.asset?.blob) {
            const blobId = `legacy:${record.key}`;
            const { blob, ...metadata } = record.asset;
            mediaBlobs.put({ id: blobId, blob });
            cursor.update({ ...record, asset: metadata, blobId });
          }
          cursor.continue();
        };
      }
      if (event.oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
        const cursorRequest = transaction!.objectStore(LEGACY_STORE).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const legacy = cursor.value as { project: Project; assets?: Asset[]; savedAt: number };
          if (legacy.project) {
            projects.put({ project: legacy.project, assets: (legacy.assets || []).map(({ blob: _blob, ...asset }) => asset), savedAt: legacy.savedAt || Date.now() });
            for (const asset of legacy.assets || []) {
              const key = `${legacy.project.id}:${asset.id}`;
              const blobId = `legacy:${key}`;
              const { blob, ...metadata } = asset;
              media.put({ key, projectId: legacy.project.id, asset: metadata, blobId });
              mediaBlobs.put({ id: blobId, blob });
            }
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function saveLocalProject(project: Project, assets: Asset[]) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(PROJECT_STORE, 'readwrite');
    const metadata: SavedProject = {
      project,
      assets: assets.map(({ blob: _blob, ...asset }) => asset),
      savedAt: Date.now(),
    };
    tx.objectStore(PROJECT_STORE).put(metadata);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Project save transaction was aborted.')); };
  });
}
async function saveLocalMedia(projectId: string, assets: Asset[]) {
  if (!assets.length) return;
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MEDIA_STORE, MEDIA_BLOB_STORE], 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const blobs = tx.objectStore(MEDIA_BLOB_STORE);
    for (const asset of assets) {
      const key = `${projectId}:${asset.id}`;
      const existingRequest = store.get(key);
      existingRequest.onsuccess = () => {
        const existing = existingRequest.result as StoredMediaRecord | undefined;
        const { blob, ...metadata } = asset;
        if (existing?.blobId) {
          store.put({ key, projectId, asset: metadata, blobId: existing.blobId });
          return;
        }
        const blobId = `${key}:${uid()}`;
        blobs.put({ id: blobId, blob });
        store.put({ key, projectId, asset: metadata, blobId });
      };
    }
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Media save transaction was aborted.')); };
  });
}
async function replaceLocalMedia(projectId: string, asset: Asset) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MEDIA_STORE, MEDIA_BLOB_STORE], 'readwrite');
    const media = tx.objectStore(MEDIA_STORE);
    const blobs = tx.objectStore(MEDIA_BLOB_STORE);
    const key = `${projectId}:${asset.id}`;
    const previousRequest = media.get(key);
    previousRequest.onsuccess = () => {
      const previous = previousRequest.result as StoredMediaRecord | undefined;
      const blobId = `${key}:replacement:${uid()}`;
      const { blob, ...metadata } = asset;
      blobs.put({ id: blobId, blob });
      media.put({ key, projectId, asset: metadata, blobId });
      if (previous?.blobId) {
        const remaining = media.index('blobId').count(previous.blobId);
        remaining.onsuccess = () => {
          if (remaining.result === 0) blobs.delete(previous.blobId);
        };
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Media replacement transaction was aborted.')); };
  });
}
async function copyLocalMedia(sourceProjectId: string, destinationProjectId: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const request = store.index('projectId').getAll(sourceProjectId);
    request.onsuccess = () => {
      for (const record of request.result as StoredMediaRecord[]) {
        if (!record.blobId) {
          tx.abort();
          return;
        }
        const key = `${destinationProjectId}:${record.asset.id}`;
        store.put({ ...record, key, projectId: destinationProjectId });
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Media references could not be copied.')); };
  });
}
async function copyLocalMediaAsset(
  sourceProjectId: string,
  sourceAssetId: string,
  destinationProjectId: string,
  destinationAsset: Asset,
) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    const sourceRequest = store.get(`${sourceProjectId}:${sourceAssetId}`);
    sourceRequest.onsuccess = () => {
      const source = sourceRequest.result as StoredMediaRecord | undefined;
      if (!source?.blobId) {
        tx.abort();
        return;
      }
      const key = `${destinationProjectId}:${destinationAsset.id}`;
      const { blob: _blob, ...metadata } = destinationAsset;
      store.put({ key, projectId: destinationProjectId, asset: metadata, blobId: source.blobId });
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('The media file could not be shared.')); };
  });
}
async function readLocalProjects(): Promise<SavedProject[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction(PROJECT_STORE, 'readonly').objectStore(PROJECT_STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as SavedProject[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function readLocalFolders(): Promise<ProjectFolder[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction(FOLDER_STORE, 'readonly').objectStore(FOLDER_STORE).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as ProjectFolder[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
async function createLocalFolder(folder: ProjectFolder) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDER_STORE, 'readwrite');
    const store = tx.objectStore(FOLDER_STORE);
    let validationError: Error | null = null;
    const request = store.getAll();
    request.onsuccess = () => {
      const folders = request.result as ProjectFolder[];
      if (folders.length >= MAX_PROJECT_FOLDERS) {
        validationError = new Error('Folder limit reached. Rename or delete a folder before creating another.');
        tx.abort();
        return;
      }
      const nameError = getProjectFolderNameError(folder.name, folders);
      if (nameError) {
        validationError = new Error(nameError);
        tx.abort();
        return;
      }
      store.add(folder);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => {
      db.close();
      reject(validationError || tx.error || new Error('Folder creation was aborted.'));
    };
  });
}
async function renameLocalFolder(folder: ProjectFolder) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(FOLDER_STORE, 'readwrite');
    const store = tx.objectStore(FOLDER_STORE);
    let validationError: Error | null = null;
    const request = store.getAll();
    request.onsuccess = () => {
      const folders = request.result as ProjectFolder[];
      if (!folders.some((item) => item.id === folder.id)) {
        validationError = new Error('This folder no longer exists.');
        tx.abort();
        return;
      }
      const nameError = getProjectFolderNameError(folder.name, folders, folder.id);
      if (nameError) {
        validationError = new Error(nameError);
        tx.abort();
        return;
      }
      store.put(folder);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => {
      db.close();
      reject(validationError || tx.error || new Error('Folder rename was aborted.'));
    };
  });
}
async function deleteLocalFolderAndUnassignProjects(folderId: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, FOLDER_STORE], 'readwrite');
    const projects = tx.objectStore(PROJECT_STORE);
    const cursorRequest = projects.openCursor();
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const record = cursor.value as SavedProject;
      if (record.project.folderId === folderId) {
        cursor.update({
          ...record,
          project: { ...record.project, folderId: null },
          savedAt: Date.now(),
        });
      }
      cursor.continue();
    };
    tx.objectStore(FOLDER_STORE).delete(folderId);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Folder deletion transaction was aborted.')); };
  });
}
async function readLocalMedia(projectId: string): Promise<Asset[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([MEDIA_STORE, MEDIA_BLOB_STORE], 'readonly');
    const blobs = tx.objectStore(MEDIA_BLOB_STORE);
    const req = tx.objectStore(MEDIA_STORE).index('projectId').getAll(projectId);
    let records: StoredMediaRecord[] = [];
    const loadedBlobs = new Map<string, Blob>();
    req.onsuccess = () => {
      records = req.result as StoredMediaRecord[];
      for (const record of records) {
        if (!record.blobId) continue;
        const blobRequest = blobs.get(record.blobId);
        blobRequest.onsuccess = () => {
          const stored = blobRequest.result as StoredMediaBlob | undefined;
          if (stored?.blob) loadedBlobs.set(record.key, stored.blob);
        };
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(records.flatMap((record) => {
        const blob = loadedBlobs.get(record.key);
        return blob ? [{ ...record.asset, blob }] : [];
      }));
    };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Media read transaction was aborted.')); };
  });
}
async function deleteLocalMedia(projectId: string, assetId: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([MEDIA_STORE, MEDIA_BLOB_STORE], 'readwrite');
    const media = tx.objectStore(MEDIA_STORE);
    const blobs = tx.objectStore(MEDIA_BLOB_STORE);
    const key = `${projectId}:${assetId}`;
    const request = media.get(key);
    request.onsuccess = () => {
      const record = request.result as StoredMediaRecord | undefined;
      media.delete(key);
      if (record?.blobId) {
        const remaining = media.index('blobId').count(record.blobId);
        remaining.onsuccess = () => { if (remaining.result === 0) blobs.delete(record.blobId); };
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { /* onabort reports the transaction error once */ };
    tx.onabort = () => { db.close(); reject(tx.error || new Error('Media removal transaction was aborted.')); };
  });
}
async function deleteLocalProject(projectId: string) {
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction([PROJECT_STORE, MEDIA_STORE, MEDIA_BLOB_STORE], 'readwrite');
    tx.objectStore(PROJECT_STORE).delete(projectId);
    const media = tx.objectStore(MEDIA_STORE);
    const blobs = tx.objectStore(MEDIA_BLOB_STORE);
    const cursorRequest = media.index('projectId').openCursor(IDBKeyRange.only(projectId));
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) return;
      const record = cursor.value as StoredMediaRecord;
      media.delete(cursor.primaryKey);
      if (record.blobId) {
        const remaining = media.index('blobId').count(record.blobId);
        remaining.onsuccess = () => { if (remaining.result === 0) blobs.delete(record.blobId); };
      }
      cursor.continue();
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x6000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x6000, bytes.length)));
  }
  return btoa(binary);
}
async function writeBlobAsBase64(blob: Blob, write: (chunk: string) => Promise<void>) {
  const reader = blob.stream().getReader();
  let carry = new Uint8Array(0);
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (!value?.length) continue;
    const joined = new Uint8Array(carry.length + value.length);
    joined.set(carry);
    joined.set(value, carry.length);
    const completeLength = joined.length - (joined.length % 3);
    if (completeLength) await write(encodeBase64(joined.subarray(0, completeLength)));
    carry = joined.slice(completeLength);
  }
  if (carry.length) await write(encodeBase64(carry));
}
async function createProjectBackup(record: SavedProject) {
  type BackupWriter = { write: (chunk: string) => Promise<void>; close: () => Promise<void>; abort: (reason?: unknown) => Promise<void> };
  type BackupWindow = Window & {
    showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{ createWritable: () => Promise<unknown> }>;
  };
  const picker = (window as BackupWindow).showSaveFilePicker;
  let handle: { createWritable: () => Promise<unknown> } | null = null;
  if (picker) {
    try {
      handle = await picker.call(window, {
        suggestedName: `${record.project.name.replace(/[^\w -]/g, '').trim() || 'cutline-project'}.cutline.json`,
        types: [{ description: 'Cutline project backup', accept: { 'application/json': ['.cutline.json'] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    }
  }

  const assets = await readLocalMedia(record.project.id);
  const totalBytes = assets.reduce((sum, asset) => sum + asset.byteSize, 0);
  if (!handle && totalBytes > 64 * 1024 * 1024) {
    throw new Error('This browser cannot stream a backup to disk. Use Chrome or Edge for backups larger than 64 MB.');
  }

  let writer: BackupWriter | null = null;
  const chunks: string[] = [];
  const write = async (chunk: string) => {
    if (writer) await writer.write(chunk);
    else chunks.push(chunk);
  };
  try {
    if (handle) writer = await handle.createWritable() as BackupWriter;
    await write(`{"schemaVersion":1,"project":${JSON.stringify(record.project)},"savedAt":${record.savedAt},"assets":[`);
    for (const [index, asset] of assets.entries()) {
      const { blob, ...metadata } = asset;
      if (index) await write(',');
      const serialized = JSON.stringify(metadata);
      await write(`${serialized.slice(0, -1)},"dataBase64":"`);
      await writeBlobAsBase64(blob, write);
      await write('"}');
    }
    await write(']}');
    if (writer) await writer.close();
    else {
      const blob = new Blob(chunks, { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${record.project.name.replace(/[^\w -]/g, '').trim() || 'cutline-project'}.cutline.json`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    }
  } catch (error) {
    if (writer) {
      try { await writer.abort(error); } catch { /* preserve the write error */ }
    }
    throw error;
  }
}
const uid = () => crypto.randomUUID();
const formatTime = (seconds: number) => {
  const s = Math.max(0, seconds || 0);
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}.${Math.floor((s % 1) * 100).toString().padStart(2, '0')}`;
};
const formatElapsedTime = (seconds: number) => {
  const wholeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(wholeSeconds / 3600);
  const minutes = Math.floor((wholeSeconds % 3600) / 60);
  const remainingSeconds = wholeSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`
    : `${String(Math.floor(wholeSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
};
const formatBytes = (bytes: number) => bytes > 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : bytes > 1024 ** 2 ? `${(bytes / 1024 ** 2).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const ext = (name: string) => name.split('.').pop()?.toLowerCase() || '';
const isImage = (asset: Asset) => asset.mimeType.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'].includes(ext(asset.name));
const isAudio = (asset: Asset) => asset.mimeType.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes(ext(asset.name));
const isVideo = (asset: Asset) => asset.mimeType.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'avi'].includes(ext(asset.name));
function drawContained(context: CanvasRenderingContext2D, source: HTMLImageElement | HTMLVideoElement, width: number, height: number) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return;
  const ratio = Math.min(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * ratio;
  const drawHeight = sourceHeight * ratio;
  context.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function mediaThumbnail(source: HTMLImageElement | HTMLVideoElement, width: number, height: number) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth : source.naturalWidth;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight : source.naturalHeight;
  if (!sourceWidth || !sourceHeight) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 160;
  canvas.height = 90;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  context.fillStyle = '#171a20';
  context.fillRect(0, 0, canvas.width, canvas.height);
  const ratio = Math.min(canvas.width / width, canvas.height / height);
  const drawWidth = width * ratio;
  const drawHeight = height * ratio;
  context.drawImage(source, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas.toDataURL('image/jpeg', .68);
}

async function inspectImportedAsset(asset: Asset) {
  const url = URL.createObjectURL(asset.blob);
  try {
    if (isImage(asset)) {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`Timed out decoding ${asset.name}`)), 10000);
        image.onload = () => { window.clearTimeout(timeout); resolve(); };
        image.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Could not decode ${asset.name}`)); };
        image.src = url;
      });
      asset.width = image.naturalWidth;
      asset.height = image.naturalHeight;
      asset.duration = 5;
      asset.thumbnail = mediaThumbnail(image, image.naturalWidth, image.naturalHeight);
      return;
    }
    const media = document.createElement(isAudio(asset) ? 'audio' : 'video');
    media.preload = 'auto';
    asset.duration = await new Promise<number>((resolve) => {
      const timeout = window.setTimeout(() => resolve(0), 12000);
      media.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(Number.isFinite(media.duration) ? media.duration : 0); };
      media.onerror = () => { window.clearTimeout(timeout); resolve(0); };
      media.src = url;
      media.load();
    });
    if (media instanceof HTMLVideoElement) {
      asset.width = media.videoWidth || undefined;
      asset.height = media.videoHeight || undefined;
      if (media.readyState < 2) {
        await new Promise<void>((resolve) => {
          const timeout = window.setTimeout(resolve, 3500);
          media.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
          media.onerror = () => { window.clearTimeout(timeout); resolve(); };
        });
      }
      asset.thumbnail = mediaThumbnail(media, media.videoWidth, media.videoHeight);
      try {
        const input = new Input({ source: new BlobSource(asset.blob), formats: ALL_FORMATS });
        try {
          asset.hasAudio = (await input.getAudioTracks()).length > 0;
        } finally {
          input.dispose();
        }
      } catch {
        asset.hasAudio = undefined;
      }
    }
    media.pause();
    media.removeAttribute('src');
    media.load();
  } finally {
    URL.revokeObjectURL(url);
  }
}

function Home() {
  const [project, setProject] = useState<Project>(() => createProject());
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [libraryWorkspace, setLibraryWorkspace] = useState<LibraryWorkspace>('media');
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<'project' | 'export' | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectFolders, setProjectFolders] = useState<ProjectFolder[]>([]);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectSort, setProjectSort] = useState<'modified' | 'name'>('modified');
  const [selectedProjectFolder, setSelectedProjectFolder] = useState<'all' | 'unorganized' | string>('all');
  const [creatingProject, setCreatingProject] = useState(false);
  const [draftProjectName, setDraftProjectName] = useState('');
  const [draftProjectFolderId, setDraftProjectFolderId] = useState('unorganized');
  const [pendingDroppedFiles, setPendingDroppedFiles] = useState<File[]>([]);
  const [dropProjectId, setDropProjectId] = useState('');
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [moveFolderId, setMoveFolderId] = useState('unorganized');
  const [projectHydrated, setProjectHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportElapsed, setExportElapsed] = useState(0);
  const [exportDirectory, setExportDirectory] = useState<WritableDirectoryHandle | null>(null);
  const [dropActive, setDropActive] = useState(false);
  const [mediaImporting, setMediaImporting] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('saving');
  const [markupTool, setMarkupTool] = useState<MarkupToolMode>('pen');
  const [markupColor, setMarkupColor] = useState('#ff3b30');
  const [markupFillColor, setMarkupFillColor] = useState('#ffcc00');
  const [markupSize, setMarkupSize] = useState(8);
  const [markupOpacity, setMarkupOpacity] = useState(90);
  const [markupFillOpacity, setMarkupFillOpacity] = useState(18);
  const [markupDuration, setMarkupDuration] = useState(5);
  const [markupLineStyle, setMarkupLineStyle] = useState<MarkupDrawing['lineStyle']>('solid');
  const [markupNoteText, setMarkupNoteText] = useState('Look here');
  const [markupDraft, setMarkupDraft] = useState<MarkupDrawing | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextTarget | null>(null);
  const [detailsDialog, setDetailsDialog] = useState<{ title: string; rows: Array<[string, string]> } | null>(null);
  const [exportName, setExportName] = useState('cutline-export');
  const [exportFolderId, setExportFolderId] = useState('unorganized');
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [zoom, setZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [customCanvasMode, setCustomCanvasMode] = useState(false);
  const [customCanvas, setCustomCanvas] = useState({ width: String(project.width), height: String(project.height) });
  const [timelineDragEnd, setTimelineDragEnd] = useState<number | null>(null);
  const [, setHistoryRevision] = useState(0);
  const [mediaRevision, setMediaRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const relinkFileInput = useRef<HTMLInputElement>(null);
  const relinkAssetId = useRef<string | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewOverlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewFrameSize, setPreviewFrameSize] = useState({ width: 0, height: 0 });
  const previewMedia = useRef(new Map<string, HTMLImageElement | HTMLVideoElement>());
  const previewUrls = useRef(new Map<string, string>());
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const audioUrls = useRef(new Map<string, string>());
  const previewAudioContext = useRef<AudioContext | null>(null);
  const previewAudioNodes = useRef(new Map<string, { source: MediaElementAudioSourceNode; gain: GainNode }>());
  const audioRefCallbacks = useRef(new Map<string, (element: HTMLAudioElement | null) => void>());
  const audioPlayErrors = useRef(new Set<string>());
  const timelineRef = useRef<HTMLDivElement>(null);
  const previousTimelineScale = useRef(16);
  const lastTimelineDragExtendAt = useRef(0);
  const exportStartedAt = useRef<number | null>(null);
  const history = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const saveRevision = useRef(0);
  const lifecycleSaveRevision = useRef<number | null>(null);
  const saveQueue = useRef<((snapshot: ProjectSaveSnapshot) => Promise<void>) | null>(null);
  if (!saveQueue.current) {
    saveQueue.current = createSerializedWriteQueue(({ project: snapshotProject, assets: snapshotAssets }) =>
      retryWrite(() => saveLocalProject(snapshotProject, snapshotAssets)),
    );
  }
  const trimDrag = useRef<{
    clipId: string;
    edge: 'start' | 'end';
    pointerId: number;
    startX: number;
    initialClip: Clip;
    initialProject: Project;
  } | null>(null);
  const textPointerDrag = useRef<TextPointerDrag | null>(null);
  const markupPointerDrag = useRef<MarkupPointerDrag | null>(null);
  const clipboardClip = useRef<Clip | null>(null);
  const exportCancelRequested = useRef(false);
  const isPlayingRef = useRef(false);
  const projectRef = useRef(project);
  const projectBackupFileRef = useRef<HTMLInputElement>(null);
  useEffect(() => setCustomCanvas({ width: String(project.width), height: String(project.height) }), [project.width, project.height]);
  useEffect(() => setCustomCanvasMode(false), [project.id]);
  projectRef.current = project;
  const assetsRef = useRef(assets);
  assetsRef.current = assets;
  const persistProjectSnapshot = useCallback((nextProject: Project, nextAssets: Asset[]) => {
    if (!saveQueue.current) throw new Error('Project save queue is unavailable.');
    return saveQueue.current({ project: nextProject, assets: nextAssets });
  }, []);
  const getAudioRef = (clipId: string) => {
    let callback = audioRefCallbacks.current.get(clipId);
    if (!callback) {
      callback = (element) => {
        if (element) {
          audioRefs.current.set(clipId, element);
          return;
        }
        const previous = audioRefs.current.get(clipId);
        previous?.pause();
        previous?.removeAttribute('src');
        previous?.load();
        const node = previewAudioNodes.current.get(clipId);
        node?.source.disconnect();
        node?.gain.disconnect();
        previewAudioNodes.current.delete(clipId);
        audioRefs.current.delete(clipId);
        audioPlayErrors.current.delete(clipId);
        const url = audioUrls.current.get(clipId);
        if (url) URL.revokeObjectURL(url);
        audioUrls.current.delete(clipId);
        audioRefCallbacks.current.delete(clipId);
      };
      audioRefCallbacks.current.set(clipId, callback);
    }
    return callback;
  };
  const connectPreviewAudio = (clipId: string, audio: HTMLAudioElement) => {
    const existing = previewAudioNodes.current.get(clipId);
    if (existing) return true;
    const context = previewAudioContext.current;
    if (!context) return false;
    try {
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      source.connect(gain);
      gain.connect(context.destination);
      previewAudioNodes.current.set(clipId, { source, gain });
      audio.volume = 1;
      return true;
    } catch {
      return false;
    }
  };
  const notify = useCallback((message: string, error = false) => {
    setNotice({ message, error });
    window.setTimeout(() => setNotice(null), 4200);
  }, []);
  const commit = useCallback((recipe: (current: Project) => Project) => {
    setProject((current) => {
      const next = recipe(current);
      if (next !== current) {
        history.current = [...history.current.slice(-39), current];
        future.current = [];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [records, folders] = await Promise.all([readLocalProjects(), readLocalFolders()]);
        if (!alive) return;
        setSavedProjects(records);
        setProjectFolders(folders);
        const latest = [...records].sort((a, b) => b.savedAt - a.savedAt)[0];
        if (latest) {
          const localAssets = await readLocalMedia(latest.project.id);
          if (!alive) return;
          setProject(latest.project);
          setAssets(localAssets);
          setSaveState('saved');
        }
      } catch {
        if (alive) notify('Local project storage is unavailable in this browser.', true);
      } finally {
        if (alive) setProjectHydrated(true);
      }
    })();
    return () => { alive = false; };
  }, [notify]);

  useEffect(() => {
    if (!projectHydrated) return;
    if (saveTimer.current !== undefined) window.clearTimeout(saveTimer.current);
    const revision = ++saveRevision.current;
    setSaveState('dirty');
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = undefined;
      if (revision !== saveRevision.current) return;
      setSaveState('saving');
      persistProjectSnapshot(project, assets)
        .then(() => {
          if (
            revision === saveRevision.current &&
            saveTimer.current === undefined &&
            projectRef.current === project &&
            assetsRef.current === assets
          ) {
            setSaveState('saved');
            void readLocalProjects().then(setSavedProjects).catch(() => undefined);
          }
        })
        .catch(() => {
          if (
            revision === saveRevision.current &&
            saveTimer.current === undefined &&
            projectRef.current === project &&
            assetsRef.current === assets
          ) {
            setSaveState('error');
            notify('Could not save locally. Check browser storage space and permissions.', true);
          }
        });
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
      }
    };
  }, [project, assets, notify, persistProjectSnapshot, projectHydrated]);

  useEffect(() => {
    if (!projectHydrated) return;
    const flushOnPageHide = () => {
      if (saveState === 'saved' && saveTimer.current === undefined) return;
      if (saveState === 'saving' && saveTimer.current === undefined) return;
      if (saveTimer.current !== undefined) {
        window.clearTimeout(saveTimer.current);
        saveTimer.current = undefined;
      }
      const revision = saveRevision.current;
      if (lifecycleSaveRevision.current === revision) return;
      lifecycleSaveRevision.current = revision;
      const snapshotProject = projectRef.current;
      const snapshotAssets = assetsRef.current;
      setSaveState('saving');
      persistProjectSnapshot(snapshotProject, snapshotAssets)
        .then(() => {
          if (
            revision === saveRevision.current &&
            projectRef.current === snapshotProject &&
            assetsRef.current === snapshotAssets
          ) setSaveState('saved');
        })
        .catch(() => {
          if (lifecycleSaveRevision.current === revision) lifecycleSaveRevision.current = null;
          if (revision === saveRevision.current) setSaveState('error');
        });
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushOnPageHide();
    };
    const warnBeforeDiscard = (event: BeforeUnloadEvent) => {
      if (saveState === 'saved') return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('pagehide', flushOnPageHide);
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('beforeunload', warnBeforeDiscard);
    return () => {
      window.removeEventListener('pagehide', flushOnPageHide);
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('beforeunload', warnBeforeDiscard);
    };
  }, [persistProjectSnapshot, projectHydrated, saveState]);

  useEffect(() => {
    const wrap = previewWrapRef.current;
    if (!wrap) return;
    const updateFrameSize = () => {
      const ratio = project.width / Math.max(1, project.height);
      const width = Math.max(0, Math.min(wrap.clientWidth * .94, 1320, (wrap.clientHeight - 30) * ratio));
      setPreviewFrameSize({ width, height: width / ratio });
    };
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(wrap);
    updateFrameSize();
    return () => observer.disconnect();
  }, [project.width, project.height]);

  const contentEnd = useMemo(() => Math.max(
    0,
    ...project.clips.map((clip) => clip.timelineStart + getClipDuration(clip)),
    ...(project.markups || []).map((drawing) => drawing.end),
  ), [project.clips, project.markups]);
  const scale = 16 * zoom;
  const timelineEnd = Math.max(getTimelineEnd(contentEnd), timelineDragEnd || 0);
  const timelineRuler = useMemo(() => getTimelineRuler(timelineEnd, scale), [timelineEnd, scale]);
  const renderIndex = useMemo(() => createProjectRenderIndex(project, assets), [project, assets]);
  const previewBaseProjectRef = useRef<{ source: Project; rendered: Project } | null>(null);
  const previewBaseProject = useMemo(() => {
    const previous = previewBaseProjectRef.current;
    if (previous?.source === project) return previous.rendered;
    const videoTracks = project.tracks.filter((track) => track.kind === 'video');
    const videoTrackIds = new Set(videoTracks.map((track) => track.id));
    const videoClips = project.clips.filter((clip) => !clip.text && videoTrackIds.has(clip.trackId));
    const sameReferences = <T,>(left: T[], right: T[]) =>
      left.length === right.length && left.every((item, index) => item === right[index]);
    if (
      previous &&
      previous.rendered.width === project.width &&
      previous.rendered.height === project.height &&
      previous.rendered.transitions === project.transitions &&
      sameReferences(previous.rendered.tracks, videoTracks) &&
      sameReferences(previous.rendered.clips, videoClips)
    ) {
      previewBaseProjectRef.current = { source: project, rendered: previous.rendered };
      return previous.rendered;
    }
    const rendered = { ...project, tracks: videoTracks, clips: videoClips };
    previewBaseProjectRef.current = { source: project, rendered };
    return rendered;
  }, [project]);
  const previewBaseRenderIndex = useMemo(
    () => createProjectRenderIndex(previewBaseProject, assets),
    [previewBaseProject, assets],
  );
  const extendTimelineOnDrag = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const timeline = timelineRef.current;
    if (!timeline) return;
    const bounds = timeline.getBoundingClientRect();
    const edgeZone = Math.min(56, bounds.width * 0.15);
    if (event.clientX < bounds.right - edgeZone) return;

    const pointerX = event.clientX;
    const scrollAmount = Math.min(38, 7 + Math.max(0, pointerX - (bounds.right - edgeZone)) * 0.45);
    requestAnimationFrame(() => {
      const currentTimeline = timelineRef.current;
      if (currentTimeline) currentTimeline.scrollLeft += scrollAmount;
    });

    const now = performance.now();
    if (now - lastTimelineDragExtendAt.current < 180) return;
    lastTimelineDragExtendAt.current = now;
    const visibleSeconds = Math.max(0, (timeline.clientWidth - TRACK_LABEL_WIDTH) / scale);
    const extension = Math.max(15, Math.min(60, visibleSeconds * 0.5));
    setTimelineDragEnd((currentEnd) => Math.max(currentEnd ?? timelineEnd, timelineEnd) + extension);
  };
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) || null;
  useEffect(() => {
    if (selectedClipId && !selectedClip) setSelectedClipId(null);
  }, [selectedClipId, selectedClip]);
  const selectedTrack = selectedClip ? project.tracks.find((track) => track.id === selectedClip.trackId) : undefined;
  const selectedClipLocked = Boolean(selectedTrack?.locked);
  const selectedClipHasTransition = Boolean(selectedClip && project.transitions?.some((transition) => transition.fromClipId === selectedClip.id || transition.toClipId === selectedClip.id));
  const nextTransitionClip = selectedClip && selectedTrack?.kind === 'video' && !selectedClip.audioOnly && !selectedClip.text
    ? project.clips
      .filter((clip) => {
        const asset = assets.find((item) => item.id === clip.assetId);
        return clip.trackId === selectedClip.trackId && !clip.text && !clip.audioOnly && asset && isVideo(asset) &&
          clip.timelineStart >= selectedClip.timelineStart + getClipDuration(selectedClip) - .05;
      })
      .sort((a, b) => a.timelineStart - b.timelineStart)[0]
    : undefined;
  const previousTransitionClip = selectedClip && selectedTrack?.kind === 'video' && !selectedClip.audioOnly && !selectedClip.text
    ? project.clips
      .filter((clip) => {
        const asset = assets.find((item) => item.id === clip.assetId);
        return clip.trackId === selectedClip.trackId && !clip.text && !clip.audioOnly && asset && isVideo(asset) &&
          clip.timelineStart < selectedClip.timelineStart;
      })
      .sort((a, b) => b.timelineStart - a.timelineStart)[0]
    : undefined;
  const previousIsAdjacent = Boolean(previousTransitionClip &&
    Math.abs(previousTransitionClip.timelineStart + getClipDuration(previousTransitionClip) - (selectedClip?.timelineStart || 0)) <= .05);
  const nextIsAdjacent = Boolean(selectedClip && nextTransitionClip &&
    Math.abs(selectedClip.timelineStart + getClipDuration(selectedClip) - nextTransitionClip.timelineStart) <= .05);
  const selectedClipTransitionPair = nextIsAdjacent && selectedClip && nextTransitionClip
    ? { fromClip: selectedClip, toClip: nextTransitionClip }
    : previousIsAdjacent && previousTransitionClip && selectedClip
      ? { fromClip: previousTransitionClip, toClip: selectedClip }
      : undefined;
  const canApplySelectedTransition = Boolean(selectedClip && !selectedClipLocked && selectedClipTransitionPair);
  const selectedTransition = selectedClip
    ? project.transitions?.find((transition) => transition.fromClipId === selectedClip.id || transition.toClipId === selectedClip.id) || null
    : null;
  const orderedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const activeVisualClips = useMemo(() => project.clips.filter((clip) => {
    const track = project.tracks.find((t) => t.id === clip.trackId);
    return (track?.kind === 'video' || track?.kind === 'text') && track.visible !== false && playhead >= clip.timelineStart && playhead < clip.timelineStart + getClipDuration(clip);
  }).sort((a, b) => {
    const trackA = project.tracks.find((track) => track.id === a.trackId)?.order ?? 0;
    const trackB = project.tracks.find((track) => track.id === b.trackId)?.order ?? 0;
    return trackA - trackB || a.timelineStart - b.timelineStart;
  }), [project.clips, project.tracks, playhead]);
  const activeVisualClip = activeVisualClips.at(-1) || null;
  const activeVisualAsset = activeVisualClip ? assets.find((asset) => asset.id === activeVisualClip.assetId) : null;
  const selectedAsset = selectedClip ? assets.find((asset) => asset.id === selectedClip.assetId) : null;
  const selectedAssetKind = selectedClip?.text ? 'text' : selectedAsset ? (selectedClip?.audioOnly || isAudio(selectedAsset)) ? 'audio' : isImage(selectedAsset) ? 'image' : 'video' : undefined;
  const selectedClipIsVideo = Boolean(
    selectedClip && selectedTrack?.kind === 'video' && !selectedClip.text && !selectedClip.audioOnly &&
    selectedAsset && isVideo(selectedAsset),
  );
  const selectedClipIsVisual = Boolean(
    selectedClip && selectedTrack?.kind === 'video' && !selectedClip.text && !selectedClip.audioOnly &&
    selectedAsset && (isVideo(selectedAsset) || isImage(selectedAsset)),
  );
  const filterDisabledReason = !selectedClip
    ? 'Select one video clip to apply a filter.'
    : selectedClipLocked
      ? 'Unlock the selected track to apply a filter.'
      : !selectedClipIsVideo
        ? 'Filters are available on video clips, not audio or title clips.'
        : undefined;
  const effectDisabledReason = !selectedClip
    ? 'Select one video or image clip to apply an effect.'
    : selectedClipLocked
      ? 'Unlock the selected track to apply an effect.'
      : !selectedClipIsVisual
        ? 'Effects are available on video and image clips, not audio or title clips.'
        : undefined;
  const transitionDisabledReason = !selectedClip
    ? 'Select two adjacent video clips on the same track to apply a transition.'
    : selectedClipLocked
      ? 'Unlock the selected track to apply a transition.'
      : !canApplySelectedTransition
        ? 'Transitions require two adjacent video clips on the same track.'
        : undefined;
  const effectWorkspaceDisabledReason = libraryWorkspace === 'filters'
    ? filterDisabledReason
    : libraryWorkspace === 'effects'
      ? effectDisabledReason
      : libraryWorkspace === 'transitions'
        ? transitionDisabledReason
        : undefined;
  const selectedAssetName = selectedClip?.displayName || selectedClip?.text?.templateName || selectedAsset?.name;
  const projectMediaAssets = assets.filter((asset) => !project.removedAssetIds?.includes(asset.id));
  const filteredAssets = projectMediaAssets.filter((asset) => {
    const matchesSearch = asset.name.toLowerCase().includes(search.toLowerCase());
    const matchesWorkspace = libraryWorkspace === 'audio' ? isAudio(asset) || (isVideo(asset) && asset.hasAudio !== false)
      : libraryWorkspace === 'overlays' ? isImage(asset)
        : libraryWorkspace === 'media' ? true : false;
    return matchesSearch && matchesWorkspace;
  });
  const audioClips = useMemo(() => project.clips.filter((clip) => {
    const track = project.tracks.find((item) => item.id === clip.trackId);
    const asset = assets.find((item) => item.id === clip.assetId);
    return asset && (
      (track?.kind === 'audio' && (isAudio(asset) || (isVideo(asset) && asset.hasAudio !== false))) ||
      (track?.kind === 'video' && !clip.audioOnly && isVideo(asset) && asset.hasAudio !== false)
    );
  }), [project.clips, project.tracks, assets]);

  useEffect(() => {
    const retainedIds = new Set(audioClips.map((clip) => clip.id));
    for (const [clipId, url] of audioUrls.current) {
      if (!retainedIds.has(clipId)) {
        URL.revokeObjectURL(url);
        audioUrls.current.delete(clipId);
        audioRefs.current.delete(clipId);
      }
    }
    for (const clip of audioClips) {
      const audio = audioRefs.current.get(clip.id);
      const asset = assets.find((item) => item.id === clip.assetId);
      if (!audio || !asset || audioUrls.current.has(clip.id)) continue;
      const url = URL.createObjectURL(asset.blob);
      audioUrls.current.set(clip.id, url);
      audio.src = url;
      audio.preload = 'auto';
    }
  }, [audioClips, assets]);

  useEffect(() => () => {
    audioUrls.current.forEach((url) => URL.revokeObjectURL(url));
    audioUrls.current.clear();
    previewAudioNodes.current.forEach(({ source, gain }) => {
      source.disconnect();
      gain.disconnect();
    });
    previewAudioNodes.current.clear();
    if (previewAudioContext.current && previewAudioContext.current.state !== 'closed') {
      void previewAudioContext.current.close();
    }
  }, []);

  useEffect(() => {
    const visualAssets = assets.filter((asset) => isVideo(asset) || isImage(asset));
    const retainedIds = new Set(visualAssets.map((asset) => asset.id));
    for (const [assetId, url] of previewUrls.current) {
      if (!retainedIds.has(assetId)) {
        const media = previewMedia.current.get(assetId);
        if (media instanceof HTMLVideoElement) {
          media.pause();
          media.removeAttribute('src');
          media.load();
        }
        previewMedia.current.delete(assetId);
        previewUrls.current.delete(assetId);
        URL.revokeObjectURL(url);
      }
    }
    for (const asset of visualAssets) {
      if (previewMedia.current.has(asset.id)) continue;
      const url = URL.createObjectURL(asset.blob);
      previewUrls.current.set(asset.id, url);
      if (isImage(asset)) {
        const image = new Image();
        image.onload = () => setMediaRevision((revision) => revision + 1);
        image.src = url;
        previewMedia.current.set(asset.id, image);
      } else {
        const video = document.createElement('video');
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.onloadeddata = () => setMediaRevision((revision) => revision + 1);
        video.onseeked = () => setMediaRevision((revision) => revision + 1);
        video.src = url;
        video.load();
        previewMedia.current.set(asset.id, video);
      }
    }
  }, [assets]);

  useEffect(() => () => {
    previewMedia.current.forEach((media) => {
      if (media instanceof HTMLVideoElement) {
        media.pause();
        media.removeAttribute('src');
      }
    });
    previewUrls.current.forEach(URL.revokeObjectURL);
    previewMedia.current.clear();
    previewUrls.current.clear();
  }, []);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const playbackPreviewMax = playing && Math.max(project.width, project.height) >= 3840 ? 1280 : 1920;
    const previewSize = getPreviewCanvasSize(project.width, project.height, playbackPreviewMax);
    if (canvas.width !== previewSize.width) canvas.width = previewSize.width;
    if (canvas.height !== previewSize.height) canvas.height = previewSize.height;
    const context = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!context) return;
    renderProjectFrame(context, previewBaseProject, assets, previewMedia.current, playhead, playing, null, null, previewBaseRenderIndex, { layer: 'base' });
  }, [previewBaseProject, previewBaseRenderIndex, assets, playhead, playing, mediaRevision]);

  useEffect(() => {
    const canvas = previewOverlayCanvasRef.current;
    if (!canvas) return;
    const playbackPreviewMax = playing && Math.max(project.width, project.height) >= 3840 ? 1280 : 1920;
    const previewSize = getPreviewCanvasSize(project.width, project.height, playbackPreviewMax);
    if (canvas.width !== previewSize.width) canvas.width = previewSize.width;
    if (canvas.height !== previewSize.height) canvas.height = previewSize.height;
    const context = canvas.getContext('2d', { alpha: true, desynchronized: true });
    if (!context) return;
    renderProjectFrame(context, project, assets, previewMedia.current, playhead, playing, selectedClipId, markupDraft, renderIndex, { layer: 'overlay' });
  }, [project, assets, playhead, playing, mediaRevision, selectedClipId, markupDraft, renderIndex]);

  useEffect(() => {
    for (const clip of audioClips) {
      const audio = audioRefs.current.get(clip.id);
      const track = project.tracks.find((item) => item.id === clip.trackId);
      if (!audio || !track) continue;
      const duration = getClipDuration(clip);
      const active = !track.muted && !clip.muted && playhead >= clip.timelineStart && playhead < clip.timelineStart + duration;
      if (!active) {
        audio.pause();
        continue;
      }
      const sourceTime = clip.sourceIn + (playhead - clip.timelineStart) * clip.speed;
      if (Number.isFinite(sourceTime) && Math.abs(audio.currentTime - sourceTime) > .35) {
        try { audio.currentTime = Math.max(0, sourceTime); } catch { /* media metadata may still be loading */ }
      }
      audio.playbackRate = clip.speed;
      const outputGain = muted ? 0 : Math.max(0, volume * clip.volume * getAudioFade(clip, playhead));
      const routed = connectPreviewAudio(clip.id, audio);
      const audioNode = previewAudioNodes.current.get(clip.id);
      if (routed && audioNode) {
        audio.volume = 1;
        audioNode.gain.gain.value = outputGain;
      } else {
        audio.volume = Math.min(1, outputGain);
      }
      if (playing) {
        void audio.play().then(() => {
          audioPlayErrors.current.delete(clip.id);
        }).catch((error: unknown) => {
          if (audioPlayErrors.current.has(clip.id)) return;
          audioPlayErrors.current.add(clip.id);
          const message = error instanceof Error && error.name === 'NotAllowedError'
            ? 'The browser blocked audio playback. Press Play again after interacting with the editor.'
            : 'Audio playback failed for this clip. Check that the media format is supported.';
          notify(message, true);
        });
      } else audio.pause();
    }
  }, [audioClips, project.tracks, playhead, playing, muted, volume, notify]);

  useEffect(() => {
    const context = previewAudioContext.current;
    if (!context || context.state === 'closed') return;
    if (playing) void context.resume().catch(() => undefined);
    else void context.suspend().catch(() => undefined);
  }, [playing]);

  useEffect(() => {
    isPlayingRef.current = playing;
    if (!playing) return;
    let raf = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (now - previous >= 30) {
        const delta = getPlaybackDeltaSeconds(previous, now);
        previous = now;
        setPlayhead((time) => {
          if (time + delta >= contentEnd) { setPlaying(false); return contentEnd; }
          return time + delta;
        });
      }
      if (isPlayingRef.current) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, contentEnd]);

  useEffect(() => {
    if (!playing || !timelineRef.current) return;
    const timeline = timelineRef.current;
    const playheadX = TRACK_LABEL_WIDTH + playhead * scale;
    const visibleRight = timeline.scrollLeft + timeline.clientWidth;
    const visibleLeft = timeline.scrollLeft + TRACK_LABEL_WIDTH;
    if (playheadX > visibleRight - 56) {
      timeline.scrollLeft = Math.max(0, playheadX - timeline.clientWidth + 72);
    } else if (playheadX < visibleLeft) {
      timeline.scrollLeft = Math.max(0, playheadX - TRACK_LABEL_WIDTH);
    }
  }, [playhead, playing, scale]);

  useEffect(() => {
    const previousScale = previousTimelineScale.current;
    previousTimelineScale.current = scale;
    if (previousScale === scale || playing || !timelineRef.current) return;
    const timeline = timelineRef.current;
    const previousPlayheadX = TRACK_LABEL_WIDTH + playhead * previousScale;
    const nextPlayheadX = TRACK_LABEL_WIDTH + playhead * scale;
    timeline.scrollLeft = Math.max(0, timeline.scrollLeft + nextPlayheadX - previousPlayheadX);
  }, [playhead, playing, scale]);

  useEffect(() => {
    const clearDragExtension = () => setTimelineDragEnd(null);
    window.addEventListener('dragend', clearDragExtension);
    return () => window.removeEventListener('dragend', clearDragExtension);
  }, []);

  useEffect(() => {
    if (!exporting) return;
    const timer = window.setInterval(() => {
      const startedAt = exportStartedAt.current;
      if (startedAt !== null) setExportElapsed(Math.floor((performance.now() - startedAt) / 1000));
    }, 250);
    return () => window.clearInterval(timer);
  }, [exporting]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    setMediaImporting(true);
    const targetProjectId = projectRef.current.id;
    const additions: Asset[] = [];
    let importComplete = false;
    try {
      for (const file of Array.from(files)) {
        if (!(file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/') ||
          /\.(mp4|webm|mov|m4v|mkv|avi|mp3|wav|ogg|m4a|aac|flac|jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name))) {
          notify(`${file.name} is not a supported media file.`, true); continue;
        }
        const asset: Asset = { id: uid(), name: file.name, mimeType: file.type || 'application/octet-stream', byteSize: file.size, blob: file };
        try { await inspectImportedAsset(asset); } catch { notify(`Could not read metadata for ${file.name}; it can still be added, but playback or export may not be supported.`, true); }
        additions.push(asset);
      }
      if (additions.length) {
        if (projectRef.current.id !== targetProjectId) {
          notify('The active project changed during import. Select the intended project and retry.', true);
          return false;
        }
        setSaveState('saving');
        try {
          await saveLocalMedia(targetProjectId, additions);
        } catch {
          setSaveState('error');
          notify('Could not store imported media in browser storage. Free disk space or remove large files, then retry.', true);
          return false;
        }
        if (projectRef.current.id !== targetProjectId) {
          notify('Media was stored in its original project. Reopen that project to see the imported files.', true);
          return false;
        }
        setAssets((current) => [...current, ...additions]);
        setSelectedAssetId(additions[0].id);
        importComplete = true;
        const silentVideos = additions.filter((asset) => isVideo(asset) && asset.hasAudio === false);
        const audioNote = silentVideos.length
          ? ` No embedded audio track: ${silentVideos.map((asset) => asset.name).join(', ')}.`
          : '';
        notify(`${additions.length} file${additions.length === 1 ? '' : 's'} added to this device's media bin.${audioNote}`);
      }
    } finally {
      setMediaImporting(false);
    }
    return importComplete;
  }, [notify]);
  const relinkMissingAsset = async (metadata: AssetMetadata, file: File): Promise<boolean> => {
    if (!(file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/') ||
      /\.(mp4|webm|mov|m4v|mkv|avi|mp3|wav|ogg|m4a|aac|flac|jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name))) {
      notify(`${file.name} is not a supported media file.`, true);
      return false;
    }
    if (mediaImporting) {
      notify('Wait for the current media operation to finish before relinking.', true);
      return false;
    }
    const targetProjectId = projectRef.current.id;
    setMediaImporting(true);
    setSaveState('saving');
    try {
      const replacement: Asset = {
        ...metadata,
        mimeType: file.type || metadata.mimeType,
        byteSize: file.size,
        blob: file,
      };
      try {
        await inspectImportedAsset(replacement);
      } catch {
        notify(`The selected file could not be fully analyzed. Cutline will still try to use it as “${metadata.name}”.`, true);
      }
      if (projectRef.current.id !== targetProjectId) {
        notify('The active project changed during relinking. Select the intended project and try again.', true);
        return false;
      }
      await replaceLocalMedia(targetProjectId, replacement);
      const nextAssets = [...assetsRef.current.filter((asset) => asset.id !== metadata.id), replacement];
      assetsRef.current = nextAssets;
      setAssets(nextAssets);
      setMediaRevision((revision) => revision + 1);
      await persistProjectSnapshot(projectRef.current, nextAssets);
      setSavedProjects(await readLocalProjects());
      notify(`Relinked “${metadata.name}”. Its existing timeline clips were preserved.`);
      return true;
    } catch {
      setSaveState('error');
      notify(`Could not relink “${metadata.name}”. Check browser storage space and try again.`, true);
      return false;
    } finally {
      setMediaImporting(false);
    }
  };
  const addAssetToTimeline = useCallback((asset: Asset, trackId?: string, at = playhead, asAudio = false) => {
    const requestedTrack = trackId ? projectRef.current.tracks.find((track) => track.id === trackId) : undefined;
    const audioOnlySource = isVideo(asset) && (asAudio || requestedTrack?.kind === 'audio');
    const kind: TrackKind = isAudio(asset) || audioOnlySource ? 'audio' : 'video';
    let target = requestedTrack || projectRef.current.tracks.find((track) => track.kind === kind);
    if (!target) {
      const track: Track = { id: uid(), name: `${kind === 'video' ? 'Video' : 'Audio'} ${projectRef.current.tracks.filter((t) => t.kind === kind).length + 1}`, kind, order: projectRef.current.tracks.length, muted: false, visible: true, locked: false };
      commit((current) => ({ ...current, tracks: [...current.tracks, track] }));
      target = track;
    }
    if (target.locked) { notify('Unlock that track before adding media.', true); return; }
    if (audioOnlySource && asset.hasAudio === false) { notify('This video has no embedded audio track to add to Audio.', true); return; }
    if (target.kind !== kind) {
      notify(`That file belongs on an ${kind} track.`, true); return;
    }
    const duration = Math.max(.15, asset.duration || 5);
    const clip: Clip = { id: uid(), assetId: asset.id, trackId: target.id, timelineStart: Math.max(0, at), sourceIn: 0, sourceOut: duration, volume: 1, speed: 1, ...(audioOnlySource ? { audioOnly: true } : {}), transform: { ...DEFAULT_TRANSFORM }, effects: { ...DEFAULT_EFFECTS }, opacity: 1, fadeIn: 0, fadeOut: 0 };
    commit((current) => ({ ...current, clips: [...current.clips, clip] }));
    setSelectedClipId(clip.id);
    setPlayhead(clip.timelineStart);
  }, [commit, notify, playhead]);
  const addTitleTemplate = useCallback((template: TitleTemplate) => {
    const textTrack = projectRef.current.tracks.find((track) =>
      track.kind === 'text' && !track.locked && track.visible !== false,
    );
    const track = textTrack || {
      id: uid(),
      name: `Text ${projectRef.current.tracks.filter((item) => item.kind === 'text').length + 1}`,
      kind: 'text' as const,
      order: projectRef.current.tracks.length,
      muted: false,
      visible: true,
      locked: false,
    };
    const clip: Clip = {
      id: uid(),
      trackId: track.id,
      timelineStart: Math.max(0, playhead),
      sourceIn: 0,
      sourceOut: template.duration ?? 5,
      volume: 0,
      speed: 1,
      transform: { ...DEFAULT_TRANSFORM },
      effects: { ...DEFAULT_EFFECTS },
      opacity: 1,
      fadeIn: 0,
      fadeOut: 0,
      text: {
        templateId: template.id,
        templateName: template.name,
        content: template.text,
        fontFamily: template.fontFamily,
        ...(template.fontStyle ? { fontStyle: template.fontStyle } : {}),
        fontSize: template.fontSize,
        fontWeight: template.fontWeight,
        color: template.color,
        align: template.align,
        x: template.x,
        y: template.y,
        backgroundColor: template.backgroundColor,
        outlineColor: template.outlineColor,
        outlineWidth: template.outlineWidth,
        shadow: template.shadow,
        opacity: template.opacity,
        ...(template.animation ? { animation: template.animation } : {}),
        ...(template.backgroundStyle ? { backgroundStyle: { ...template.backgroundStyle } } : {}),
      },
    };
    commit((current) => ({
      ...current,
      tracks: current.tracks.some((item) => item.id === track.id) ? current.tracks : [...current.tracks, track],
      clips: [...current.clips, clip],
    }));
    setSelectedClipId(clip.id);
    setSelectedAssetId(null);
    setPlayhead(clip.timelineStart);
  }, [commit, notify, playhead]);
  const undo = () => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current = [...future.current, project];
    setProject(previous);
    setSelectedClipId(null);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next) return;
    history.current = [...history.current, project];
    setProject(next);
    setSelectedClipId(null);
  };
  const splitSelected = () => {
    if (!selectedClip || selectedClipLocked) {
      if (selectedClipLocked) notify('Unlock this track before editing its clip.', true);
      return;
    }
    if (playhead <= selectedClip.timelineStart + .06 || playhead >= selectedClip.timelineStart + getClipDuration(selectedClip) - .06) {
      notify('Place the playhead inside a selected clip to split it.', true); return;
    }
    const cutSource = selectedClip.sourceIn + (playhead - selectedClip.timelineStart) * selectedClip.speed;
    const right: Clip = { ...selectedClip, id: uid(), timelineStart: playhead, sourceIn: cutSource };
    commit((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, sourceOut: cutSource } : clip).concat(right),
      transitions: (current.transitions || []).map((transition) =>
        transition.fromClipId === selectedClip.id ? { ...transition, fromClipId: right.id } : transition
      ),
    }));
    setSelectedClipId(right.id);
  };
  const trimAtPlayhead = (side: 'start' | 'end') => {
    if (!selectedClip) return;
    if (selectedClipLocked) { notify('Unlock this track before trimming.', true); return; }
    const trimPosition = snapTimelineTime(playhead, selectedClip.id);
    const clipEnd = selectedClip.timelineStart + getClipDuration(selectedClip);
    if (side === 'start') {
      const delta = trimPosition - selectedClip.timelineStart;
      if (delta <= 0 || delta >= clipEnd - selectedClip.timelineStart - .08) { notify('Move the playhead inside the clip before trimming.', true); return; }
      commit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, sourceIn: clip.sourceIn + delta * clip.speed, timelineStart: trimPosition } : clip) }));
    } else {
      if (trimPosition <= selectedClip.timelineStart + .08 || trimPosition >= clipEnd) { notify('Move the playhead inside the clip before trimming.', true); return; }
      commit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, sourceOut: clip.sourceIn + (trimPosition - clip.timelineStart) * clip.speed } : clip) }));
    }
  };
  const removeSelected = () => {
    if (!selectedClip) return;
    if (selectedClipLocked) { notify('Unlock this track before deleting its clip.', true); return; }
    commit((current) => ({
      ...current,
      clips: current.clips.filter((clip) => clip.id !== selectedClip.id),
      transitions: (current.transitions || []).filter((transition) =>
        transition.fromClipId !== selectedClip.id && transition.toClipId !== selectedClip.id
      ),
    }));
    setSelectedClipId(null);
  };
  const rippleDeleteSelected = () => {
    if (!selectedClip) return;
    if (selectedClipLocked) { notify('Unlock this track before ripple deleting its clip.', true); return; }
    const removedId = selectedClip.id;
    const removedEnd = selectedClip.timelineStart + getClipDuration(selectedClip);
    const duration = getClipDuration(selectedClip);
    const trackId = selectedClip.trackId;
    commit((current) => ({
      ...current,
      clips: current.clips
        .filter((clip) => clip.id !== removedId)
        .map((clip) => clip.trackId === trackId && clip.timelineStart >= removedEnd - .001
          ? { ...clip, timelineStart: Math.max(0, clip.timelineStart - duration) }
          : clip),
      transitions: (current.transitions || []).filter((transition) =>
        transition.fromClipId !== removedId && transition.toClipId !== removedId
      ),
    }));
    setSelectedClipId(null);
    notify('Clip removed and later clips on this track moved earlier.');
  };
  const updateSelectedClip = (patch: ClipPatch) => {
    if (!selectedClip) return;
    if (selectedClipLocked) { notify('Unlock this track before changing the clip.', true); return; }
    const { text: textPatch, ...clipPatch } = patch;
    const asset = assets.find((item) => item.id === selectedClip.assetId);
    const maxSourceTime = Math.max(asset?.duration || 0, selectedClip.sourceOut, selectedClip.sourceIn + .08 * selectedClip.speed);
    commit((current) => ({
      ...current,
      clips: current.clips.map((clip) => {
        if (clip.id !== selectedClip.id) return clip;
        const speed = Math.min(4, Math.max(.1, patch.speed ?? clip.speed));
        const sourceIn = Math.min(maxSourceTime - .08 * speed, Math.max(0, patch.sourceIn ?? clip.sourceIn));
        const sourceOut = Math.min(maxSourceTime, Math.max(sourceIn + .08 * speed, patch.sourceOut ?? clip.sourceOut));
        return {
          ...clip,
          ...clipPatch,
          timelineStart: Math.max(0, clipPatch.timelineStart ?? clip.timelineStart),
          sourceIn,
          sourceOut,
          speed,
          volume: Math.min(2, Math.max(0, clipPatch.volume ?? clip.volume)),
          transform: { ...DEFAULT_TRANSFORM, ...clip.transform, ...clipPatch.transform },
          effects: { ...DEFAULT_EFFECTS, ...clip.effects, ...clipPatch.effects },
          opacity: Math.max(0, Math.min(1, clipPatch.opacity ?? clip.opacity ?? 1)),
          fadeIn: Math.max(0, Math.min(getClipDuration(clip) / 2, clipPatch.fadeIn ?? clip.fadeIn ?? 0)),
          fadeOut: Math.max(0, Math.min(getClipDuration(clip) / 2, clipPatch.fadeOut ?? clip.fadeOut ?? 0)),
          ...(clip.text && textPatch ? { text: { ...clip.text, ...textPatch } } : {}),
        };
      }),
    }));
  };
  const startTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>, clip: Clip, edge: 'start' | 'end') => {
    if (projectRef.current.tracks.find((track) => track.id === clip.trackId)?.locked) {
      notify('Unlock this track before trimming.', true);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    trimDrag.current = {
      clipId: clip.id,
      edge,
      pointerId: event.pointerId,
      startX: event.clientX,
      initialClip: clip,
      initialProject: projectRef.current,
    };
  };
  const updateTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = trimDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const initial = drag.initialClip;
    const deltaSeconds = (event.clientX - drag.startX) / scale;
    const minSourceLength = .08 * initial.speed;
    let updated: Clip;
    if (drag.edge === 'start') {
      const duration = getClipDuration(initial);
      const rawStart = Math.max(0, Math.min(initial.timelineStart + duration - .08, initial.timelineStart + deltaSeconds));
      const nextStart = Math.max(0, Math.min(initial.timelineStart + duration - .08, snapTimelineTime(rawStart, initial.id)));
      const sourceDelta = (nextStart - initial.timelineStart) * initial.speed;
      updated = { ...initial, timelineStart: nextStart, sourceIn: Math.max(0, Math.min(initial.sourceOut - minSourceLength, initial.sourceIn + sourceDelta)) };
    } else {
      const asset = assets.find((item) => item.id === initial.assetId);
      const maxSourceTime = Math.max(initial.sourceOut, asset?.duration || 0);
      const rawEnd = initial.timelineStart + getClipDuration(initial) + deltaSeconds;
      const snappedEnd = snapTimelineTime(rawEnd, initial.id);
      const sourceOut = Math.max(initial.sourceIn + minSourceLength, Math.min(maxSourceTime, initial.sourceIn + Math.max(.08, snappedEnd - initial.timelineStart) * initial.speed));
      updated = { ...initial, sourceOut };
    }
    setProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === updated.id ? updated : clip),
    }));
  };
  const finishTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = trimDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const current = projectRef.current.clips.find((clip) => clip.id === drag.clipId);
    const changed = current && (
      current.timelineStart !== drag.initialClip.timelineStart ||
      current.sourceIn !== drag.initialClip.sourceIn ||
      current.sourceOut !== drag.initialClip.sourceOut
    );
    if (changed) {
      history.current = [...history.current.slice(-39), drag.initialProject];
      future.current = [];
      setHistoryRevision((revision) => revision + 1);
    }
    trimDrag.current = null;
  };
  const addTrack = (kind: TrackKind) => commit((current) => ({
    ...current,
    tracks: [...current.tracks, { id: uid(), kind, name: `${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Text'} ${current.tracks.filter((t) => t.kind === kind).length + 1}`, order: current.tracks.length, muted: false, visible: true, locked: false }],
  }));
  const moveClip = (clipId: string, nextStart: number, targetTrackId?: string) => {
    const movingClip = projectRef.current.clips.find((clip) => clip.id === clipId);
    const targetTrack = targetTrackId ? projectRef.current.tracks.find((track) => track.id === targetTrackId) : undefined;
    const asset = movingClip ? assets.find((item) => item.id === movingClip.assetId) : undefined;
    if (!movingClip || (targetTrackId && !targetTrack)) return;
    const sourceTrack = projectRef.current.tracks.find((track) => track.id === movingClip.trackId);
    const clipKind: TrackKind = movingClip.text ? 'text' : movingClip.audioOnly || (asset && isAudio(asset)) ? 'audio' : 'video';
    if (sourceTrack?.locked || targetTrack?.locked) {
      notify('Unlock the track before moving clips.', true);
      return;
    }
    if (targetTrack && targetTrack.kind !== clipKind) {
      notify(`This ${clipKind} clip must stay on a matching track.`, true);
      return;
    }
    commit((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        timelineStart: snapTimelineTime(Math.max(0, nextStart), clipId),
        ...(targetTrackId ? { trackId: targetTrackId } : {}),
      } : clip),
    }));
  };
  const duplicateSelectedClip = () => {
    if (!selectedClip) return;
    if (selectedClipLocked) { notify('Unlock this track before duplicating its clip.', true); return; }
    const duplicate: Clip = {
      ...selectedClip,
      id: uid(),
      timelineStart: selectedClip.timelineStart + getClipDuration(selectedClip),
      ...(selectedClip.transform ? { transform: { ...selectedClip.transform } } : {}),
      ...(selectedClip.effects ? { effects: { ...selectedClip.effects } } : {}),
      ...(selectedClip.text ? { text: { ...selectedClip.text } } : {}),
    };
    commit((current) => ({ ...current, clips: [...current.clips, duplicate] }));
    setSelectedClipId(duplicate.id);
    setPlayhead(duplicate.timelineStart);
  };
  const copySelectedClip = () => {
    if (!selectedClip) return;
    clipboardClip.current = {
      ...selectedClip,
      ...(selectedClip.transform ? { transform: { ...selectedClip.transform } } : {}),
      ...(selectedClip.effects ? { effects: { ...selectedClip.effects } } : {}),
      ...(selectedClip.text ? { text: { ...selectedClip.text } } : {}),
    };
    notify('Clip copied. Paste it at the playhead.');
  };
  const pasteClip = () => {
    const source = clipboardClip.current;
    if (!source) return;
    const asset = assets.find((item) => item.id === source.assetId);
    const kind: TrackKind = source.text ? 'text' : source.audioOnly || (asset && isAudio(asset)) ? 'audio' : 'video';
    let track = projectRef.current.tracks.find((item) => item.kind === kind && !item.locked);
    if (!track) {
      track = { id: uid(), kind, name: `${kind === 'video' ? 'Video' : kind === 'audio' ? 'Audio' : 'Text'} ${projectRef.current.tracks.filter((item) => item.kind === kind).length + 1}`, order: projectRef.current.tracks.length, muted: false, visible: true, locked: false };
    }
    const pasted: Clip = {
      ...source,
      id: uid(),
      trackId: track.id,
      timelineStart: Math.max(0, playhead),
      ...(source.transform ? { transform: { ...source.transform } } : {}),
      ...(source.effects ? { effects: { ...source.effects } } : {}),
      ...(source.text ? { text: { ...source.text } } : {}),
    };
    commit((current) => ({
      ...current,
      tracks: current.tracks.some((item) => item.id === track!.id) ? current.tracks : [...current.tracks, track!],
      clips: [...current.clips, pasted],
    }));
    setSelectedClipId(pasted.id);
    setPlayhead(pasted.timelineStart);
  };
  const reorderTrack = (trackId: string, direction: -1 | 1) => commit((current) => {
    const sorted = [...current.tracks].sort((a, b) => a.order - b.order);
    const index = sorted.findIndex((track) => track.id === trackId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= sorted.length) return current;
    [sorted[index], sorted[nextIndex]] = [sorted[nextIndex], sorted[index]];
    return { ...current, tracks: sorted.map((track, order) => ({ ...track, order })) };
  });
  const deleteTrack = (track: Track) => {
    const count = projectRef.current.clips.filter((clip) => clip.trackId === track.id).length;
    const removedClipIds = new Set(projectRef.current.clips.filter((clip) => clip.trackId === track.id).map((clip) => clip.id));
    if (!window.confirm(`Delete ${track.name} and ${count} clip${count === 1 ? '' : 's'} on it? This can be undone.`)) return;
    commit((current) => ({
      ...current,
      tracks: current.tracks.filter((item) => item.id !== track.id).map((item, order) => ({ ...item, order })),
      clips: current.clips.filter((clip) => clip.trackId !== track.id),
      transitions: (current.transitions || []).filter((transition) =>
        !removedClipIds.has(transition.fromClipId) && !removedClipIds.has(transition.toClipId)
      ),
    }));
    if (selectedClip?.trackId === track.id) setSelectedClipId(null);
  };
  const applySelectedEffect = (effects: Partial<ClipEffects>) => {
    if (!selectedClip) { notify('Select one video or image clip to apply an effect.', true); return; }
    if (selectedClipLocked) { notify('Unlock the selected track to apply an effect.', true); return; }
    if (!selectedClipIsVisual) { notify('Effects are available on video and image clips.', true); return; }
    updateSelectedClip({
      effects: {
        ...effects,
        enabled: { brightness: true, contrast: true, saturation: true, blur: true, ...effects.enabled },
      },
    });
  };
  const applySelectedFilter = (effects: Partial<ClipEffects>) => {
    if (!selectedClip) { notify('Select one video clip to apply a filter.', true); return; }
    if (selectedClipLocked) { notify('Unlock the selected track to apply a filter.', true); return; }
    if (!selectedClipIsVideo) { notify('Filters are available on video clips.', true); return; }
    updateSelectedClip({
      effects: {
        ...effects,
        enabled: { brightness: true, contrast: true, saturation: true, blur: true, ...effects.enabled },
      },
    });
  };
  const applySelectedTransition = (type: ClipTransition['type'], requestedDuration: number) => {
    if (!canApplySelectedTransition || !selectedClipTransitionPair) {
      notify(transitionDisabledReason || 'Transitions require two adjacent video clips on the same track.', true);
      return;
    }
    const next: ClipTransition = {
      id: uid(),
      fromClipId: selectedClipTransitionPair.fromClip.id,
      toClipId: selectedClipTransitionPair.toClip.id,
      type,
      duration: Math.min(
        Math.max(.1, requestedDuration),
        Math.max(.1, Math.min(getClipDuration(selectedClipTransitionPair.fromClip), getClipDuration(selectedClipTransitionPair.toClip)) * 2),
      ),
    };
    commit((current) => ({
      ...current,
      transitions: [...(current.transitions || []).filter((item) =>
        !(item.fromClipId === next.fromClipId && item.toClipId === next.toClipId)
      ), next],
    }));
    notify(`${type.replaceAll('-', ' ')} applied between the adjacent clips.`);
  };
  const removeSelectedTransition = () => {
    if (!selectedClip) return;
    if (selectedClipLocked) { notify('Unlock the track before removing its transition.', true); return; }
    commit((current) => ({
      ...current,
      transitions: (current.transitions || []).filter((transition) =>
        transition.fromClipId !== selectedClip.id && transition.toClipId !== selectedClip.id
      ),
    }));
    notify('Transitions touching the selected clip were removed.');
  };
  const setSelectedFit = (fit: 'contain' | 'cover') => {
    if (!selectedClip) return;
    updateSelectedClip({ transform: { fit, x: 0, y: 0, scale: 1, rotation: 0, anchorX: .5, anchorY: .5 } });
  };
  const resetSelectedTransform = () => updateSelectedClip({ transform: { ...DEFAULT_TRANSFORM } });
  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (typeof AudioContext !== 'undefined') {
      try {
        const context = previewAudioContext.current || new AudioContext();
        previewAudioContext.current = context;
        for (const [clipId, audio] of audioRefs.current) connectPreviewAudio(clipId, audio);
        void context.resume().catch(() => undefined);
      } catch {
        // Native audio playback remains available if the browser cannot create an audio graph.
      }
    }
    if (contentEnd > 0 && playhead >= contentEnd) setPlayhead(0);
    setPlaying(true);
  };
  const openProjects = async () => {
    if (mediaImporting) {
      notify('Wait for media import to finish before changing projects.', true);
      return;
    }
    try {
      const [records, folders] = await Promise.all([readLocalProjects(), readLocalFolders()]);
      setSavedProjects(records);
      setProjectFolders(folders);
      setCreatingProject(false);
      setMovingProjectId(null);
      setDialog('project');
    }
    catch { notify('Could not read projects from local browser storage.', true); }
  };
  const createProjectFolder = async () => {
    const requestedName = window.prompt('Name this internal project folder');
    if (requestedName === null) return null;
    const name = requestedName.trim();
    const nameError = getProjectFolderNameError(name, projectFolders);
    if (nameError) {
      notify(nameError, true);
      return null;
    }
    const now = Date.now();
    const folder: ProjectFolder = { id: uid(), name, createdAt: now, updatedAt: now };
    try {
      await createLocalFolder(folder);
      const updated = await readLocalFolders();
      setProjectFolders(updated);
      notify(`Created internal folder “${name}”.`);
      return folder;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not save this folder in local browser storage.';
      if (message.includes('Folder limit reached')) {
        setProjectFolders(await readLocalFolders().catch(() => projectFolders));
      }
      notify(message, true);
      return null;
    }
  };
  const chooseExportDirectory = async () => {
    const picker = (window as FileAccessWindow).showDirectoryPicker;
    if (!picker) {
      notify('This browser cannot write directly to a chosen folder. Use the browser’s save dialog or download option.', true);
      return;
    }
    try {
      const directory = await picker.call(window, { mode: 'readwrite' });
      setExportDirectory(directory);
      notify(`Exports can now be written directly to “${directory.name}”.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify(`Could not access that computer folder: ${error instanceof Error ? error.message : 'permission was denied'}`, true);
    }
  };
  const renameProjectFolder = async (folder: ProjectFolder) => {
    const requestedName = window.prompt('Rename internal project folder', folder.name);
    if (requestedName === null) return;
    const name = requestedName.trim();
    const nameError = getProjectFolderNameError(name, projectFolders, folder.id);
    if (nameError) { notify(nameError, true); return; }
    try {
      await renameLocalFolder({ ...folder, name, updatedAt: Date.now() });
      setProjectFolders(await readLocalFolders());
      notify('Folder renamed.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not rename this folder.', true);
    }
  };
  const deleteProjectFolder = async (folder: ProjectFolder) => {
    try {
      const records = await readLocalProjects();
      const assigned = records.filter((record) => record.project.folderId === folder.id).length;
      const projectNote = assigned
        ? ` ${assigned} project${assigned === 1 ? '' : 's'} will be moved to Unorganized Projects; project timelines and media will be kept.`
        : ' No projects will be affected.';
      if (!window.confirm(`Delete the internal folder “${folder.name}”?${projectNote}`)) return;
      await deleteLocalFolderAndUnassignProjects(folder.id);
      if (projectRef.current.folderId === folder.id) {
        const updatedProject = { ...projectRef.current, folderId: null };
        commit(() => updatedProject);
      }
      setProjectFolders(await readLocalFolders());
      setSavedProjects(await readLocalProjects());
      if (selectedProjectFolder === folder.id) setSelectedProjectFolder('all');
      notify('Folder deleted. Its projects and media were preserved.');
    } catch {
      notify('Could not delete this folder. The projects were not intentionally removed.', true);
    }
  };
  const flushCurrentProjectSave = async () => {
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    while (true) {
      const revision = saveRevision.current;
      const snapshotProject = projectRef.current;
      const snapshotAssets = assetsRef.current;
      setSaveState('saving');
      try {
        await persistProjectSnapshot(snapshotProject, snapshotAssets);
      } catch (error) {
        if (revision === saveRevision.current) setSaveState('error');
        throw error;
      }
      if (
        revision === saveRevision.current &&
        saveTimer.current === undefined &&
        projectRef.current === snapshotProject &&
        assetsRef.current === snapshotAssets
      ) {
        setSaveState('saved');
        return;
      }
    }
  };
  const saveNow = async () => {
    try {
      await flushCurrentProjectSave();
      void readLocalProjects().then(setSavedProjects).catch(() => undefined);
      notify('Project saved locally. Media stays on this device.');
    } catch {
      notify('Save failed. Check browser storage space and permissions.', true);
    }
  };
  const openProject = async (record: SavedProject): Promise<boolean> => {
    if (mediaImporting) {
      notify('Wait for media import to finish before changing projects.', true);
      return false;
    }
    try {
      await flushCurrentProjectSave();
      const records = await readLocalProjects();
      const latestRecord = records.find((item) => item.project.id === record.project.id) || record;
      const localAssets = await readLocalMedia(latestRecord.project.id);
      setSavedProjects(records);
      history.current = []; future.current = [];
      projectRef.current = latestRecord.project;
      assetsRef.current = localAssets;
      setProject(latestRecord.project); setAssets(localAssets); setSelectedClipId(null); setSelectedAssetId(null); setPlayhead(0); setDialog(null);
      notify(`Opened “${latestRecord.project.name}” from local storage.`);
      return true;
    } catch {
      notify('Could not save the current project or load the selected project. The current project is still open.', true);
      return false;
    }
  };
  const newProject = async (requestedName?: string, folderId: string | null = null): Promise<boolean> => {
    if (mediaImporting) {
      notify('Wait for media import to finish before changing projects.', true);
      return false;
    }
    let records = savedProjects;
    try {
      await flushCurrentProjectSave();
      records = await readLocalProjects();
      setSavedProjects(records);
    } catch {
      if (!window.confirm('The current project could not be saved locally. Start a new project anyway? Recent changes may be lost.')) return false;
    }
    history.current = []; future.current = [];
    const nextProject = createProject(requestedName?.trim() || nextProjectName(records), folderId);
    projectRef.current = nextProject;
    assetsRef.current = [];
    setProject(nextProject); setAssets([]); setSelectedClipId(null); setSelectedAssetId(null); setPlayhead(0); setDialog(null);
    return true;
  };
  const beginNewProject = () => {
    const selectedFolderExists = projectFolders.some((folder) => folder.id === selectedProjectFolder);
    const currentFolderExists = projectFolders.some((folder) => folder.id === project.folderId);
    const folderId = currentFolderExists
      ? project.folderId!
      : selectedFolderExists
        ? selectedProjectFolder
        : 'unorganized';
    setDraftProjectName(nextProjectName(savedProjects));
    setDraftProjectFolderId(folderId);
    setCreatingProject(true);
    setDialog('project');
  };
  const createProjectFromForm = async () => {
    const name = draftProjectName.trim();
    const nameError = getProjectNameError(name);
    if (nameError) { notify(nameError, true); return; }
    const folderId = draftProjectFolderId === 'unorganized' ? null : draftProjectFolderId;
    const created = await newProject(name, folderId);
    setCreatingProject(false);
    if (created && pendingDroppedFiles.length) {
      const imported = await importFiles(pendingDroppedFiles);
      if (imported) setPendingDroppedFiles([]);
      else setDialog('project');
    }
  };
  const moveSavedProject = async (record: SavedProject, folderId: string | null) => {
    const updatedProject = { ...record.project, folderId };
    try {
      const projectAssets = await readLocalMedia(record.project.id);
      await persistProjectSnapshot(updatedProject, projectAssets);
      if (projectRef.current.id === record.project.id) commit(() => updatedProject);
      setSavedProjects(await readLocalProjects());
      setMovingProjectId(null);
      notify(folderId ? `Moved “${record.project.name}” to ${projectFolders.find((folder) => folder.id === folderId)?.name || 'the selected folder'}.` : `Moved “${record.project.name}” to Unorganized Projects.`);
    } catch {
      notify('Could not move this project. Its timeline and media are unchanged.', true);
    }
  };
  const saveProjectAs = async () => {
    const source = projectRef.current;
    const sourceAssets = assetsRef.current;
    const suggestedName = `${source.name} copy`;
    const requestedName = window.prompt('Save a separate copy as', suggestedName);
    const name = requestedName?.trim();
    if (!name) return;
    const nameError = getProjectNameError(name);
    if (nameError) { notify(nameError, true); return; }
    const duplicate: Project = {
      ...source,
      id: uid(),
      name,
      exports: [],
      tracks: source.tracks.map((track) => ({ ...track })),
      clips: source.clips.map((clip) => ({
        ...clip,
        ...(clip.transform ? { transform: { ...clip.transform } } : {}),
        ...(clip.effects ? { effects: { ...clip.effects, ...(clip.effects.enabled ? { enabled: { ...clip.effects.enabled } } : {}) } } : {}),
        ...(clip.text ? { text: { ...clip.text, ...(clip.text.backgroundStyle ? { backgroundStyle: { ...clip.text.backgroundStyle } } : {}) } } : {}),
      })),
      transitions: (source.transitions || []).map((transition) => ({ ...transition })),
      markups: (source.markups || []).map((drawing) => ({ ...drawing, points: drawing.points.map((point) => ({ ...point })) })),
      ...(source.removedAssetIds ? { removedAssetIds: [...source.removedAssetIds] } : {}),
    };
    const revision = ++saveRevision.current;
    if (saveTimer.current !== undefined) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = undefined;
    }
    setSaveState('saving');
    try {
      await copyLocalMedia(source.id, duplicate.id);
      await persistProjectSnapshot(duplicate, sourceAssets);
      const records = await readLocalProjects();
      history.current = []; future.current = [];
      setProject(duplicate);
      setSavedProjects(records);
      setSelectedClipId(null);
      setSelectedAssetId(null);
      setPlayhead(0);
      setDialog(null);
      if (revision === saveRevision.current) setSaveState('saved');
      notify(`Saved “${name}” as an independent project.`);
    } catch {
      try { await deleteLocalProject(duplicate.id); } catch { /* keep the original project intact if cleanup fails */ }
      if (revision === saveRevision.current) setSaveState('error');
      notify('Save As failed. The original project is unchanged; check browser storage space and permissions.', true);
    }
  };
  const closeContextMenu = useCallback(() => setContextMenu(null), []);
  const openContextMenu = (event: ReactMouseEvent, kind: ContextTarget['kind'], id?: string) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({ kind, id, x: event.clientX, y: event.clientY });
  };
  const openKeyboardContextMenu = (event: React.KeyboardEvent<HTMLElement>, kind: ContextTarget['kind'], id?: string) => {
    if (!(event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    setContextMenu({ kind, id, x: rect.left, y: rect.bottom });
  };
  const refreshMedia = async () => {
    try {
      setAssets(await readLocalMedia(projectRef.current.id));
      notify('Media list refreshed from this device.');
    } catch {
      notify('Could not refresh media from local storage.', true);
    }
  };
  const renameMedia = async (asset: Asset) => {
    const name = window.prompt('Rename this media item (the source file will not be renamed)', asset.name);
    if (!name?.trim() || name.trim() === asset.name) return;
    const nextAssets = assets.map((item) => item.id === asset.id ? { ...item, name: name.trim() } : item);
    try {
      await saveLocalMedia(projectRef.current.id, [nextAssets.find((item) => item.id === asset.id)!]);
      setAssets(nextAssets);
      await persistProjectSnapshot(projectRef.current, nextAssets);
      setSavedProjects(await readLocalProjects());
      notify('Media label updated. The source file was not renamed.');
    } catch {
      notify('Could not save the media label.', true);
    }
  };
  const duplicateMedia = async (asset: Asset) => {
    const duplicate: Asset = { ...asset, id: uid(), name: `Copy of ${asset.name}` };
    const nextAssets = [...assets, duplicate];
    try {
      await copyLocalMediaAsset(projectRef.current.id, asset.id, projectRef.current.id, duplicate);
      setAssets(nextAssets);
      await persistProjectSnapshot(projectRef.current, nextAssets);
      setSavedProjects(await readLocalProjects());
      setSelectedAssetId(duplicate.id);
      notify('Media item duplicated in this project.');
    } catch {
      notify('Could not duplicate this media item. Check available browser storage.', true);
    }
  };
  const removeMediaFromProject = (asset: Asset) => {
    const linkedClips = projectRef.current.clips.filter((clip) => clip.assetId === asset.id);
    const message = linkedClips.length
      ? `Remove “${asset.name}” and its ${linkedClips.length} timeline clip${linkedClips.length === 1 ? '' : 's'} from this project? The source file on your computer will not be deleted.`
      : `Remove “${asset.name}” from this project? The source file on your computer will not be deleted.`;
    if (!window.confirm(message)) return;
    const nextProject: Project = {
      ...projectRef.current,
      clips: projectRef.current.clips.filter((clip) => clip.assetId !== asset.id),
      transitions: (projectRef.current.transitions || []).filter((transition) =>
        !linkedClips.some((clip) => clip.id === transition.fromClipId || clip.id === transition.toClipId)
      ),
      removedAssetIds: [...new Set([...(projectRef.current.removedAssetIds || []), asset.id])],
    };
    commit(() => nextProject);
    if (selectedClipId && linkedClips.some((clip) => clip.id === selectedClipId)) setSelectedClipId(null);
    if (selectedAssetId === asset.id) setSelectedAssetId(null);
    void persistProjectSnapshot(nextProject, assetsRef.current).then(() => notify('Media reference removed. The source file was left untouched.'))
      .catch(() => notify('Could not save the project after removing this media reference.', true));
  };
  const showMediaDetails = (asset: Asset) => {
    setDetailsDialog({
      title: 'Media properties',
      rows: [
        ['Name', asset.name],
        ['Type', asset.mimeType || 'Unknown'],
        ['Dimensions', asset.width && asset.height ? `${asset.width} × ${asset.height}` : 'Not available'],
        ['Duration', asset.duration ? formatTime(asset.duration) : 'Not available'],
        ['File size', formatBytes(asset.byteSize)],
        ['Storage', 'Stored locally in this browser'],
        ['Source file', 'Not changed or deleted'],
      ],
    });
  };
  const renameSavedProject = async (record: SavedProject) => {
    const name = window.prompt('Rename project', record.project.name);
    if (name === null || !name.trim() || name.trim() === record.project.name) return;
    const cleanedName = name.trim();
    const nameError = getProjectNameError(cleanedName);
    if (nameError) { notify(nameError, true); return; }
    const updatedProject = { ...record.project, name: cleanedName };
    try {
      const projectAssets = await readLocalMedia(record.project.id);
      await persistProjectSnapshot(updatedProject, projectAssets);
      if (projectRef.current.id === record.project.id) commit(() => updatedProject);
      setSavedProjects(await readLocalProjects());
      notify('Project renamed.');
    } catch {
      notify('Could not rename this project in local storage.', true);
    }
  };
  const duplicateSavedProject = async (record: SavedProject) => {
    const duplicateProject: Project = { ...record.project, id: uid(), name: `${record.project.name} copy`, exports: [] };
    try {
      const projectAssets = await readLocalMedia(record.project.id);
      await copyLocalMedia(record.project.id, duplicateProject.id);
      await persistProjectSnapshot(duplicateProject, projectAssets);
      setSavedProjects(await readLocalProjects());
      notify(`Created “${duplicateProject.name}” as a separate project.`);
    } catch {
      try { await deleteLocalProject(duplicateProject.id); } catch { /* no entry was created */ }
      notify('Could not duplicate this project. Check available browser storage.', true);
    }
  };
  const showProjectDetails = async (record: SavedProject) => {
    let mediaCount = record.assets.length;
    try { mediaCount = (await readLocalMedia(record.project.id)).length; } catch { /* display saved metadata count */ }
    const latestExport = (record.project.exports || []).slice(-1)[0];
    setDetailsDialog({
      title: 'Project details',
      rows: [
        ['Name', record.project.name],
        ['Folder', projectFolders.find((folder) => folder.id === record.project.folderId)?.name || 'Unorganized Projects'],
        ['Last saved', new Date(record.savedAt).toLocaleString()],
        ['Media items', String(mediaCount)],
        ['Timeline clips', String(record.project.clips.length)],
        ['Tracks', String(record.project.tracks.length)],
        ['Canvas', `${record.project.width} × ${record.project.height} at ${record.project.frameRate} fps`],
        ['Recorded exports', String(record.project.exports?.length || 0)],
        ...(latestExport ? [
          ['Latest export', `${latestExport.filename} · ${new Date(latestExport.exportedAt).toLocaleString()}`] as [string, string],
          ['Export destination', latestExport.computerFolderName
            ? `Computer folder “${latestExport.computerFolderName}”`
            : latestExport.saveMethod === 'browser-download'
              ? 'Browser download'
              : latestExport.saveMethod === 'save-picker'
                ? 'Location selected in browser'
                : 'Not recorded'] as [string, string],
          ['Recorded in Cutline folder', projectFolders.find((folder) => folder.id === latestExport.folderId)?.name || 'Unorganized Projects'] as [string, string],
        ] : []),
        ['Project ID', record.project.id],
      ],
    });
  };
  const deleteSavedProject = async (record: SavedProject) => {
    if (!window.confirm(`Delete “${record.project.name}” and its Cutline-stored media copies from this browser? Original files on your computer will not be deleted.`)) return;
    try {
      await deleteLocalProject(record.project.id);
      const remaining = await readLocalProjects();
      setSavedProjects(remaining);
      if (projectRef.current.id === record.project.id) {
        history.current = [];
        future.current = [];
        setProject(createProject(nextProjectName(remaining)));
        setAssets([]);
        setSelectedClipId(null);
        setSelectedAssetId(null);
        setPlayhead(0);
      }
      notify('Project removed from this browser. Original files were not deleted.');
    } catch {
      notify('Could not delete this project from local storage.', true);
    }
  };
  const makeProjectBackup = async (record: SavedProject) => {
    try {
      await createProjectBackup(record);
      notify('Project backup created.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not create the project backup.', true);
    }
  };
  const importProjectBackup = async (file: File) => {
    const projectId = uid();
    try {
      if (file.size > 64 * 1024 * 1024) {
        throw new Error('Project backups over 64 MB are not imported in the browser to protect memory. Use a smaller backup.');
      }
      const payload = JSON.parse(await file.text()) as {
        schemaVersion?: number;
        project?: Project;
        assets?: Array<AssetMetadata & { dataBase64?: string }>;
      };
      const source = payload.project;
      if (
        payload.schemaVersion !== 1 ||
        !source ||
        typeof source.name !== 'string' ||
        !Array.isArray(source.tracks) ||
        !Array.isArray(source.clips) ||
        !Array.isArray(payload.assets) ||
        !Number.isFinite(source.width) ||
        !Number.isFinite(source.height) ||
        !Number.isFinite(source.frameRate)
      ) {
        throw new Error('This is not a valid Cutline project backup.');
      }
      const importedProject: Project = { ...source, id: projectId, folderId: null };
      const importedAssets: Asset[] = payload.assets.map((item) => {
        const { dataBase64, ...metadata } = item;
        if (!dataBase64 || typeof dataBase64 !== 'string') throw new Error(`Backup media “${item.name}” is missing file data.`);
        const binary = atob(dataBase64);
        const bytes = new Uint8Array(binary.length);
        for (let offset = 0; offset < binary.length; offset += 0x8000) {
          const end = Math.min(binary.length, offset + 0x8000);
          for (let index = offset; index < end; index += 1) bytes[index] = binary.charCodeAt(index);
        }
        return { ...metadata, blob: new Blob([bytes], { type: metadata.mimeType || 'application/octet-stream' }) };
      });
      await saveLocalMedia(projectId, importedAssets);
      await saveLocalProject(importedProject, importedAssets);
      setSavedProjects(await readLocalProjects());
      notify(`Imported “${importedProject.name}” into this browser’s project library.`);
    } catch (error) {
      try { await deleteLocalProject(projectId); } catch { /* keep the original import error */ }
      notify(error instanceof Error ? error.message : 'Could not import this project backup.', true);
    }
  };
  const snapTimelineTime = (time: number, ignoreClipId?: string) => {
    if (!snapEnabled) return time;
    const targets = [0, Math.round(time / 5) * 5];
    for (const clip of projectRef.current.clips) {
      if (clip.id === ignoreClipId) continue;
      targets.push(clip.timelineStart, clip.timelineStart + getClipDuration(clip));
    }
    const nearest = targets.reduce((best, candidate) => Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best, time);
    return Math.abs(nearest - time) <= .14 ? nearest : time;
  };
  const commitCustomCanvasDimension = (dimension: 'width' | 'height') => {
    const input = customCanvas[dimension].trim();
    const parsed = Number(input);
    if (!input || !Number.isFinite(parsed)) {
      setCustomCanvas({ width: String(projectRef.current.width), height: String(projectRef.current.height) });
      return;
    }
    const value = Math.max(144, Math.min(3840, Math.round(parsed / 2) * 2));
    setCustomCanvas((current) => ({ ...current, [dimension]: String(value) }));
    setCustomCanvasMode(true);
    commit((current) => ({ ...current, [dimension]: value }));
  };

  const getPreviewPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / Math.max(1, rect.width) * project.width,
      y: (event.clientY - rect.top) / Math.max(1, rect.height) * project.height,
    };
  };
  const startMarkupDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const point = getPreviewPoint(event);
    const videoClip = selectedClipIsVideo ? selectedClip : null;
    if (!videoClip) {
      notify('Select one video clip before adding markup.', true);
      return;
    }
    const track = project.tracks.find((item) => item.id === videoClip.trackId);
    if (track?.locked) {
      notify('Unlock the video track before adding markup.', true);
      return;
    }
    if (track?.visible === false) {
      notify('Show the selected video track before adding markup.', true);
      return;
    }
    const clipEnd = videoClip.timelineStart + getClipDuration(videoClip);
    if (playhead < videoClip.timelineStart || playhead >= clipEnd) {
      notify('Move the playhead inside the selected video clip before adding markup.', true);
      return;
    }
    if (markupTool === 'eraser') {
      const candidates = (project.markups || []).filter((drawing) => playhead >= drawing.start && playhead < drawing.end);
      const nearest = candidates
        .map((drawing) => ({
          drawing,
          distance: Math.min(...drawing.points.map((candidate) => Math.hypot(candidate.x - point.x, candidate.y - point.y))),
        }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (nearest && nearest.distance <= Math.max(22, markupSize * 2)) {
        commit((current) => ({ ...current, markups: (current.markups || []).filter((drawing) => drawing.id !== nearest.drawing.id) }));
      } else {
        notify('Click close to a drawing to erase it.');
      }
      return;
    }
    const drawing: MarkupDrawing = {
      id: uid(),
      tool: markupTool,
      points: [point, point],
      start: playhead,
      end: Math.max(playhead + .05, Math.min(playhead + markupDuration, clipEnd)),
      color: markupColor,
      size: markupSize,
      opacity: markupOpacity / 100,
      lineStyle: markupLineStyle,
      fillColor: markupFillColor,
      fillOpacity: markupFillOpacity / 100,
      ...(markupTool === 'text' ? { content: markupNoteText.trim() || 'Note' } : {}),
    };
    event.preventDefault();
    if (markupTool === 'text') {
      commit((current) => ({ ...current, markups: [...(current.markups || []), drawing] }));
      return;
    }
    markupPointerDrag.current = { pointerId: event.pointerId, drawing, initialProject: projectRef.current };
    setMarkupDraft(drawing);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const moveMarkupDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = markupPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = getPreviewPoint(event);
    const points = drag.drawing.tool === 'pen' || drag.drawing.tool === 'highlighter'
      ? [...drag.drawing.points, point]
      : [drag.drawing.points[0], point];
    const updated = { ...drag.drawing, points };
    drag.drawing = updated;
    setMarkupDraft(updated);
  };
  const finishMarkupDrawing = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = markupPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    markupPointerDrag.current = null;
    setMarkupDraft(null);
    commit((current) => ({ ...current, markups: [...(current.markups || []), drag.drawing] }));
  };
  const pointInPolygon = (point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i];
      const b = polygon[j];
      const crosses = (a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y || 1) + a.x;
      if (crosses) inside = !inside;
    }
    return inside;
  };
  const startPreviewTextDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext('2d');
    if (!context) return;
    const point = getPreviewPoint(event);
    const clip = [...activeVisualClips].reverse().find((candidate) => {
      if (!candidate.text) return false;
      const bounds = getTextOverlayBounds(context, candidate, project);
      return Boolean(bounds && pointInPolygon(point, bounds));
    });
    if (!clip) {
      setSelectedClipId(null);
      setSelectedAssetId(null);
      return;
    }
    event.preventDefault();
    setSelectedClipId(clip.id);
    setSelectedAssetId(null);
    setPlayhead(clip.timelineStart);
    const transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
    const track = project.tracks.find((item) => item.id === clip.trackId);
    if (track?.locked) return;
    const corners = getTextOverlayBounds(context, clip, project) || [];
    const radius = Math.max(12, project.width / 110);
    const closeToCorner = corners.some((corner) => Math.hypot(corner.x - point.x, corner.y - point.y) < radius);
    const topCenter = corners.length === 4
      ? { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 }
      : point;
    const center = corners.length
      ? { x: corners.reduce((sum, item) => sum + item.x, 0) / corners.length, y: corners.reduce((sum, item) => sum + item.y, 0) / corners.length }
      : point;
    const vx = topCenter.x - center.x;
    const vy = topCenter.y - center.y;
    const length = Math.hypot(vx, vy) || 1;
    const rotationHandle = { x: topCenter.x + vx / length * 28, y: topCenter.y + vy / length * 28 };
    const closeToRotationHandle = Math.hypot(rotationHandle.x - point.x, rotationHandle.y - point.y) < radius;
    const originX = project.width / 2 + transform.x;
    const originY = project.height / 2 + transform.y;
    const mode: TextPointerDrag['mode'] = closeToRotationHandle ? 'rotate' : closeToCorner ? 'scale' : 'move';
    textPointerDrag.current = {
      clipId: clip.id,
      pointerId: event.pointerId,
      mode,
      startX: point.x,
      startY: point.y,
      originX,
      originY,
      startDistance: Math.max(1, Math.hypot(point.x - originX, point.y - originY)),
      startAngle: Math.atan2(point.y - originY, point.x - originX),
      initialTransform: transform,
      initialProject: projectRef.current,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const movePreviewTextDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = textPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const point = getPreviewPoint(event);
    const deltaX = point.x - drag.startX;
    const deltaY = point.y - drag.startY;
    const nextTransform: Partial<ClipTransform> = drag.mode === 'move'
      ? { x: drag.initialTransform.x + deltaX, y: drag.initialTransform.y + deltaY }
      : drag.mode === 'scale'
        ? { scale: Math.max(.1, Math.min(4, drag.initialTransform.scale * Math.hypot(point.x - drag.originX, point.y - drag.originY) / drag.startDistance)) }
        : { rotation: drag.initialTransform.rotation + (Math.atan2(point.y - drag.originY, point.x - drag.originX) - drag.startAngle) * 180 / Math.PI };
    setProject((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === drag.clipId
        ? { ...clip, transform: { ...DEFAULT_TRANSFORM, ...clip.transform, ...nextTransform } }
        : clip),
    }));
  };
  const finishPreviewTextDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = textPointerDrag.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const updated = projectRef.current.clips.find((clip) => clip.id === drag.clipId);
    const before = drag.initialProject.clips.find((clip) => clip.id === drag.clipId);
    if (updated && before && JSON.stringify(updated.transform) !== JSON.stringify(before.transform)) {
      history.current = [...history.current.slice(-39), drag.initialProject];
      future.current = [];
      setHistoryRevision((revision) => revision + 1);
    }
    textPointerDrag.current = null;
  };
  const startPreviewPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (libraryWorkspace === 'markup') startMarkupDrawing(event);
    else startPreviewTextDrag(event);
  };
  const movePreviewPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (markupPointerDrag.current) moveMarkupDrawing(event);
    else movePreviewTextDrag(event);
  };
  const finishPreviewPointer = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (markupPointerDrag.current) finishMarkupDrawing(event);
    else finishPreviewTextDrag(event);
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented) return;
      const editing = target instanceof HTMLElement && (
        target.isContentEditable ||
        target.matches('input, textarea, select') ||
        target.closest('[role="combobox"], [role="listbox"], [role="option"], [role="menu"], [role="menuitem"], [role="dialog"], [data-radix-popper-content-wrapper]')
      );
      if (editing) return;
      if (contextMenu) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); return; }
      if (modifier && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); return; }
      if (modifier && event.key.toLowerCase() === 'c') { event.preventDefault(); copySelectedClip(); return; }
      if (modifier && event.key.toLowerCase() === 'v') { event.preventDefault(); pasteClip(); return; }
      if (modifier && event.key.toLowerCase() === 'd') { event.preventDefault(); duplicateSelectedClip(); return; }
      if (!modifier && event.key.toLowerCase() === 's' && selectedClipId) { event.preventDefault(); splitSelected(); return; }
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClipId) removeSelected();
      if (event.key === 'Escape') { setSelectedClipId(null); setSelectedAssetId(null); closeContextMenu(); }
      if (event.key === 'ArrowLeft') setPlayhead((time) => Math.max(0, time - 1 / project.frameRate));
      if (event.key === 'ArrowRight') setPlayhead((time) => Math.min(timelineEnd, time + 1 / project.frameRate));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const timelinePosition = (event: DragEvent, trackId: string) => {
    const lane = event.currentTarget.getBoundingClientRect();
    return { time: Math.max(0, (event.clientX - lane.left) / scale), trackId };
  };

  const exportCut = async () => {
    if (!project.clips.length) { notify('Add a clip to the timeline before exporting.', true); return; }
    const end = Math.max(
      ...project.clips.map((clip) => clip.timelineStart + getClipDuration(clip)),
      ...(project.markups || []).map((drawing) => drawing.end),
    );
    const exportBitrate = getExportVideoBitrate(project.width, project.height, project.frameRate);
    const extension = format;
    const requestedBaseName = sanitizeExportBaseName(exportName);
    let baseName = getUniqueExportBaseName(
      requestedBaseName,
      extension,
      (project.exports || []).map((item) => item.filename),
    );
    const outputDirectory = exportDirectory;
    const pickerWindow = window as FileAccessWindow;
    let fileHandle: WritableFileHandle | null = null;
    let outputFileName = `${baseName}.${extension}`;
    let renderedByteSize: number | undefined;
    let outputMessage = '';
    try {
      if (outputDirectory) {
        const permission = await outputDirectory.queryPermission?.({ mode: 'readwrite' });
        if (permission !== 'granted') {
          const requested = await outputDirectory.requestPermission?.({ mode: 'readwrite' });
          if (requested !== 'granted') {
            throw new Error('Write permission for the selected computer folder was not granted.');
          }
        }
        const occupiedNames = (project.exports || []).map((item) => item.filename);
        while (true) {
          baseName = getUniqueExportBaseName(requestedBaseName, extension, occupiedNames);
          outputFileName = `${baseName}.${extension}`;
          try {
            await outputDirectory.getFileHandle(outputFileName);
            occupiedNames.push(outputFileName);
          } catch (error) {
            if (error instanceof DOMException && error.name === 'NotFoundError') break;
            throw error;
          }
        }
      } else if (pickerWindow.showSaveFilePicker) {
        // Open a file picker before codec detection while the click is still user initiated.
        fileHandle = await pickerWindow.showSaveFilePicker({
          suggestedName: `${baseName}.${extension}`,
          types: [{ description: `${extension.toUpperCase()} video`, accept: { [format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${extension}`] } }],
        });
        outputFileName = fileHandle.name || `${baseName}.${extension}`;
      } else {
        const estimatedBytes = end * (exportBitrate + 128_000) / 8;
        if (end > 30 || estimatedBytes > 64 * 1024 * 1024) {
          notify('This browser cannot stream exports to disk. Use current Edge or Chrome with the Save File dialog, or shorten the cut to 30 seconds or less before using the in-memory fallback.', true);
          return;
        }
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      notify(`Could not open an export file: ${error instanceof Error ? error.message : 'browser file access was denied'}`, true);
      return;
    }
    if (baseName !== sanitizeExportBaseName(exportName)) {
      setExportName(baseName);
      notify(`That filename already exists. Using “${baseName}.${extension}” instead.`);
    } else if (exportName !== baseName) {
      setExportName(baseName);
    }

    setExportElapsed(0);
    exportStartedAt.current = performance.now();
    setExporting(true);
    exportCancelRequested.current = false;
    setExportProgress(0);
    const liveUrls: string[] = [];
    const videos = new Map<string, HTMLVideoElement>();
    const images = new Map<string, HTMLImageElement>();
    const mediaByAsset = new Map<string, HTMLImageElement | HTMLVideoElement>();
    const audioJobs: Array<{ clip: Clip; media: HTMLAudioElement; gain: GainNode }> = [];
    let audioContext: AudioContext | null = null;
    let audioSource: MediaStreamAudioTrackSource | null = null;
    let audioTrack: MediaStreamTrack | null = null;
    let videoSource: CanvasSource | null = null;
    let output: Output | null = null;
    let exportCanvas: HTMLCanvasElement | null = null;
    let diskWriter: WritableFile | null = null;
    let outputCompleted = false;
    let failureFromAudio: unknown = null;
    try {
      if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
        throw new Error('This browser does not expose WebCodecs encoders. Update Edge or Chrome to a current version.');
      }
      const [videoAvailable, audioAvailable] = await Promise.all([
        canEncode(format === 'mp4' ? 'avc' : 'vp8'),
        canEncode(format === 'mp4' ? 'aac' : 'opus'),
      ]);
      if (!videoAvailable || !audioAvailable) {
        const codecs = format === 'mp4' ? 'AVC video and AAC audio' : 'VP8 video and Opus audio';
        throw new Error(`${codecs} encoding is not supported by this browser or hardware. Select the other format, or update your browser and graphics drivers.`);
      }

      let target: BufferTarget | StreamTarget;
      if (outputDirectory) {
        const outputHandle = await outputDirectory.getFileHandle(outputFileName, { create: true });
        diskWriter = await (outputHandle.createWritable() as Promise<WritableFile>);
        const writable = new WritableStream<StreamTargetChunk>({
          write: (chunk) => diskWriter!.write({ type: 'write', position: chunk.position, data: chunk.data }),
          close: () => diskWriter!.close(),
          abort: (reason) => diskWriter!.abort(reason),
        });
        target = new StreamTarget(writable);
      } else if (fileHandle) {
        diskWriter = await (fileHandle.createWritable() as Promise<WritableFile>);
        const writable = new WritableStream<StreamTargetChunk>({
          write: (chunk) => diskWriter!.write({ type: 'write', position: chunk.position, data: chunk.data }),
          close: () => diskWriter!.close(),
          abort: (reason) => diskWriter!.abort(reason),
        });
        target = new StreamTarget(writable);
      } else {
        target = new BufferTarget();
      }
      const selectedFormat = format === 'mp4' ? new Mp4OutputFormat({ fastStart: false }) : new WebMOutputFormat();
      output = new Output({ format: selectedFormat, target });

      exportCanvas = document.createElement('canvas');
      exportCanvas.width = project.width;
      exportCanvas.height = project.height;
      const context = exportCanvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      videoSource = new CanvasSource(exportCanvas, {
        codec: format === 'mp4' ? 'avc' : 'vp8',
        quality: new Quality({ bitrate: exportBitrate }),
        hardwareAcceleration: 'no-preference',
      });
      output.addVideoTrack(videoSource, { frameRate: project.frameRate });

      const usedAssetIds = new Set(project.clips.flatMap((clip) => clip.assetId ? [clip.assetId] : []));
      const usedAssets: Asset[] = [];
      usedAssetIds.forEach((assetId) => {
        const asset = renderIndex.assetsById.get(assetId);
        if (asset) usedAssets.push(asset);
      });
      const clipsWithAudio = project.clips.filter((clip) => {
        if (!clip.assetId) return false;
        const asset = renderIndex.assetsById.get(clip.assetId);
        const track = renderIndex.tracksById.get(clip.trackId);
        const sourceHasAudio = Boolean(asset && (isAudio(asset) || (isVideo(asset) && asset.hasAudio !== false)));
        return Boolean(asset && track && !clip.muted && !track.muted && sourceHasAudio &&
          (track.kind === 'audio' || (track.kind === 'video' && !clip.audioOnly)));
      });
      if (clipsWithAudio.length) {
        audioContext = new AudioContext();
        const audioDestination = audioContext.createMediaStreamDestination();
        for (const clip of project.clips) {
          if (!clip.assetId) continue;
          const asset = renderIndex.assetsById.get(clip.assetId);
          const track = renderIndex.tracksById.get(clip.trackId);
          const sourceHasAudio = Boolean(asset && (isAudio(asset) || (isVideo(asset) && asset.hasAudio !== false)));
          if (!asset || !track || clip.muted || track.muted || !sourceHasAudio ||
            (track.kind !== 'audio' && (track.kind !== 'video' || clip.audioOnly))) continue;
          const media = document.createElement('audio');
          media.preload = 'metadata';
          media.playbackRate = clip.speed;
          media.src = URL.createObjectURL(asset.blob);
          liveUrls.push(media.src);
          const sourceNode = audioContext.createMediaElementSource(media);
          const gain = audioContext.createGain();
          gain.gain.value = clip.volume;
          sourceNode.connect(gain);
          gain.connect(audioDestination);
          audioJobs.push({ clip, media, gain });
        }
        audioTrack = audioDestination.stream.getAudioTracks()[0];
        if (!audioTrack) throw new Error('The browser could not create an audio mix track.');
        audioSource = new MediaStreamAudioTrackSource(audioTrack as ConstructorParameters<typeof MediaStreamAudioTrackSource>[0], {
          codec: format === 'mp4' ? 'aac' : 'opus',
          quality: new Quality({ bitrate: 128_000 }),
        });
        void audioSource.errorPromise.catch((error: unknown) => { failureFromAudio = error; });
        output.addAudioTrack(audioSource);
      }

      for (const asset of usedAssets) {
        if (isImage(asset)) {
          const image = new Image();
          const url = URL.createObjectURL(asset.blob);
          liveUrls.push(url);
          image.src = url;
          await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error(`Could not decode image “${asset.name}”.`));
          });
          images.set(asset.id, image);
          mediaByAsset.set(asset.id, image);
        } else if (isVideo(asset)) {
          const video = document.createElement('video');
          const url = URL.createObjectURL(asset.blob);
          liveUrls.push(url);
          video.src = url;
          video.muted = true;
          video.preload = 'metadata';
          video.playsInline = true;
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error(`Timed out loading “${asset.name}”.`)), 15000);
            video.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
            video.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Could not decode video “${asset.name}” in this browser.`)); };
          });
          videos.set(asset.id, video);
          mediaByAsset.set(asset.id, video);
        }
      }
      await Promise.all(audioJobs.map(({ media, clip }) => new Promise<void>((resolve, reject) => {
        if (media.readyState >= 1) { resolve(); return; }
        const timeout = window.setTimeout(() => reject(new Error(`Timed out loading audio for clip ${clip.id}.`)), 15000);
        media.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
        media.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Could not decode audio for clip ${clip.id}.`)); };
      })));
      if (audioContext) await audioContext.resume();
      await output.start();
      const startedAt = performance.now();
      const frameDuration = 1 / project.frameRate;
      const totalFrames = getExportFrameCount(end, project.frameRate);
      let nextFrameNumber = 0;
      await new Promise<void>((resolve, reject) => {
        const drawFrame = async (now: number) => {
          if (exportCancelRequested.current) {
            reject(new DOMException('Export cancelled by the user.', 'AbortError'));
            return;
          }
          const elapsed = Math.min(end, (now - startedAt) / 1000);
          const lastAvailableFrame = Math.min(totalFrames - 1, Math.floor(elapsed * project.frameRate + 1e-7));
          while (nextFrameNumber <= lastAvailableFrame) {
            if (exportCancelRequested.current) {
              reject(new DOMException('Export cancelled by the user.', 'AbortError'));
              return;
            }
            const timestamp = nextFrameNumber * frameDuration;
            const t = Math.min(end, timestamp);
            if (failureFromAudio) { reject(failureFromAudio); return; }
            renderProjectFrame(context, project, assets, mediaByAsset, t, true, undefined, undefined, renderIndex);
            audioJobs.forEach(({ clip, media, gain }) => {
              const active = t >= clip.timelineStart && t < clip.timelineStart + getClipDuration(clip);
              if (active) {
                const desired = clip.sourceIn + (t - clip.timelineStart) * clip.speed;
                if (Math.abs(media.currentTime - desired) > .35) {
                  try { media.currentTime = desired; } catch { /* media metadata may still be loading */ }
                }
                gain.gain.value = (clip.muted ? 0 : clip.volume) * getAudioFade(clip, t);
                media.playbackRate = clip.speed;
                if (media.paused) void media.play().catch((error: unknown) => { failureFromAudio = error; });
              } else if (!media.paused) media.pause();
            });
            try {
              await videoSource!.add(timestamp, Math.min(frameDuration, Math.max(0, end - timestamp)));
            } catch (error) {
              reject(error);
              return;
            }
            nextFrameNumber += 1;
          }
          setExportProgress(getExportProgress(nextFrameNumber, totalFrames));
          if (elapsed >= end && nextFrameNumber >= totalFrames) { resolve(); return; }
          requestAnimationFrame((nextNow) => { void drawFrame(nextNow).catch(reject); });
        };
        requestAnimationFrame((now) => { void drawFrame(now).catch(reject); });
      });

      videos.forEach((video) => video.pause());
      audioJobs.forEach(({ media }) => media.pause());
      if (failureFromAudio) throw failureFromAudio;
      videoSource.close();
      audioSource?.close();
      await output.finalize();
      outputCompleted = true;
      setExportProgress(100);
      if (target instanceof BufferTarget) {
        const buffer = target.buffer;
        if (!buffer) throw new Error('The encoder finished without producing a file.');
        const blob = new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
        renderedByteSize = blob.size;
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = outputFileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        outputMessage = `Rendered ${formatBytes(blob.size)} ${extension.toUpperCase()} locally`;
      } else {
        outputMessage = outputDirectory
          ? `Rendered ${outputFileName} in computer folder “${outputDirectory.name}”`
          : `Rendered ${fileHandle?.name || outputFileName} to the location selected in the browser`;
      }
      const currentProject = projectRef.current;
      const filename = fileHandle?.name || outputFileName;
      const exportRecord = {
        id: uid(),
        filename,
        format: extension,
        folderId: exportFolderId === 'unorganized' ? null : exportFolderId,
        exportedAt: Date.now(),
        ...(renderedByteSize === undefined ? {} : { byteSize: renderedByteSize }),
        saveMethod: outputDirectory ? 'computer-folder' as const : fileHandle ? 'save-picker' as const : 'browser-download' as const,
        ...(outputDirectory ? { computerFolderName: outputDirectory.name } : {}),
      };
      const updatedProject: Project = { ...currentProject, exports: [...(currentProject.exports || []), exportRecord] };
      setProject(updatedProject);
      try {
        await persistProjectSnapshot(updatedProject, assetsRef.current);
        setSavedProjects(await readLocalProjects());
      } catch {
        outputMessage += '. The video rendered, but its export history could not be saved';
      }
      const destination = exportFolderId === 'unorganized'
        ? 'Unorganized Projects'
        : projectFolders.find((folder) => folder.id === exportFolderId)?.name || 'the selected internal folder';
      notify(`${outputMessage}. Recorded under “${destination}” in Cutline. The Cutline folder organizes project history and does not move the project.`);
      setDialog(null);
    } catch (error) {
      if (exportCancelRequested.current && error instanceof DOMException && error.name === 'AbortError') {
        notify('Export stopped. No finished file was saved.');
      } else {
      const message = error instanceof Error ? error.message : String(error);
      notify(`Export failed: ${message}. Check browser codec support, free disk space, and local file permissions.`, true);
      }
    } finally {
      if (!outputCompleted && output && output.state !== 'canceled' && output.state !== 'finalized') {
        try { await output.cancel(); } catch { /* preserve the original encoder or storage error */ }
      }
      audioJobs.forEach(({ media }) => { media.pause(); media.removeAttribute('src'); media.load(); });
      videos.forEach((video) => { video.pause(); video.removeAttribute('src'); video.load(); });
      audioSource?.close();
      videoSource?.close();
      audioTrack?.stop();
      liveUrls.forEach(URL.revokeObjectURL);
      if (audioContext && audioContext.state !== 'closed') await audioContext.close();
      if (diskWriter && !outputCompleted) {
        try { await diskWriter.abort(); } catch { /* writer may already be closed by Output */ }
      }
      if (exportCanvas) { exportCanvas.width = 0; exportCanvas.height = 0; }
      exportStartedAt.current = null;
      setExporting(false);
      setExportProgress(0);
    }
  };

  const contextMenuAsset = contextMenu?.kind === 'media' ? assets.find((asset) => asset.id === contextMenu.id) : undefined;
  const contextMenuClip = contextMenu?.kind === 'clip' ? project.clips.find((clip) => clip.id === contextMenu.id) : undefined;
  const contextMenuClipAsset = contextMenuClip?.assetId ? assets.find((asset) => asset.id === contextMenuClip.assetId) : undefined;
  const contextMenuClipLocked = Boolean(contextMenuClip && project.tracks.find((track) => track.id === contextMenuClip.trackId)?.locked);
  const contextMenuProject = contextMenu?.kind === 'project' ? savedProjects.find((record) => record.project.id === contextMenu.id) : undefined;
  const visibleSavedProjects = useMemo(() => {
    const query = projectSearch.trim().toLowerCase();
    return savedProjects
      .filter((record) => record.project.name.toLowerCase().includes(query))
      .filter((record) => selectedProjectFolder === 'all'
        ? true
        : selectedProjectFolder === 'unorganized'
          ? !record.project.folderId
          : record.project.folderId === selectedProjectFolder)
      .sort((a, b) => projectSort === 'name'
        ? a.project.name.localeCompare(b.project.name)
        : b.savedAt - a.savedAt);
  }, [savedProjects, projectSearch, projectSort, selectedProjectFolder]);
  const missingProjectAssets = useMemo(() => {
    const currentRecord = savedProjects.find((record) => record.project.id === project.id);
    const metadataById = new Map((currentRecord?.assets || []).map((asset) => [asset.id, asset]));
    const missingIds = new Set<string>();
    for (const asset of currentRecord?.assets || []) {
      if (!assets.some((loaded) => loaded.id === asset.id)) missingIds.add(asset.id);
    }
    for (const clip of project.clips) {
      if (clip.assetId && !assets.some((loaded) => loaded.id === clip.assetId)) missingIds.add(clip.assetId);
    }
    return Array.from(missingIds, (id): AssetMetadata => metadataById.get(id) || {
      id,
      name: 'Missing media file',
      mimeType: 'application/octet-stream',
      byteSize: 0,
    });
  }, [assets, project, savedProjects]);
  const projectFolderOptions = [
    { value: 'unorganized', label: 'Unorganized projects' },
    ...projectFolders.map((folder) => ({ value: folder.id, label: folder.name })),
  ];
  const projectDestinationOptions = [
    ...(!savedProjects.some((record) => record.project.id === project.id)
      ? [{ value: project.id, label: `${project.name} (Active project)` }]
      : []),
    ...savedProjects.map((record) => ({
      value: record.project.id,
      label: record.project.id === project.id ? `${project.name} (Active project)` : record.project.name,
    })),
  ];
  const contextMenuItems: ContextMenuItem[] = contextMenu?.kind === 'clip' && contextMenuClip ? [
    ...(contextMenuClip.text ? [{
      label: 'Edit Text',
      icon: <Pencil size={14} />,
      disabled: contextMenuClipLocked,
      action: () => {
        setSelectedClipId(contextMenuClip.id);
        setLibraryWorkspace('text');
        window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="input-title-content"]')?.focus(), 0);
      },
    }] : []),
    {
      label: 'Rename Clip',
      icon: <Pencil size={14} />,
      disabled: contextMenuClipLocked,
      action: () => {
        const currentName = contextMenuClip.displayName || contextMenuClip.text?.templateName || contextMenuClipAsset?.name || 'Text clip';
        const name = window.prompt('Clip name (does not change the displayed text or source file)', currentName);
        if (name?.trim()) commit((current) => ({
          ...current,
          clips: current.clips.map((clip) => clip.id === contextMenuClip.id ? { ...clip, displayName: name.trim() } : clip),
        }));
      },
    },
    { label: 'Duplicate', icon: <Copy size={14} />, action: duplicateSelectedClip, disabled: contextMenuClipLocked },
    { label: 'Copy', icon: <Copy size={14} />, action: copySelectedClip, separatorBefore: true },
    { label: 'Paste at Playhead', icon: <Copy size={14} />, action: pasteClip, disabled: !clipboardClip.current },
    { label: 'Split at Playhead', icon: <Split size={14} />, action: splitSelected, disabled: contextMenuClipLocked, separatorBefore: true },
    {
      label: 'Edit Timing & Duration',
      icon: <SlidersHorizontal size={14} />,
      disabled: contextMenuClipLocked,
      action: () => document.querySelector<HTMLElement>('[data-testid="input-timeline-position"]')?.focus(),
    },
    {
      label: 'Clip Properties',
      icon: <Info size={14} />,
      action: () => setDetailsDialog({
        title: 'Clip properties',
        rows: [
          ['Name', contextMenuClip.displayName || contextMenuClip.text?.templateName || contextMenuClipAsset?.name || 'Text clip'],
          ['Type', contextMenuClip.text ? 'Text overlay' : contextMenuClip.audioOnly ? 'Audio from video' : contextMenuClipAsset?.mimeType || 'Unknown'],
          ['Timeline start', `${contextMenuClip.timelineStart.toFixed(2)} sec`],
          ['Duration', `${getClipDuration(contextMenuClip).toFixed(2)} sec`],
          ['Source in', `${contextMenuClip.sourceIn.toFixed(2)} sec`],
          ['Source out', `${contextMenuClip.sourceOut.toFixed(2)} sec`],
          ['Track', project.tracks.find((track) => track.id === contextMenuClip.trackId)?.name || 'Unknown'],
        ],
      }),
    },
    { label: 'Ripple Delete', icon: <Trash2 size={14} />, action: rippleDeleteSelected, disabled: contextMenuClipLocked, destructive: true, separatorBefore: true },
    { label: contextMenuClip.text ? 'Delete Text Clip' : 'Remove from Timeline', icon: <Trash2 size={14} />, action: removeSelected, disabled: contextMenuClipLocked, destructive: true },
  ] : contextMenu?.kind === 'media' && contextMenuAsset ? [
    { label: 'Rename', icon: <Pencil size={14} />, action: () => void renameMedia(contextMenuAsset) },
    { label: 'Duplicate', icon: <Copy size={14} />, action: () => void duplicateMedia(contextMenuAsset) },
    { label: 'Add to Timeline', icon: <Plus size={14} />, action: () => addAssetToTimeline(contextMenuAsset, undefined, playhead, libraryWorkspace === 'audio'), separatorBefore: true },
    { label: 'Reveal Source File', icon: <FolderOpen size={14} />, action: () => undefined, disabled: true, hint: 'Not available in browser' },
    { label: 'Media Properties', icon: <Info size={14} />, action: () => showMediaDetails(contextMenuAsset) },
    { label: 'Remove from Project', icon: <Trash2 size={14} />, action: () => removeMediaFromProject(contextMenuAsset), destructive: true, separatorBefore: true },
  ] : contextMenu?.kind === 'project' && contextMenuProject ? [
    { label: 'Open Project', icon: <FolderOpen size={14} />, action: () => void openProject(contextMenuProject) },
    { label: 'Rename', icon: <Pencil size={14} />, action: () => void renameSavedProject(contextMenuProject) },
    { label: 'Duplicate Project', icon: <Copy size={14} />, action: () => void duplicateSavedProject(contextMenuProject), separatorBefore: true },
    { label: 'Project Details', icon: <Info size={14} />, action: () => void showProjectDetails(contextMenuProject) },
    { label: 'Create Backup', icon: <Download size={14} />, action: () => void makeProjectBackup(contextMenuProject) },
    { label: 'Delete Project', icon: <Trash2 size={14} />, action: () => void deleteSavedProject(contextMenuProject), destructive: true, separatorBefore: true },
  ] : contextMenu?.kind === 'empty' ? [
    { label: 'Import Media', icon: <Upload size={14} />, action: () => fileInput.current?.click() },
    { label: 'Refresh Media List', icon: <RefreshCw size={14} />, action: () => void refreshMedia(), separatorBefore: true },
  ] : [];

  return (
    <main className={`workspace ${dropActive ? 'drop-active' : ''}`}
      onDragEnter={(event) => {
        event.preventDefault();
        const types = Array.from(event.dataTransfer.types);
        if (!types.includes('application/x-cutline-asset') && !types.includes('application/x-cutline-clip')) setDropActive(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => { if (event.currentTarget === event.target) setDropActive(false); }}
      onDrop={(event) => {
        event.preventDefault(); setDropActive(false);
        const internal = event.dataTransfer.getData('application/x-cutline-asset');
        if (internal) { const asset = assets.find((item) => item.id === internal); if (asset) addAssetToTimeline(asset); }
         else if (event.dataTransfer.files.length) {
           if (project.clips.length === 0 && assets.length === 0) {
             setPendingDroppedFiles(Array.from(event.dataTransfer.files));
             setDropProjectId(projectRef.current.id);
             void openProjects();
           } else void importFiles(event.dataTransfer.files);
         }
      }}>
      <header className="topbar">
          <div className="brand" aria-label="Cutline">
          <img className="brand-mark" src={cutlineAppIcon} alt="" />
          <span className="brand-name">Cutline</span>
        </div>
          <div
            className={`save-state save-state--${saveState}`}
            role="status"
            aria-live="polite"
            title={saveState === 'error' ? 'The project is still available in this session. Select Save to retry.' : undefined}
            data-testid="status-save-state"
          >
          {saveState === 'saved'
            ? <Check className="save-state__icon" size={13} strokeWidth={2.4} aria-hidden="true" />
            : saveState === 'saving'
              ? <RefreshCw className="save-state__icon save-state__icon--spin" size={13} aria-hidden="true" />
              : saveState === 'error'
                ? <CircleAlert className="save-state__icon" size={13} aria-hidden="true" />
                : <Activity className="save-state__icon" size={13} aria-hidden="true" />}
          <span className="save-state__label">
            {saveState === 'saved' ? 'Saved'
              : saveState === 'dirty' ? 'Unsaved changes'
                : saveState === 'saving' ? 'Saving…'
                  : 'Save failed'}
          </span>
        </div>
        <div className="top-spacer" />
        <button className="icon-btn" onClick={undo} disabled={!history.current.length} title="Undo (Ctrl+Z)" data-testid="button-undo"><Undo2 size={16} /></button>
        <button className="icon-btn" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)" data-testid="button-redo"><Redo2 size={16} /></button>
        <button className="btn" onClick={openProjects} disabled={mediaImporting} title={mediaImporting ? 'Wait for media import to finish' : 'Manage projects'} aria-label="Open projects manager" data-testid="button-open-project"><FolderOpen size={14} /><span>Projects</span></button>
        <button className="btn" onClick={() => void saveNow()} data-testid="button-save-project"><HardDrive size={14} /><span>Save</span></button>
         <button className="btn primary" onClick={() => { setExportFolderId(project.folderId || 'unorganized'); setExportName(sanitizeExportBaseName(`${project.name}-export`)); setDialog('export'); }} data-testid="button-export"><Download size={14} /><span>Export</span></button>
      </header>
      <section className="editor-body">
        <nav className="workspace-rail" aria-label="Editing workspaces">
          {WORKSPACE_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`workspace-rail__item${libraryWorkspace === item.id ? ' is-active' : ''}`}
              aria-label={item.label}
              aria-pressed={libraryWorkspace === item.id}
              title={item.label}
              onClick={() => setLibraryWorkspace(item.id)}
              data-testid={`button-workspace-${item.id}`}
            >
              {item.icon}<span>{item.label}</span>
            </button>
          ))}
        </nav>
        <aside className="library">
          {(libraryWorkspace === 'media' || libraryWorkspace === 'audio' || libraryWorkspace === 'overlays') && <div className="panel-heading">
            {WORKSPACE_ITEMS.find((item) => item.id === libraryWorkspace)?.icon}
            {WORKSPACE_ITEMS.find((item) => item.id === libraryWorkspace)?.label}
            <small>{libraryWorkspace === 'media' ? `${filteredAssets.length} ITEMS` : libraryWorkspace === 'audio' ? `${filteredAssets.length} ITEMS` : ''}</small>
          </div>}
          {(libraryWorkspace === 'media' || libraryWorkspace === 'audio' || libraryWorkspace === 'overlays') && <>
            <div className="asset-tools">
              <label className="search-box"><Search size={13} /><input aria-label={`Search ${libraryWorkspace}`} data-testid="input-search-media" placeholder="Find media…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
              <button className="icon-btn active" title="Import local media" onClick={() => fileInput.current?.click()} data-testid="button-import"><Plus size={17} /></button>
              <input ref={fileInput} hidden type="file" multiple accept="video/*,audio/*,image/*,.mkv,.avi,.flac" onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} data-testid="input-media-files" />
              <input
                ref={relinkFileInput}
                hidden
                type="file"
                accept="video/*,audio/*,image/*,.mkv,.avi,.flac"
                aria-label="Choose replacement media file"
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  const assetId = relinkAssetId.current;
                  const metadata = missingProjectAssets.find((asset) => asset.id === assetId);
                  relinkAssetId.current = null;
                  event.currentTarget.value = '';
                  if (file && metadata) void relinkMissingAsset(metadata, file);
                }}
                data-testid="input-relink-media"
              />
            </div>
            <div className="asset-list" onContextMenu={(event) => {
              if (!(event.target instanceof Element) || !event.target.closest('[data-testid^="row-media-"]')) openContextMenu(event, 'empty');
            }}>
              {missingProjectAssets.map((missing) => (
                <div className="missing-media-row" key={missing.id} role="alert">
                  <span className="asset-thumb"><CircleAlert size={15} /></span>
                  <span className="asset-details">
                    <span className="asset-name">{missing.name}</span>
                    <span className="asset-meta">Media is unavailable in this browser. Relink the source file to restore its timeline clips.</span>
                  </span>
                  <button
                    type="button"
                    className="btn"
                    disabled={mediaImporting}
                    onClick={() => {
                      relinkAssetId.current = missing.id;
                      relinkFileInput.current?.click();
                    }}
                    data-testid={`button-relink-media-${missing.id}`}
                  >Relink</button>
                </div>
              ))}
              {filteredAssets.length === 0 ? (
                <button className="asset-row" style={{ minHeight: 72, cursor: 'pointer' }} onClick={() => fileInput.current?.click()} data-testid="button-empty-import">
                  <span className="asset-thumb"><Upload size={16} /></span><span className="asset-details"><span className="asset-name">{projectMediaAssets.length ? 'No matching media' : 'Bring in your first clip'}</span><span className="asset-meta">{projectMediaAssets.length ? 'Try another search or workspace' : 'Import files from this PC'}</span></span>
                </button>
              ) : filteredAssets.map((asset) => (
                <div key={asset.id} role="button" tabIndex={0} className={`asset-row${selectedAssetId === asset.id ? ' selected' : ''}${selectedClip?.assetId === asset.id ? ' selected-clip' : ''}`}
                  aria-current={selectedClip?.assetId === asset.id ? 'true' : undefined}
                  draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-cutline-asset', asset.id); event.dataTransfer.effectAllowed = 'copy'; }}
                  onClick={() => setSelectedAssetId(asset.id)}
                  onDoubleClick={() => addAssetToTimeline(asset, undefined, playhead, libraryWorkspace === 'audio')}
                  onContextMenu={(event) => openContextMenu(event, 'media', asset.id)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); addAssetToTimeline(asset, undefined, playhead, libraryWorkspace === 'audio'); }
                    openKeyboardContextMenu(event, 'media', asset.id);
                  }}
                  data-testid={`row-media-${asset.id}`}>
                  <span className="asset-thumb">{asset.thumbnail ? <img src={asset.thumbnail} alt="" /> : isImage(asset) ? <FileImage size={16} /> : isAudio(asset) ? <FileAudio size={16} /> : <Film size={17} />}</span>
                  <span className="asset-details"><span className="asset-name">{asset.name}</span><span className="asset-meta">{asset.duration ? formatTime(asset.duration) : 'Duration unavailable'} · {isVideo(asset) ? asset.hasAudio === false ? 'No embedded audio' : asset.hasAudio ? 'Embedded audio' : 'Audio not analyzed' : isAudio(asset) ? 'Audio source' : 'Still image'} · {formatBytes(asset.byteSize)}</span></span>
                  <button className="icon-btn asset-add" aria-label={`Add ${asset.name} to timeline`} onClick={(event) => { event.stopPropagation(); addAssetToTimeline(asset, undefined, playhead, libraryWorkspace === 'audio'); }} data-testid={`button-add-media-${asset.id}`}><Plus size={15} /></button>
                </div>
              ))}
            </div>
            <div className="library-foot">Media stays on this device. Removing an item only removes it from this project.</div>
          </>}
          {(libraryWorkspace === 'text' || libraryWorkspace === 'templates') && <TitleTemplatesPanel onAdd={addTitleTemplate} />}
          {(libraryWorkspace === 'effects' || libraryWorkspace === 'transitions' || libraryWorkspace === 'filters') &&
            <EffectWorkspace
              workspace={libraryWorkspace}
              disabled={Boolean(effectWorkspaceDisabledReason)}
              disabledReason={effectWorkspaceDisabledReason}
              onEffects={libraryWorkspace === 'filters' ? applySelectedFilter : applySelectedEffect}
              onTransition={applySelectedTransition}
              onRemoveTransition={removeSelectedTransition}
              hasSelectedTransition={selectedClipHasTransition && !selectedClipLocked}
              selectedTransition={selectedTransition}
              selectedEffects={selectedClip?.effects}
              thumbnail={selectedAsset?.thumbnail}
              canApplyTransition={canApplySelectedTransition}
            />}
          {libraryWorkspace === 'markup' && <MarkupWorkspace
            tool={markupTool}
            color={markupColor}
            fillColor={markupFillColor}
            size={markupSize}
            opacity={markupOpacity}
            fillOpacity={markupFillOpacity}
            duration={markupDuration}
            lineStyle={markupLineStyle}
            noteText={markupNoteText}
            drawings={project.markups || []}
            canUndo={history.current.length > 0}
            canRedo={future.current.length > 0}
            onTool={setMarkupTool}
            onColor={setMarkupColor}
            onFillColor={setMarkupFillColor}
            onSize={setMarkupSize}
            onOpacity={setMarkupOpacity}
            onFillOpacity={setMarkupFillOpacity}
            onDuration={setMarkupDuration}
            onLineStyle={setMarkupLineStyle}
            onNoteText={setMarkupNoteText}
            onUndo={undo}
            onRedo={redo}
            onClear={() => commit((current) => ({ ...current, markups: [] }))}
            onRemove={(id) => commit((current) => ({ ...current, markups: (current.markups || []).filter((drawing) => drawing.id !== id) }))}
          />}
        </aside>
        <section className="stage">
          <div className="stage-tools">
          <button className="icon-btn" title="Add video track" onClick={() => addTrack('video')} data-testid="button-add-video-track"><Layers2 size={15} /></button>
          <button className="icon-btn" title="Add audio track" onClick={() => addTrack('audio')} data-testid="button-add-audio-track"><AudioLines size={15} /></button>
          <button className="icon-btn" title="Add text track" onClick={() => addTrack('text')} data-testid="button-add-text-track"><Type size={15} /></button>
            <span className="divider" />
            <button className="icon-btn" title="Split selected clip at playhead" onClick={splitSelected} disabled={!selectedClip || selectedClipLocked} data-testid="button-split"><Split size={15} /></button>
            <button className="icon-btn" title="Delete selected clip" onClick={removeSelected} disabled={!selectedClip || selectedClipLocked} data-testid="button-delete-clip"><Trash2 size={15} /></button>
            <span className="divider" />
            <label>Canvas</label>
            <CutlineSelect
              aria-label="Canvas aspect ratio"
              value={customCanvasMode ? 'custom' : getCanvasAspectId(project.width, project.height)}
              options={[
                ...CANVAS_ASPECTS.map(({ id, label }) => ({ value: id, label })),
                { value: 'custom', label: 'Custom ratio' },
              ]}
              onValueChange={(value) => {
                if (value === 'custom') {
                  setCustomCanvasMode(true);
                  return;
                }
                const preset = CANVAS_ASPECTS.find((item) => item.id === value);
                if (!preset) return;
                setCustomCanvasMode(false);
                commit((current) => ({ ...current, width: preset.width, height: preset.height }));
              }}
              data-testid="select-canvas-aspect"
            />
            <CutlineSelect
              aria-label="Project resolution"
              value={getCanvasSizeValue(project.width, project.height)}
              options={[
                ...CANVAS_SIZES.map(({ value, label }) => ({ value, label })),
                { value: 'custom', label: 'Custom dimensions' },
              ]}
              onValueChange={(value) => {
                if (value === 'custom') {
                  setCustomCanvasMode(true);
                  setCustomCanvas({ width: String(project.width), height: String(project.height) });
                  return;
                }
                const [width, height] = value.split('x').map(Number);
                setCustomCanvasMode(false);
                commit((current) => ({ ...current, width, height }));
              }}
              data-testid="select-resolution"
            />
            {customCanvasMode && <div className="canvas-custom-dimensions" role="group" aria-label="Custom canvas dimensions">
              <label>W<input aria-label="Custom canvas width" type="number" min="144" max="3840" step="2" value={customCanvas.width} onChange={(event) => setCustomCanvas((current) => ({ ...current, width: event.currentTarget.value }))} onBlur={() => commitCustomCanvasDimension('width')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} data-testid="input-custom-canvas-width" /></label>
              <span aria-hidden="true">×</span>
              <label>H<input aria-label="Custom canvas height" type="number" min="144" max="3840" step="2" value={customCanvas.height} onChange={(event) => setCustomCanvas((current) => ({ ...current, height: event.currentTarget.value }))} onBlur={() => commitCustomCanvasDimension('height')} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} data-testid="input-custom-canvas-height" /></label>
            </div>}
            <CutlineSelect
              aria-label="Project frame rate"
              value={String(project.frameRate)}
              options={[24, 30, 60, 120].map((fps) => ({ value: String(fps), label: `${fps} fps` }))}
              onValueChange={(value) => commit((current) => ({ ...current, frameRate: Number(value) }))}
              data-testid="select-frame-rate"
            />
          </div>
          <div className="preview-wrap" ref={previewWrapRef}>
            <div className="preview-frame" style={previewFrameSize.width
              ? { width: `${previewFrameSize.width}px`, height: `${previewFrameSize.height}px`, aspectRatio: `${project.width} / ${project.height}` }
              : { width: 'min(94%, 1320px)', aspectRatio: `${project.width} / ${project.height}` }}>
              <canvas
                ref={previewCanvasRef}
                className="preview-canvas preview-canvas--video"
                aria-hidden="true"
              />
              <canvas
                ref={previewOverlayCanvasRef}
                className={`preview-canvas preview-canvas--overlay${libraryWorkspace === 'markup' ? ' is-markup-active' : ''}`}
                role="img"
                aria-label={`Video preview at ${formatTime(playhead)}; project canvas ${project.width} by ${project.height}`}
                onPointerDown={startPreviewPointer}
                onPointerMove={movePreviewPointer}
                onPointerUp={finishPreviewPointer}
                onPointerCancel={finishPreviewPointer}
                onDoubleClick={() => document.querySelector<HTMLElement>('[data-testid="input-title-content"]')?.focus()}
                data-testid="canvas-video-preview"
              />
              {project.clips.length === 0 && assets.length === 0 && <div
                className="project-welcome"
                onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
                onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setDropActive(false);
                  if (event.dataTransfer.files.length) {
                    setPendingDroppedFiles(Array.from(event.dataTransfer.files));
                    setDropProjectId(projectRef.current.id);
                    setDialog('project');
                  }
                }}
              >
                <span className="project-welcome__icon"><Clapperboard size={24} /></span>
                <h3>Drop your first clip here</h3>
                <p>Drop media here to choose a project destination. Open a saved project to continue its timeline, or create a new one.</p>
                <div>
                  <button type="button" className="btn primary" onClick={beginNewProject}><FilePlus2 size={14} />New project</button>
                  <button type="button" className="btn" onClick={() => void openProjects()}><FolderOpen size={14} />Browse projects</button>
                  <button type="button" className="btn" onClick={() => fileInput.current?.click()}><Upload size={14} />Choose media</button>
                </div>
              </div>}
              {!activeVisualClips.length && <div className="preview-empty"><Clapperboard size={27} strokeWidth={1.25} /><strong>Your cut starts here</strong><span>Import media, then add it to a track</span></div>}
              {audioClips.map((clip) => (
                <audio
                  key={clip.id}
                  ref={getAudioRef(clip.id)}
                  data-testid={`audio-preview-${clip.id}`}
                />
              ))}
              <span className="preview-overlay">{project.width} × {project.height}</span>
            </div>
          </div>
          <div className="transport">
            <span className="transport-time" data-testid="text-playhead-time">{formatTime(playhead)}</span>
            <button className="icon-btn" title="Go to start" onClick={() => setPlayhead(0)} data-testid="button-go-start"><SkipBack size={16} /></button>
            <button className="play-main" title={playing ? 'Pause' : 'Play'} disabled={!project.clips.length} onClick={togglePlayback} data-testid="button-play-pause">{playing ? <Pause size={17} fill="currentColor" /> : <Play size={18} fill="currentColor" />}</button>
            <button className="icon-btn" title="Go to end" onClick={() => setPlayhead(contentEnd)} data-testid="button-go-end"><SkipForward size={16} /></button>
        <div className="transport-right">
              <button className="icon-btn" onClick={() => setMuted((value) => !value)} title={muted ? 'Unmute preview' : 'Mute preview'} data-testid="button-preview-mute">{muted ? <VolumeX size={15} /> : <Volume2 size={15} />}</button>
              <input aria-label="Preview volume" type="range" min="0" max="1" step=".01" value={volume} onChange={(event) => setVolume(Number(event.target.value))} style={{ width: 70, accentColor: '#edb94e' }} data-testid="input-preview-volume" />
              <span className="mono">{Math.round(volume * 100)}%</span>
            </div>
          </div>
        </section>
        <InspectorPanel
          clip={selectedClip}
          assetName={selectedAsset?.name}
          assetKind={selectedAssetKind}
          sourceDuration={selectedAsset?.duration}
          disabled={selectedClipLocked}
          onChange={updateSelectedClip}
          onRemove={removeSelected}
          onFit={() => setSelectedFit('contain')}
          onFill={() => setSelectedFit('cover')}
          onReset={resetSelectedTransform}
        />
      </section>
      <section className="timeline-panel">
        <div className="timeline-head">
          <span className="timeline-label">Timeline</span>
          <button className="btn flat" title="Trim selected clip start to playhead" disabled={!selectedClip || selectedClipLocked} onClick={() => trimAtPlayhead('start')} data-testid="button-trim-start"><Minus size={13} />In</button>
          <button className="btn flat" title="Trim selected clip end to playhead" disabled={!selectedClip || selectedClipLocked} onClick={() => trimAtPlayhead('end')} data-testid="button-trim-end"><Minus size={13} />Out</button>
          <button className="icon-btn" title="Delete selected clip" disabled={!selectedClip || selectedClipLocked} onClick={removeSelected} data-testid="button-timeline-delete"><Trash2 size={14} /></button>
          <span className="minor">{selectedClip ? `Selected · ${formatTime((selectedClip.sourceOut - selectedClip.sourceIn) / selectedClip.speed)}` : `${project.clips.length} clips`}</span>
          {selectedClip && <label className="clip-volume">Clip gain
            <input aria-label="Selected clip volume" type="range" min="0" max="2" step=".01" value={selectedClip.volume} disabled={selectedClipLocked} onChange={(event) => updateSelectedClip({ volume: Number(event.target.value) })} data-testid="input-clip-volume" />
          </label>}
          {selectedClip?.assetId && <button className={`icon-btn ${selectedClip.muted ? 'active' : ''}`} title={selectedClip.muted ? 'Unmute selected clip audio' : 'Mute selected clip audio'} aria-label={selectedClip.muted ? 'Unmute selected clip audio' : 'Mute selected clip audio'} aria-pressed={Boolean(selectedClip.muted)} disabled={selectedClipLocked} onClick={() => updateSelectedClip({ muted: !selectedClip.muted })} data-testid="button-mute-selected-clip">{selectedClip.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}</button>}
          <button className={`icon-btn ${snapEnabled ? 'active' : ''}`} title={snapEnabled ? 'Snapping on — click to turn off' : 'Snapping off — click to turn on'} aria-label="Toggle timeline snapping" aria-pressed={snapEnabled} onClick={() => setSnapEnabled((value) => !value)} data-testid="button-toggle-snapping"><Magnet size={13} /></button>
          <button className="icon-btn" title="Zoom out timeline" aria-label="Zoom out timeline" disabled={zoom <= MIN_TIMELINE_ZOOM} onClick={() => setZoom((value) => adjustTimelineZoom(value, -1))} data-testid="button-zoom-out"><Minus size={14} /></button>
          <span className="timeline-zoom-value" aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button className="icon-btn" title="Zoom in timeline" aria-label="Zoom in timeline" disabled={zoom >= MAX_TIMELINE_ZOOM} onClick={() => setZoom((value) => adjustTimelineZoom(value, 1))} data-testid="button-zoom-in"><Plus size={14} /></button>
        </div>
        <div className="tracks-scroll" ref={timelineRef} data-testid="region-timeline">
            <div className="timeline-inner" style={{ width: TRACK_LABEL_WIDTH + timelineEnd * scale }}>
            <div className="ruler">
              {timelineRuler.ticks.map((tick) => <span className="tick" key={tick} style={{ left: tick * scale }}>{formatTimelineTick(tick)}</span>)}
            </div>
            {orderedTracks.map((track) => (
              <div className="track-row" key={track.id}>
                <div className="track-meta">
                  {track.kind === 'video' ? <Film size={13} color="#74bac0" /> : track.kind === 'audio' ? <AudioLines size={13} color="#b4a0e1" /> : <Type size={13} color="#e6b84f" />}
                  <span className="track-name">{track.name}</span>
                  {track.kind !== 'audio' && <button className={`icon-btn ${track.visible === false ? 'active' : ''}`} title={track.visible === false ? 'Show track' : 'Hide track'} onClick={() => commit((current) => ({ ...current, tracks: current.tracks.map((t) => t.id === track.id ? { ...t, visible: t.visible === false } : t) }))} data-testid={`button-visibility-track-${track.id}`}>{track.visible === false ? <EyeOff size={12} /> : <Eye size={12} />}</button>}
                  {track.kind !== 'text' && <button className={`icon-btn ${track.muted ? 'active' : ''}`} title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => commit((current) => ({ ...current, tracks: current.tracks.map((t) => t.id === track.id ? { ...t, muted: !t.muted } : t) }))} data-testid={`button-mute-track-${track.id}`}>{track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>}
                  <button className={`icon-btn ${track.locked ? 'active' : ''}`} title={track.locked ? 'Unlock track' : 'Lock track'} onClick={() => commit((current) => ({ ...current, tracks: current.tracks.map((t) => t.id === track.id ? { ...t, locked: !t.locked } : t) }))} data-testid={`button-lock-track-${track.id}`}>{track.locked ? <LockKeyhole size={11} /> : <UnlockKeyhole size={11} />}</button>
                  <button className="icon-btn track-order-control" title="Move track up" aria-label={`Move ${track.name} up`} disabled={track.order === 0} onClick={() => reorderTrack(track.id, -1)} data-testid={`button-track-up-${track.id}`}><ArrowUp size={11} /></button>
                  <button className="icon-btn track-order-control" title="Move track down" aria-label={`Move ${track.name} down`} disabled={track.order === orderedTracks.length - 1} onClick={() => reorderTrack(track.id, 1)} data-testid={`button-track-down-${track.id}`}><ArrowDown size={11} /></button>
                  <button className="icon-btn track-delete-control" title={`Delete ${track.name}`} aria-label={`Delete ${track.name}`} onClick={() => deleteTrack(track)} data-testid={`button-delete-track-${track.id}`}><Trash2 size={11} /></button>
                </div>
          <div className="track-lane" style={{ backgroundSize: `${timelineRuler.interval * scale}px 100%` }} onDragOver={extendTimelineOnDrag} onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
            setDropActive(false);
                   setTimelineDragEnd(null);
                  const point = timelinePosition(event, track.id);
                  const clipId = event.dataTransfer.getData('application/x-cutline-clip');
                  const assetId = event.dataTransfer.getData('application/x-cutline-asset');
                  if (clipId) moveClip(clipId, point.time - Number(event.dataTransfer.getData('application/x-cutline-offset')), track.id);
                  else { const asset = assets.find((item) => item.id === assetId); if (asset) addAssetToTimeline(asset, track.id, point.time); }
            if (!clipId && !assetId && event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
                }} onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.clip')) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPlayhead(snapTimelineTime(Math.max(0, (event.clientX - rect.left) / scale)));
                }} data-testid={`lane-track-${track.id}`}>
                  {(project.transitions || []).filter((transition) => {
                    const fromClip = project.clips.find((clip) => clip.id === transition.fromClipId);
                    return fromClip?.trackId === track.id;
                  }).map((transition) => {
                    const fromClip = project.clips.find((clip) => clip.id === transition.fromClipId);
                    const toClip = project.clips.find((clip) => clip.id === transition.toClipId);
                    if (!fromClip || !toClip) return null;
                    const boundary = fromClip.timelineStart + getClipDuration(fromClip);
                    return <button
                      key={transition.id}
                      type="button"
                      className={`transition-region${selectedClipId === fromClip.id || selectedClipId === toClip.id ? ' is-selected' : ''}`}
                      style={{ left: Math.max(0, (boundary - transition.duration / 2) * scale), width: Math.max(9, transition.duration * scale) }}
                      title={`${transition.type.replaceAll('-', ' ')} · ${transition.duration.toFixed(1)} seconds`}
                      aria-label={`${transition.type.replaceAll('-', ' ')} transition, ${transition.duration.toFixed(1)} seconds`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedClipId(fromClip.id);
                        setSelectedAssetId(fromClip.assetId || null);
                        setLibraryWorkspace('transitions');
                      }}
                      data-testid={`transition-region-${transition.id}`}
                    ><Sparkles size={10} /></button>;
                  })}
                  {project.clips.filter((clip) => clip.trackId === track.id).map((clip) => {
                    const asset = assets.find((item) => item.id === clip.assetId);
                    if (!asset && !clip.text) return null;
                    const duration = getClipDuration(clip);
                    const clipKindClass = clip.text ? 'text' : project.tracks.find((item) => item.id === clip.trackId)?.kind === 'audio' || clip.audioOnly || (asset && isAudio(asset)) ? 'audio' : asset && isImage(asset) ? 'image' : 'video';
                    const clipLabel = clip.displayName || clip.text?.templateName || asset?.name || 'Text clip';
                    return <div key={clip.id} draggable={!track.locked} className={`clip ${clipKindClass} ${selectedClipId === clip.id ? 'selected' : ''}`}
                      style={{ left: clip.timelineStart * scale, width: Math.max(8, duration * scale), opacity: track.muted ? .5 : 1 }}
                      tabIndex={0}
                      onContextMenu={(event) => {
                        setSelectedClipId(clip.id);
                        setSelectedAssetId(asset?.id || null);
                        openContextMenu(event, 'clip', clip.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.target !== event.currentTarget) return;
                        if (event.key === 'Enter') {
                          setSelectedClipId(clip.id);
                          setSelectedAssetId(asset?.id || null);
                        }
                        if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
                          setSelectedClipId(clip.id);
                          setSelectedAssetId(asset?.id || null);
                          openKeyboardContextMenu(event, 'clip', clip.id);
                        }
                      }}
                      onClick={(event) => { event.stopPropagation(); setSelectedClipId(clip.id); setSelectedAssetId(asset?.id || null); }}
                      onDoubleClick={(event) => {
                        event.stopPropagation();
                        setSelectedClipId(clip.id);
                        setSelectedAssetId(asset?.id || null);
                        setPlayhead(clip.timelineStart);
                        if (clip.text) window.setTimeout(() => document.querySelector<HTMLElement>('[data-testid="input-title-content"]')?.focus(), 0);
                      }}
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest('.clip-trim-handle')) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.setData('application/x-cutline-clip', clip.id);
                        event.dataTransfer.setData('application/x-cutline-offset', String(Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) / scale)));
                      }}
                      title={`${clipLabel} · ${formatTime(duration)}`} data-testid={`clip-${clip.id}`}>
                <button
                  type="button"
                  className="clip-trim-handle clip-trim-handle--start"
                  aria-label={`Trim start of ${asset?.name || clip.text?.templateName || 'Text clip'}`}
                  title="Drag to trim clip start"
                  disabled={track.locked}
                  onPointerDown={(event) => startTrimDrag(event, clip, 'start')}
                  onPointerMove={updateTrimDrag}
                  onPointerUp={finishTrimDrag}
                  onPointerCancel={finishTrimDrag}
                  data-testid={`button-trim-clip-start-${clip.id}`}
                />
                  <span className="clip-title">{clipLabel}</span>
                <button
                  type="button"
                  className="clip-trim-handle clip-trim-handle--end"
                  aria-label={`Trim end of ${asset?.name || clip.text?.templateName || 'Text clip'}`}
                  title="Drag to trim clip end"
                  disabled={track.locked}
                  onPointerDown={(event) => startTrimDrag(event, clip, 'end')}
                  onPointerMove={updateTrimDrag}
                  onPointerUp={finishTrimDrag}
                  onPointerCancel={finishTrimDrag}
                  data-testid={`button-trim-clip-end-${clip.id}`}
                />
                    </div>;
                  })}
                  {!project.clips.some((clip) => clip.trackId === track.id) && <span className="drop-hint">Drop {track.kind} media here</span>}
                  <div className="playhead" style={{ left: playhead * scale }} />
                </div>
              </div>
            ))}
            {orderedTracks.length === 0 && <div className="drop-hint">Add a track to get started</div>}
          </div>
        </div>
      </section>
      {notice && <div className={`notice ${notice.error ? 'error' : ''}`} role="status" data-testid="status-notice">{notice.error ? <CircleAlert size={16} /> : <Check size={16} />}{notice.message}</div>}
      {dialog === 'project' && <div
        className="dialog-backdrop"
        onMouseDown={(event) => { if (event.target === event.currentTarget) { setCreatingProject(false); setMovingProjectId(null); setDialog(null); } }}
        onKeyDown={(event) => { if (event.key === 'Escape') { setCreatingProject(false); setMovingProjectId(null); setDialog(null); } }}
      >
        <section className="dialog project-library" role="dialog" aria-modal="true" aria-label="Local projects">
          <div className="project-library__heading">
            <div><h2>Projects on this device</h2><p>Projects and imported media stay in this browser. Folders organize projects here; they are not computer folders.</p></div>
          </div>
          <div className="project-library__actions">
            <button className="btn primary" onClick={beginNewProject} data-testid="button-new-project"><FilePlus2 size={14} />New project</button>
            <button className="btn" onClick={() => void saveProjectAs()} data-testid="button-save-project-as"><Copy size={14} />Save As</button>
            <button className="btn" onClick={() => void createProjectFolder()} disabled={projectFolders.length >= MAX_PROJECT_FOLDERS} title={projectFolders.length >= MAX_PROJECT_FOLDERS ? 'Rename or delete an existing folder before creating another.' : 'Create an internal project folder'} data-testid="button-create-folder"><FolderOpen size={14} />Create folder</button>
            <input
              ref={projectBackupFileRef}
              className="visually-hidden"
              type="file"
              accept=".cutline.json,application/json"
              aria-label="Upload a Cutline project backup"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                if (file) void importProjectBackup(file);
                event.currentTarget.value = '';
              }}
            />
            <button className="btn" onClick={() => projectBackupFileRef.current?.click()} data-testid="button-import-project"><Upload size={14} />Import backup</button>
          </div>
          {pendingDroppedFiles.length > 0 && <div className="project-library__drop-choice">
            <strong>{pendingDroppedFiles.length} dropped file{pendingDroppedFiles.length === 1 ? '' : 's'} waiting for a project</strong>
            <p>Nothing has been imported yet. Choose a destination or create a new project; these files will stay queued until you decide.</p>
            <label>Import into<CutlineSelect aria-label="Choose project for dropped files" value={dropProjectId || project.id} options={projectDestinationOptions} onValueChange={setDropProjectId} data-testid="select-drop-project-destination" /></label>
            <div>
              <button className="btn" type="button" onClick={beginNewProject}><FilePlus2 size={13} />Create project</button>
              <button className="btn" type="button" onClick={() => setPendingDroppedFiles([])}>Discard queued files</button>
              <button className="btn primary" type="button" disabled={mediaImporting} onClick={async () => {
                const targetId = dropProjectId || project.id;
                const targetRecord = savedProjects.find((record) => record.project.id === targetId);
                if (targetId !== projectRef.current.id) {
                  if (!targetRecord || !await openProject(targetRecord)) return;
                }
                const imported = await importFiles(pendingDroppedFiles);
                if (imported) {
                  setPendingDroppedFiles([]);
                  setDialog(null);
                } else setDialog('project');
              }}><Upload size={13} />Import into project</button>
            </div>
          </div>}
          {projectFolders.length >= MAX_PROJECT_FOLDERS && <p className="project-library__limit" role="status">Folder limit reached (10). Rename or delete a folder before creating another.</p>}
          {creatingProject && <form className="project-library__new-form" onSubmit={(event) => { event.preventDefault(); createProjectFromForm(); }}>
            <label>Project name<input autoFocus value={draftProjectName} onChange={(event) => setDraftProjectName(event.currentTarget.value)} maxLength={100} data-testid="input-new-project-name" /></label>
            <label>Save in folder<CutlineSelect aria-label="Project folder" value={draftProjectFolderId} options={projectFolderOptions} onValueChange={setDraftProjectFolderId} data-testid="select-new-project-folder" /></label>
            <div className="project-library__new-actions">
              <button type="button" className="btn" onClick={() => setCreatingProject(false)}>Cancel</button>
              <button type="submit" className="btn primary"><FilePlus2 size={13} />Create project</button>
            </div>
          </form>}
          <div className="project-library__folder-strip" aria-label="Project folders">
            <button type="button" className={selectedProjectFolder === 'all' ? 'is-selected' : ''} onClick={() => setSelectedProjectFolder('all')}><FolderOpen size={13} />All projects <span>{savedProjects.length}</span></button>
            <button type="button" className={selectedProjectFolder === 'unorganized' ? 'is-selected' : ''} onClick={() => setSelectedProjectFolder('unorganized')}><Folder size={13} />Unorganized <span>{savedProjects.filter((record) => !record.project.folderId).length}</span></button>
            {projectFolders.map((folder) => <div className={`project-library__folder-chip${selectedProjectFolder === folder.id ? ' is-selected' : ''}`} key={folder.id}>
              <button type="button" className="project-library__folder-select" onClick={() => setSelectedProjectFolder(folder.id)} aria-pressed={selectedProjectFolder === folder.id}>
                <Folder size={13} /><span>{folder.name}</span><small>{savedProjects.filter((record) => record.project.folderId === folder.id).length}</small>
              </button>
              <button type="button" className="project-library__folder-action" title={`Rename ${folder.name}`} aria-label={`Rename folder ${folder.name}`} onClick={() => void renameProjectFolder(folder)}><Pencil size={12} /></button>
              <button type="button" className="project-library__folder-action is-delete" title={`Delete ${folder.name}`} aria-label={`Delete folder ${folder.name}`} onClick={() => void deleteProjectFolder(folder)}><Trash2 size={12} /></button>
            </div>)}
          </div>
          <div className="project-library__tools">
            <label className="search-box"><Search size={13} /><input aria-label="Search projects" placeholder="Find a project…" value={projectSearch} onChange={(event) => setProjectSearch(event.currentTarget.value)} data-testid="input-search-projects" /></label>
            <label className="project-library__sort">
              <span>Sort</span>
              <CutlineSelect
                aria-label="Sort projects"
                value={projectSort}
                options={[{ value: 'modified', label: 'Recently modified' }, { value: 'name', label: 'Name' }]}
                onValueChange={(value) => setProjectSort(value as 'modified' | 'name')}
                data-testid="select-sort-projects"
              />
            </label>
          </div>
          <div className="project-library__list">
            {visibleSavedProjects.length ? visibleSavedProjects.map((record) => {
              const isCurrent = record.project.id === project.id;
              const currentProject = record.project.id === project.id ? project : record.project;
              const currentStatus = record.project.id === project.id ? saveState : 'saved';
              const firstMediaClip = currentProject.clips.find((clip) => clip.assetId);
              const thumbnail = record.assets.find((asset) => asset.id === firstMediaClip?.assetId && asset.thumbnail)?.thumbnail;
              const assignedFolder = projectFolders.find((folder) => folder.id === currentProject.folderId)?.name || 'Unorganized';
              return <article
                key={record.project.id}
                className={`project-library__row${isCurrent ? ' is-current' : ''}`}
                onContextMenu={(event) => openContextMenu(event, 'project', record.project.id)}
                onKeyDown={(event) => openKeyboardContextMenu(event, 'project', record.project.id)}
                tabIndex={0}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={`Project ${currentProject.name}${isCurrent ? ', active project' : ''}`}
                data-testid={`row-project-${record.project.id}`}
              >
                <span className="project-library__icon">{thumbnail ? <img src={thumbnail} alt="" /> : <Clapperboard size={16} />}</span>
                <div className="project-library__details">
                  <div className="project-library__name-row">
                    <button type="button" className="project-library__open" onClick={() => void openProject(record)} data-testid={`button-open-saved-${record.project.id}`}>{currentProject.name}</button>
                    {isCurrent && <span className="project-library__active-label">Active project</span>}
                  </div>
                  <span>{assignedFolder} · {new Date(record.savedAt).toLocaleString()} · {currentProject.width} × {currentProject.height} · {currentProject.frameRate} fps · {currentProject.clips.length} clips</span>
                  <small className={`project-library__status project-library__status--${currentStatus}`}><i />{currentStatus === 'saved' ? 'Saved' : currentStatus === 'saving' ? 'Saving…' : currentStatus === 'dirty' ? 'Unsaved changes' : 'Save failed'}</small>
                </div>
                <div className="project-library__row-actions">
                  <button type="button" title="Move project" aria-label={`Move ${currentProject.name}`} onClick={() => { setMovingProjectId(record.project.id); setMoveFolderId(currentProject.folderId || 'unorganized'); }}><FolderInput size={13} /></button>
                  <button type="button" title="Open project" aria-label={`Open ${currentProject.name}`} onClick={() => void openProject(record)}><FolderOpen size={13} /></button>
                  <button type="button" title="Rename project" aria-label={`Rename ${currentProject.name}`} onClick={() => void renameSavedProject(record)}><Pencil size={13} /></button>
                  <button type="button" title="Duplicate project" aria-label={`Duplicate ${currentProject.name}`} onClick={() => void duplicateSavedProject(record)}><Copy size={13} /></button>
                  <button type="button" title="Delete project" aria-label={`Delete ${currentProject.name}`} onClick={() => void deleteSavedProject(record)}><Trash2 size={13} /></button>
                </div>
              </article>;
            }) : <div className="project-library__empty">{savedProjects.length ? projectSearch ? 'No projects match your search.' : 'No projects in this folder yet.' : 'No saved projects yet. Create one or import a project backup.'}</div>}
          </div>
          {movingProjectId && <div className="project-library__move-form">
            <label>Move “{savedProjects.find((record) => record.project.id === movingProjectId)?.project.name || 'project'}” to<CutlineSelect aria-label="Move project to folder" value={moveFolderId} options={projectFolderOptions} onValueChange={setMoveFolderId} data-testid="select-move-project-folder" /></label>
            <div><button type="button" className="btn" onClick={() => setMovingProjectId(null)}>Cancel</button><button type="button" className="btn primary" onClick={() => {
              const record = savedProjects.find((item) => item.project.id === movingProjectId);
              if (record) void moveSavedProject(record, moveFolderId === 'unorganized' ? null : moveFolderId);
            }}>Move project</button></div>
          </div>}
          <div className="dialog-actions"><button className="btn" onClick={() => { setCreatingProject(false); setMovingProjectId(null); setDialog(null); }} data-testid="button-close-projects">Close</button></div>
        </section>
      </div>}
      {detailsDialog && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsDialog(null); }} onKeyDown={(event) => { if (event.key === 'Escape') setDetailsDialog(null); }}>
        <section className="dialog details-dialog" role="dialog" aria-modal="true" aria-label={detailsDialog.title}>
          <h2>{detailsDialog.title}</h2>
          <dl className="details-list">
            {detailsDialog.rows.map(([label, value]) => <div className="details-row" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
          </dl>
          <div className="dialog-actions"><button className="btn" onClick={() => setDetailsDialog(null)}>Close</button></div>
        </section>
      </div>}
      {dialog === 'export' && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) setDialog(null); }}>
        <section className="dialog" aria-label="Export project">
          <h2>Export your cut</h2><p>Rendered on this device with WebCodecs. Cutline checks the selected browser encoders before rendering; no FFmpeg engine or cloud service is used.</p>
          <div className="export-project-meta"><strong>Project:</strong> {project.name}</div>
          <label htmlFor="export-name">File name</label><input id="export-name" value={exportName} onChange={(event) => setExportName(event.target.value)} disabled={exporting} data-testid="input-export-name" />
          <label>Record export under</label>
          <div className="export-folder-control">
            <CutlineSelect
              aria-label="Export project folder"
              value={exportFolderId}
              options={projectFolderOptions}
              onValueChange={setExportFolderId}
              disabled={exporting}
              data-testid="select-export-folder"
            />
            <button className="btn" type="button" disabled={exporting || projectFolders.length >= MAX_PROJECT_FOLDERS} onClick={async () => {
              const folder = await createProjectFolder();
              if (folder) setExportFolderId(folder.id);
            }} title={projectFolders.length >= MAX_PROJECT_FOLDERS ? 'Rename or delete a folder before creating another.' : 'Create an internal folder'}>
              <FolderOpen size={13} />Create folder
            </button>
          </div>
          <p className="export-location-note">
            The Cutline destination “{exportFolderId === 'unorganized' ? 'Unorganized Projects' : projectFolders.find((folder) => folder.id === exportFolderId)?.name || 'Selected internal folder'}” organizes export history only; it does not move this project or select a computer directory.
            {projectFolders.length >= MAX_PROJECT_FOLDERS ? ' Folder creation is unavailable because the 10-folder limit is reached.' : ''}
          </p>
          <label>Save directly to a computer folder (optional)</label>
          <div className="export-computer-folder">
            <div>
              <strong>{exportDirectory ? exportDirectory.name : 'No computer folder selected'}</strong>
              <small>{exportDirectory
                ? 'The video will be written here after browser permission is granted.'
                : 'Otherwise, choose a location in the browser save dialog or use its Downloads fallback.'}</small>
            </div>
            <button
              className="btn"
              type="button"
              disabled={exporting || !(window as FileAccessWindow).showDirectoryPicker}
              onClick={() => void chooseExportDirectory()}
              title={(window as FileAccessWindow).showDirectoryPicker
                ? 'Choose a real computer folder for the rendered video'
                : 'This browser does not support direct folder access'}
              data-testid="button-choose-export-directory"
            ><FolderOpen size={13} />Choose folder</button>
            {exportDirectory && <button type="button" className="btn" disabled={exporting} onClick={() => setExportDirectory(null)}>Clear</button>}
          </div>
          {!(window as FileAccessWindow).showDirectoryPicker && <p className="export-location-note">This browser cannot grant direct folder access. Use the browser save dialog when available; otherwise the video downloads to its normal download location.</p>}
          <label htmlFor="export-format">Format</label>
          <CutlineSelect
            id="export-format"
            value={format}
            options={[
              { value: 'mp4', label: 'MP4 · AVC video + AAC audio' },
              { value: 'webm', label: 'WebM · VP8 video + Opus audio' },
            ]}
            onValueChange={(value) => setFormat(value as 'mp4' | 'webm')}
            disabled={exporting}
            data-testid="select-export-format"
          />
          <p style={{ marginBottom: 0 }}>Output: {project.width} × {project.height} at {project.frameRate} fps. Large renders stream directly to a selected computer folder or save-file location when supported. Browser-download fallback is limited to 30 seconds and an estimated 64 MB. The export destination never moves the project.</p>
          {exporting && <>
            <div className="export-progress-meta"><span>Elapsed {formatElapsedTime(exportElapsed)}</span><span>{exportProgress}%</span></div>
            <div className="progress-track" role="progressbar" aria-label="Export progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={exportProgress}><span style={{ width: `${exportProgress}%` }} /></div>
          </>}
          <div className="dialog-actions"><button className="btn" onClick={() => { if (exporting) exportCancelRequested.current = true; else setDialog(null); }} data-testid="button-cancel-export">{exporting ? 'Stop render' : 'Cancel'}</button><button className="btn primary" disabled={exporting || project.clips.length === 0} onClick={() => void exportCut()} data-testid="button-start-export">{exporting ? `${exportProgress}%` : <><Download size={14} />Render {format.toUpperCase()}</>}</button></div>
        </section>
      </div>}
      {contextMenu && contextMenuItems.length > 0 && <ContextMenu
        key={`${contextMenu.kind}-${contextMenu.id || 'blank'}-${contextMenu.x}-${contextMenu.y}`}
        x={contextMenu.x}
        y={contextMenu.y}
        items={contextMenuItems}
        onClose={closeContextMenu}
      />}
      {exporting && <div className="notice" role="status"><Activity size={15} />Rendering cut locally · {exportProgress}% · {formatElapsedTime(exportElapsed)} elapsed</div>}
    </main>
  );
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></WouterRouter>;
}
export default App;
