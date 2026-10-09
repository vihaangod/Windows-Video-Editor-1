import { type DragEvent, type PointerEvent as ReactPointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity, AudioLines, Check, ChevronDown, CircleAlert, Clapperboard,
  Download, FileAudio, FileImage, FilePlus2, Film, FolderOpen, Grid2X2,
  HardDrive, Layers2, Minus, Pause, Play, Plus, Redo2, Scissors, Search,
  SkipBack, SkipForward, Split, Trash2, Undo2, Upload, Volume2, VolumeX,
} from 'lucide-react';
import {
  BufferTarget, CanvasSource, MediaStreamAudioTrackSource, Mp4OutputFormat,
  Output, Quality, StreamTarget, WebMOutputFormat, canEncode,
  type StreamTargetChunk,
} from 'mediabunny';
import NotFound from '@/pages/not-found';
import InspectorPanel from '@/components/InspectorPanel';
import { Route, Switch, Router as WouterRouter } from 'wouter';

type TrackKind = 'video' | 'audio';
type Track = { id: string; name: string; kind: TrackKind; order: number; muted: boolean };
type Clip = { id: string; assetId: string; trackId: string; timelineStart: number; sourceIn: number; sourceOut: number; volume: number; speed: number };
type Project = { id: string; name: string; width: number; height: number; frameRate: number; tracks: Track[]; clips: Clip[] };
type Asset = { id: string; name: string; mimeType: string; byteSize: number; duration?: number; blob: Blob };
type AssetMetadata = Omit<Asset, 'blob'>;
type SavedProject = { project: Project; assets: AssetMetadata[]; savedAt: number };
type Notice = { message: string; error?: boolean };
const DB_NAME = 'cutline-local-editor-v1';
const DB_VERSION = 2;
const LEGACY_STORE = 'projects';
const PROJECT_STORE = 'project-meta';
const MEDIA_STORE = 'project-media';
const DEFAULT_TRACKS: Track[] = [
  { id: 'video-1', name: 'Video 1', kind: 'video', order: 0, muted: false },
  { id: 'audio-1', name: 'Audio 1', kind: 'audio', order: 1, muted: false },
];
const createProject = (name = 'Untitled cut'): Project => ({
  id: crypto.randomUUID(), name, width: 1920, height: 1080, frameRate: 30,
  tracks: DEFAULT_TRACKS.map((track) => ({ ...track, id: crypto.randomUUID() })), clips: [],
});
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
      if (!media.indexNames.contains('projectId')) media.createIndex('projectId', 'projectId', { unique: false });
      if (event.oldVersion < 2 && db.objectStoreNames.contains(LEGACY_STORE)) {
        const cursorRequest = transaction!.objectStore(LEGACY_STORE).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const legacy = cursor.value as { project: Project; assets?: Asset[]; savedAt: number };
          if (legacy.project) {
            projects.put({ project: legacy.project, assets: (legacy.assets || []).map(({ blob: _blob, ...asset }) => asset), savedAt: legacy.savedAt || Date.now() });
            for (const asset of legacy.assets || []) media.put({ key: `${legacy.project.id}:${asset.id}`, projectId: legacy.project.id, asset });
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
  });
}
async function saveLocalMedia(projectId: string, assets: Asset[]) {
  if (!assets.length) return;
  const db = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(MEDIA_STORE, 'readwrite');
    const store = tx.objectStore(MEDIA_STORE);
    assets.forEach((asset) => store.put({ key: `${projectId}:${asset.id}`, projectId, asset }));
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
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
async function readLocalMedia(projectId: string): Promise<Asset[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction(MEDIA_STORE, 'readonly').objectStore(MEDIA_STORE).index('projectId').getAll(projectId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as Array<{ asset: Asset }>).map((record) => record.asset));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}
const uid = () => crypto.randomUUID();
const formatTime = (seconds: number) => {
  const s = Math.max(0, seconds || 0);
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${Math.floor(s % 60).toString().padStart(2, '0')}.${Math.floor((s % 1) * 100).toString().padStart(2, '0')}`;
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

function Home() {
  const [project, setProject] = useState<Project>(() => createProject());
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [search, setSearch] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dialog, setDialog] = useState<'project' | 'export' | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [projectHydrated, setProjectHydrated] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [dropActive, setDropActive] = useState(false);
  const [saveState, setSaveState] = useState('Local project');
  const [exportName, setExportName] = useState('cutline-export');
  const [format, setFormat] = useState<'mp4' | 'webm'>('mp4');
  const [zoom, setZoom] = useState(1);
  const [imagePreview, setImagePreview] = useState('');
  const [, setHistoryRevision] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRefs = useRef(new Map<string, HTMLAudioElement>());
  const audioUrls = useRef(new Map<string, string>());
  const audioRefCallbacks = useRef(new Map<string, (element: HTMLAudioElement | null) => void>());
  const timelineRef = useRef<HTMLDivElement>(null);
  const history = useRef<Project[]>([]);
  const future = useRef<Project[]>([]);
  const saveTimer = useRef<number | undefined>(undefined);
  const trimDrag = useRef<{
    clipId: string;
    edge: 'start' | 'end';
    pointerId: number;
    startX: number;
    initialClip: Clip;
    initialProject: Project;
  } | null>(null);
  const exportCancelRequested = useRef(false);
  const isPlayingRef = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
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
        audioRefs.current.delete(clipId);
        const url = audioUrls.current.get(clipId);
        if (url) URL.revokeObjectURL(url);
        audioUrls.current.delete(clipId);
        audioRefCallbacks.current.delete(clipId);
      };
      audioRefCallbacks.current.set(clipId, callback);
    }
    return callback;
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
        const records = await readLocalProjects();
        if (!alive) return;
        setSavedProjects(records);
        const latest = [...records].sort((a, b) => b.savedAt - a.savedAt)[0];
        if (latest) {
          const localAssets = await readLocalMedia(latest.project.id);
          if (!alive) return;
          setProject(latest.project);
          setAssets(localAssets);
          setSaveState('Project reopened locally');
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
    window.clearTimeout(saveTimer.current);
    setSaveState('Saving locally…');
    saveTimer.current = window.setTimeout(() => {
      saveLocalProject(project, assets)
        .then(() => setSaveState('Saved on this device'))
        .catch(() => { setSaveState('Save unavailable'); notify('Could not save locally. Your browser storage may be full.', true); });
    }, 650);
    return () => window.clearTimeout(saveTimer.current);
  }, [project, assets, notify, projectHydrated]);

  const contentEnd = useMemo(() => Math.max(0, ...project.clips.map((clip) => clip.timelineStart + Math.max(0, clip.sourceOut - clip.sourceIn) / clip.speed)), [project.clips]);
  const timelineEnd = Math.max(30, contentEnd + 3);
  const scale = 16 * zoom;
  const selectedClip = project.clips.find((clip) => clip.id === selectedClipId) || null;
  const orderedTracks = [...project.tracks].sort((a, b) => a.order - b.order);
  const filteredAssets = assets.filter((asset) => asset.name.toLowerCase().includes(search.toLowerCase()));
  const activeVisualClip = useMemo(() => project.clips.filter((clip) => {
    const track = project.tracks.find((t) => t.id === clip.trackId);
    return track?.kind === 'video' && !track.muted && playhead >= clip.timelineStart && playhead < clip.timelineStart + (clip.sourceOut - clip.sourceIn) / clip.speed;
  }).sort((a, b) => {
    const trackA = project.tracks.find((track) => track.id === a.trackId)?.order ?? 0;
    const trackB = project.tracks.find((track) => track.id === b.trackId)?.order ?? 0;
    return trackA - trackB || a.timelineStart - b.timelineStart;
  }).at(-1), [project.clips, project.tracks, playhead]);
  const activeVisualAsset = activeVisualClip ? assets.find((asset) => asset.id === activeVisualClip.assetId) : null;
  const selectedAsset = selectedClip ? assets.find((asset) => asset.id === selectedClip.assetId) : null;
  const selectedAssetKind = selectedAsset ? isAudio(selectedAsset) ? 'audio' : isImage(selectedAsset) ? 'image' : 'video' : undefined;
  const audioClips = useMemo(() => project.clips.filter((clip) => {
    const track = project.tracks.find((item) => item.id === clip.trackId);
    const asset = assets.find((item) => item.id === clip.assetId);
    return track?.kind === 'audio' && asset && isAudio(asset);
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
  }, []);

  useEffect(() => {
    if (!activeVisualAsset || !activeVisualClip) {
      setImagePreview('');
      return;
    }
    const url = URL.createObjectURL(activeVisualAsset.blob);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [activeVisualAsset?.id, activeVisualAsset?.blob, activeVisualClip?.id]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !activeVisualAsset || isImage(activeVisualAsset)) return;
    const sourceTime = activeVisualClip ? activeVisualClip.sourceIn + (playhead - activeVisualClip.timelineStart) * activeVisualClip.speed : 0;
    if (Number.isFinite(sourceTime) && Math.abs(video.currentTime - sourceTime) > 0.28) {
      try { video.currentTime = Math.max(0, sourceTime); } catch { /* media not ready yet */ }
    }
    if (activeVisualClip) video.playbackRate = activeVisualClip.speed;
    video.volume = muted ? 0 : Math.max(0, Math.min(1, volume * (activeVisualClip?.volume ?? 1)));
    if (playing) void video.play().catch(() => setPlaying(false));
    else video.pause();
  }, [
    activeVisualAsset?.id,
    activeVisualClip?.id,
    activeVisualClip?.timelineStart,
    activeVisualClip?.sourceIn,
    activeVisualClip?.sourceOut,
    activeVisualClip?.speed,
    activeVisualClip?.volume,
    playhead,
    playing,
    muted,
    volume,
    imagePreview,
  ]);
  useEffect(() => {
    for (const clip of audioClips) {
      const audio = audioRefs.current.get(clip.id);
      const track = project.tracks.find((item) => item.id === clip.trackId);
      if (!audio || !track) continue;
      const duration = (clip.sourceOut - clip.sourceIn) / clip.speed;
      const active = !track.muted && playhead >= clip.timelineStart && playhead < clip.timelineStart + duration;
      if (!active) {
        audio.pause();
        continue;
      }
      const sourceTime = clip.sourceIn + (playhead - clip.timelineStart) * clip.speed;
      if (Number.isFinite(sourceTime) && Math.abs(audio.currentTime - sourceTime) > .35) {
        try { audio.currentTime = Math.max(0, sourceTime); } catch { /* media metadata may still be loading */ }
      }
      audio.playbackRate = clip.speed;
      audio.volume = muted ? 0 : Math.max(0, Math.min(1, volume * clip.volume));
      if (playing) void audio.play().catch(() => undefined);
      else audio.pause();
    }
  }, [audioClips, project.tracks, playhead, playing, muted, volume]);

  useEffect(() => {
    isPlayingRef.current = playing;
    if (!playing) return;
    let raf = 0;
    let previous = performance.now();
    const tick = (now: number) => {
      if (now - previous >= 30) {
        const delta = Math.min(.12, (now - previous) / 1000);
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
    const playheadX = 124 + playhead * scale;
    const visibleRight = timeline.scrollLeft + timeline.clientWidth;
    const visibleLeft = timeline.scrollLeft + 124;
    if (playheadX > visibleRight - 56) {
      timeline.scrollLeft = Math.max(0, playheadX - timeline.clientWidth + 72);
    } else if (playheadX < visibleLeft) {
      timeline.scrollLeft = Math.max(0, playheadX - 124);
    }
  }, [playhead, playing, scale]);

  const importFiles = useCallback(async (files: FileList | File[]) => {
    const additions: Asset[] = [];
    for (const file of Array.from(files)) {
      if (!(file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/') ||
        /\.(mp4|webm|mov|m4v|mkv|avi|mp3|wav|ogg|m4a|aac|flac|jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name))) {
        notify(`${file.name} is not a supported media file.`, true); continue;
      }
      const asset: Asset = { id: uid(), name: file.name, mimeType: file.type || 'application/octet-stream', byteSize: file.size, blob: file };
      if (isImage(asset)) {
        asset.duration = 5;
      } else {
        const type = isAudio(asset) ? 'audio' : 'video';
        const media = document.createElement(type);
        const url = URL.createObjectURL(file);
        media.preload = 'metadata';
        asset.duration = await new Promise<number>((resolve) => {
          const timer = window.setTimeout(() => resolve(0), 12000);
          media.onloadedmetadata = () => { window.clearTimeout(timer); resolve(Number.isFinite(media.duration) ? media.duration : 0); };
          media.onerror = () => { window.clearTimeout(timer); resolve(0); };
          media.src = url;
        });
        URL.revokeObjectURL(url);
      }
      additions.push(asset);
    }
    if (additions.length) {
      try {
        await saveLocalMedia(projectRef.current.id, additions);
      } catch {
        notify('Could not store imported media in browser storage. Free disk space or remove large files, then retry.', true);
        return;
      }
      setAssets((current) => [...current, ...additions]);
      setSelectedAssetId(additions[0].id);
      notify(`${additions.length} file${additions.length === 1 ? '' : 's'} added to this device's media bin.`);
    }
  }, [notify]);
  const addAssetToTimeline = useCallback((asset: Asset, trackId?: string, at = playhead) => {
    const kind: TrackKind = isAudio(asset) ? 'audio' : 'video';
    let target = trackId ? projectRef.current.tracks.find((track) => track.id === trackId) : projectRef.current.tracks.find((track) => track.kind === kind);
    if (!target) {
      const track: Track = { id: uid(), name: `${kind === 'video' ? 'Video' : 'Audio'} ${projectRef.current.tracks.filter((t) => t.kind === kind).length + 1}`, kind, order: projectRef.current.tracks.length, muted: false };
      commit((current) => ({ ...current, tracks: [...current.tracks, track] }));
      target = track;
    }
    if (target.kind !== kind && !(kind === 'video' && target.kind === 'video')) {
      notify(`That file belongs on an ${kind} track.`, true); return;
    }
    const duration = Math.max(.15, asset.duration || 5);
    const clip: Clip = { id: uid(), assetId: asset.id, trackId: target.id, timelineStart: Math.max(0, at), sourceIn: 0, sourceOut: duration, volume: 1, speed: 1 };
    commit((current) => ({ ...current, clips: [...current.clips, clip] }));
    setSelectedClipId(clip.id);
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
    if (!selectedClip || playhead <= selectedClip.timelineStart + .06 || playhead >= selectedClip.timelineStart + (selectedClip.sourceOut - selectedClip.sourceIn) / selectedClip.speed - .06) {
      notify('Place the playhead inside a selected clip to split it.', true); return;
    }
    const cutSource = selectedClip.sourceIn + (playhead - selectedClip.timelineStart) * selectedClip.speed;
    const right: Clip = { ...selectedClip, id: uid(), timelineStart: playhead, sourceIn: cutSource };
    commit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, sourceOut: cutSource } : clip).concat(right) }));
    setSelectedClipId(right.id);
  };
  const trimAtPlayhead = (side: 'start' | 'end') => {
    if (!selectedClip) return;
    const clipEnd = selectedClip.timelineStart + (selectedClip.sourceOut - selectedClip.sourceIn) / selectedClip.speed;
    if (side === 'start') {
      const delta = playhead - selectedClip.timelineStart;
      if (delta <= 0 || delta >= clipEnd - selectedClip.timelineStart - .08) { notify('Move the playhead inside the clip before trimming.', true); return; }
      commit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, sourceIn: clip.sourceIn + delta * clip.speed, timelineStart: playhead } : clip) }));
    } else {
      if (playhead <= selectedClip.timelineStart + .08 || playhead >= clipEnd) { notify('Move the playhead inside the clip before trimming.', true); return; }
      commit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, sourceOut: clip.sourceIn + (playhead - clip.timelineStart) * clip.speed } : clip) }));
    }
  };
  const removeSelected = () => {
    if (!selectedClip) return;
    commit((current) => ({ ...current, clips: current.clips.filter((clip) => clip.id !== selectedClip.id) }));
    setSelectedClipId(null);
  };
  const updateSelectedClip = (patch: Partial<Pick<Clip, 'timelineStart' | 'sourceIn' | 'sourceOut' | 'speed' | 'volume'>>) => {
    if (!selectedClip) return;
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
          ...patch,
          timelineStart: Math.max(0, patch.timelineStart ?? clip.timelineStart),
          sourceIn,
          sourceOut,
          speed,
          volume: Math.min(2, Math.max(0, patch.volume ?? clip.volume)),
        };
      }),
    }));
  };
  const startTrimDrag = (event: ReactPointerEvent<HTMLButtonElement>, clip: Clip, edge: 'start' | 'end') => {
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
      const duration = (initial.sourceOut - initial.sourceIn) / initial.speed;
      const nextStart = Math.max(0, Math.min(initial.timelineStart + duration - .08, initial.timelineStart + deltaSeconds));
      const sourceDelta = (nextStart - initial.timelineStart) * initial.speed;
      updated = { ...initial, timelineStart: nextStart, sourceIn: Math.max(0, Math.min(initial.sourceOut - minSourceLength, initial.sourceIn + sourceDelta)) };
    } else {
      const asset = assets.find((item) => item.id === initial.assetId);
      const maxSourceTime = Math.max(initial.sourceOut, asset?.duration || 0);
      const sourceOut = Math.max(initial.sourceIn + minSourceLength, Math.min(maxSourceTime, initial.sourceOut + deltaSeconds * initial.speed));
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
    tracks: [...current.tracks, { id: uid(), kind, name: `${kind === 'video' ? 'Video' : 'Audio'} ${current.tracks.filter((t) => t.kind === kind).length + 1}`, order: current.tracks.length, muted: false }],
  }));
  const moveClip = (clipId: string, delta: number, targetTrackId?: string) => {
    const movingClip = projectRef.current.clips.find((clip) => clip.id === clipId);
    const targetTrack = targetTrackId ? projectRef.current.tracks.find((track) => track.id === targetTrackId) : undefined;
    const asset = movingClip ? assets.find((item) => item.id === movingClip.assetId) : undefined;
    if (!movingClip || (targetTrackId && !targetTrack)) return;
    if (targetTrack && asset && targetTrack.kind !== (isAudio(asset) ? 'audio' : 'video')) {
      notify(`This ${isAudio(asset) ? 'audio' : 'video'} clip must stay on a matching track.`, true);
      return;
    }
    commit((current) => ({
      ...current,
      clips: current.clips.map((clip) => clip.id === clipId ? {
        ...clip,
        timelineStart: Math.max(0, clip.timelineStart + delta),
        ...(targetTrackId ? { trackId: targetTrackId } : {}),
      } : clip),
    }));
  };
  const togglePlayback = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (contentEnd > 0 && playhead >= contentEnd) setPlayhead(0);
    setPlaying(true);
  };
  const openProjects = async () => {
    try { setSavedProjects(await readLocalProjects()); setDialog('project'); }
    catch { notify('Could not read projects from local browser storage.', true); }
  };
  const saveNow = async () => {
    try {
      await saveLocalProject(project, assets);
      setSavedProjects(await readLocalProjects()); setSaveState('Saved on this device');
      notify('Project saved locally. Media stays on this device.');
    } catch { notify('Save failed. Check available browser storage.', true); }
  };
  const openProject = async (record: SavedProject) => {
    try {
      const localAssets = await readLocalMedia(record.project.id);
      history.current = []; future.current = [];
      setProject(record.project); setAssets(localAssets); setSelectedClipId(null); setSelectedAssetId(null); setPlayhead(0); setDialog(null);
      notify(`Opened “${record.project.name}” from local storage.`);
    } catch {
      notify('Could not load this project’s local media. Its project settings are still saved.', true);
    }
  };
  const newProject = () => {
    history.current = []; future.current = [];
    setProject(createProject(`Cut ${new Date().toLocaleDateString()}`)); setAssets([]); setSelectedClipId(null); setSelectedAssetId(null); setPlayhead(0); setDialog(null);
  };
  const renameProject = () => {
    const name = window.prompt('Project name', project.name);
    if (name?.trim()) commit((current) => ({ ...current, name: name.trim() }));
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void saveNow(); }
      const target = event.target;
      const editing = target instanceof HTMLElement && (
        target.isContentEditable || target.matches('input, textarea, select')
      );
      if (editing) return;
      if (event.code === 'Space') { event.preventDefault(); togglePlayback(); }
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedClipId) removeSelected();
      if (event.key === 'ArrowLeft') setPlayhead((time) => Math.max(0, time - 1 / project.frameRate));
      if (event.key === 'ArrowRight') setPlayhead((time) => Math.min(timelineEnd, time + 1 / project.frameRate));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  const timelinePosition = (event: DragEvent, trackId: string) => {
    const lane = event.currentTarget.getBoundingClientRect();
    const scrollLeft = timelineRef.current?.scrollLeft || 0;
    return { time: Math.max(0, (event.clientX - lane.left + scrollLeft) / scale), trackId };
  };

  const exportCut = async () => {
    if (!project.clips.length) { notify('Add a clip to the timeline before exporting.', true); return; }
    const end = Math.max(...project.clips.map((clip) => clip.timelineStart + (clip.sourceOut - clip.sourceIn) / clip.speed));
    const extension = format;
    const baseName = exportName.trim().replace(/\.(mp4|webm)$/i, '') || 'cutline-export';
    type FileWriteCommand = { type: 'write'; position: number; data: Uint8Array };
    type WritableFile = { write: (chunk: FileWriteCommand) => Promise<void>; close: () => Promise<void>; abort: (reason?: unknown) => Promise<void> };
    type SavePicker = Window & {
      showSaveFilePicker?: (options: {
        suggestedName: string;
        types: Array<{ description: string; accept: Record<string, string[]> }>;
      }) => Promise<{ createWritable: () => Promise<unknown> }>;
    };
    const pickerWindow = window as SavePicker;
    let fileHandle: { createWritable: () => Promise<unknown> } | null = null;
    try {
      // Call the picker before awaiting codec detection so the browser still considers it user initiated.
      if (pickerWindow.showSaveFilePicker) {
        fileHandle = await pickerWindow.showSaveFilePicker({
          suggestedName: `${baseName}.${extension}`,
          types: [{ description: `${extension.toUpperCase()} video`, accept: { [format === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${extension}`] } }],
        });
      } else {
        const estimatedBytes = end * (project.width >= 1920 ? 5_000_000 : project.width >= 1280 ? 2_800_000 : 1_500_000) / 8;
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

    setExporting(true);
    exportCancelRequested.current = false;
    setExportProgress(0);
    const liveUrls: string[] = [];
    const videos = new Map<string, HTMLVideoElement>();
    const images = new Map<string, HTMLImageElement>();
    const audioJobs: Array<{ clip: Clip; media: HTMLAudioElement; gain: GainNode }> = [];
    let audioContext: AudioContext | null = null;
    let audioSource: MediaStreamAudioTrackSource | null = null;
    let audioTrack: MediaStreamTrack | null = null;
    let videoSource: CanvasSource | null = null;
    let output: Output | null = null;
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
      if (fileHandle) {
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

      const canvas = document.createElement('canvas');
      canvas.width = project.width;
      canvas.height = project.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
      const bitrate = Math.round(Math.min(5_000_000, Math.max(1_200_000, project.width * project.height * project.frameRate * 0.06)));
      videoSource = new CanvasSource(canvas, {
        codec: format === 'mp4' ? 'avc' : 'vp8',
        quality: new Quality({ bitrate }),
        hardwareAcceleration: 'prefer-hardware',
      });
      output.addVideoTrack(videoSource, { frameRate: project.frameRate });

      audioContext = new AudioContext();
      const audioDestination = audioContext.createMediaStreamDestination();
      for (const clip of project.clips) {
        const asset = assets.find((item) => item.id === clip.assetId);
        const track = project.tracks.find((item) => item.id === clip.trackId);
        if (!asset || !track || track.muted || (!isAudio(asset) && !isVideo(asset))) continue;
        const media = document.createElement('audio');
        media.preload = 'auto';
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

      for (const asset of assets) {
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
        } else if (isVideo(asset)) {
          const video = document.createElement('video');
          const url = URL.createObjectURL(asset.blob);
          liveUrls.push(url);
          video.src = url;
          video.muted = true;
          video.preload = 'auto';
          video.playsInline = true;
          await new Promise<void>((resolve, reject) => {
            const timeout = window.setTimeout(() => reject(new Error(`Timed out loading “${asset.name}”.`)), 15000);
            video.onloadeddata = () => { window.clearTimeout(timeout); resolve(); };
            video.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Could not decode video “${asset.name}” in this browser.`)); };
          });
          videos.set(asset.id, video);
        }
      }
      await Promise.all(audioJobs.map(({ media, clip }) => new Promise<void>((resolve, reject) => {
        if (media.readyState >= 1) { resolve(); return; }
        const timeout = window.setTimeout(() => reject(new Error(`Timed out loading audio for clip ${clip.id}.`)), 15000);
        media.onloadedmetadata = () => { window.clearTimeout(timeout); resolve(); };
        media.onerror = () => { window.clearTimeout(timeout); reject(new Error(`Could not decode audio for clip ${clip.id}.`)); };
      })));
      await audioContext.resume();
      await output.start();
      const startedAt = performance.now();
      let previousFrame = -1;
      await new Promise<void>((resolve, reject) => {
        const drawFrame = async (now: number) => {
          if (exportCancelRequested.current) {
            reject(new DOMException('Export cancelled by the user.', 'AbortError'));
            return;
          }
          const elapsed = Math.min(end, (now - startedAt) / 1000);
          const frameNumber = Math.floor(elapsed * project.frameRate);
          if (frameNumber > previousFrame) {
            previousFrame = frameNumber;
            const timestamp = frameNumber / project.frameRate;
            const t = Math.min(end, timestamp);
            if (failureFromAudio) { reject(failureFromAudio); return; }
            context.fillStyle = '#101216';
            context.fillRect(0, 0, canvas.width, canvas.height);
            const activeClips = project.clips.filter((clip) => {
              const track = project.tracks.find((item) => item.id === clip.trackId);
              return track?.kind === 'video' && !track.muted && t >= clip.timelineStart && t < clip.timelineStart + (clip.sourceOut - clip.sourceIn) / clip.speed;
            }).sort((a, b) => {
              const orderA = project.tracks.find((track) => track.id === a.trackId)?.order ?? 0;
              const orderB = project.tracks.find((track) => track.id === b.trackId)?.order ?? 0;
              return orderA - orderB || a.timelineStart - b.timelineStart;
            });
            const visual = activeClips[activeClips.length - 1];
            if (visual) {
              const asset = assets.find((item) => item.id === visual.assetId);
              if (asset && isImage(asset)) {
                const image = images.get(asset.id);
                if (image?.complete && image.naturalWidth) drawContained(context, image, canvas.width, canvas.height);
              } else if (asset) {
                const video = videos.get(asset.id);
                if (video?.readyState && video.readyState >= 2) {
                  const sourceTime = visual.sourceIn + (t - visual.timelineStart) * visual.speed;
                  video.playbackRate = visual.speed;
                  if (Math.abs(video.currentTime - sourceTime) > .35) {
                    try { video.currentTime = sourceTime; } catch { /* keep rendering the latest decoded frame */ }
                  }
                  if (video.paused) void video.play().catch(() => undefined);
                  drawContained(context, video, canvas.width, canvas.height);
                }
              }
            }
            videos.forEach((video, assetId) => { if (!visual || visual.assetId !== assetId) video.pause(); });
            audioJobs.forEach(({ clip, media, gain }) => {
              const active = t >= clip.timelineStart && t < clip.timelineStart + (clip.sourceOut - clip.sourceIn) / clip.speed;
              if (active) {
                const desired = clip.sourceIn + (t - clip.timelineStart) * clip.speed;
                if (Math.abs(media.currentTime - desired) > .35) {
                  try { media.currentTime = desired; } catch { /* media metadata may still be loading */ }
                }
                gain.gain.value = clip.volume;
                media.playbackRate = clip.speed;
                if (media.paused) void media.play().catch((error: unknown) => { failureFromAudio = error; });
              } else if (!media.paused) media.pause();
            });
            try {
              await videoSource!.add(timestamp, Math.min(1 / project.frameRate, Math.max(0, end - timestamp)));
            } catch (error) {
              reject(error);
              return;
            }
            setExportProgress(Math.min(99, Math.round(elapsed / end * 100)));
          }
          if (elapsed >= end) { resolve(); return; }
          requestAnimationFrame((nextNow) => { void drawFrame(nextNow).catch(reject); });
        };
        requestAnimationFrame((now) => { void drawFrame(now).catch(reject); });
      });

      videos.forEach((video) => video.pause());
      audioJobs.forEach(({ media }) => media.pause());
      if (failureFromAudio) throw failureFromAudio;
      videoSource.close();
      audioSource.close();
      await output.finalize();
      outputCompleted = true;
      setExportProgress(100);
      if (target instanceof BufferTarget) {
        const buffer = target.buffer;
        if (!buffer) throw new Error('The encoder finished without producing a file.');
        const blob = new Blob([buffer], { type: format === 'mp4' ? 'video/mp4' : 'video/webm' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${baseName}.${extension}`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 30000);
        notify(`Rendered ${formatBytes(blob.size)} ${extension.toUpperCase()} locally.`);
      } else {
        notify(`Rendered ${baseName}.${extension} directly to disk.`);
      }
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
      audioJobs.forEach(({ media }) => { media.pause(); media.removeAttribute('src'); });
      videos.forEach((video) => { video.pause(); video.removeAttribute('src'); });
      audioSource?.close();
      videoSource?.close();
      audioTrack?.stop();
      liveUrls.forEach(URL.revokeObjectURL);
      if (audioContext && audioContext.state !== 'closed') await audioContext.close();
      if (diskWriter && !outputCompleted) {
        try { await diskWriter.abort(); } catch { /* writer may already be closed by Output */ }
      }
      setExporting(false);
      setExportProgress(0);
    }
  };

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
        else if (event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
      }}>
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><Scissors size={16} strokeWidth={2.6} /></span><span>cutline</span></div>
        <button className="project-name icon-btn" onClick={renameProject} title="Rename project" data-testid="button-rename-project">{project.name}<ChevronDown size={13} /></button>
        <div className="save-state"><span style={{ color: saveState.includes('Saved') ? '#73bd93' : '#8f969f' }}>●</span>{saveState}</div>
        <div className="top-spacer" />
        <button className="icon-btn" onClick={undo} disabled={!history.current.length} title="Undo (Ctrl+Z)" data-testid="button-undo"><Undo2 size={16} /></button>
        <button className="icon-btn" onClick={redo} disabled={!future.current.length} title="Redo (Ctrl+Shift+Z)" data-testid="button-redo"><Redo2 size={16} /></button>
        <button className="btn" onClick={openProjects} data-testid="button-open-project"><FolderOpen size={14} /><span>Open</span></button>
        <button className="btn" onClick={() => void saveNow()} data-testid="button-save-project"><HardDrive size={14} /><span>Save</span></button>
        <button className="btn primary" onClick={() => setDialog('export')} data-testid="button-export"><Download size={14} /><span>Export</span></button>
      </header>
      <section className="editor-body">
        <aside className="library">
          <div className="panel-heading"><Grid2X2 size={14} /> Media bin <small>{assets.length} ITEMS</small></div>
          <div className="asset-tools">
            <label className="search-box"><Search size={13} /><input aria-label="Search media" data-testid="input-search-media" placeholder="Find media…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            <button className="icon-btn active" title="Import local media" onClick={() => fileInput.current?.click()} data-testid="button-import"><Plus size={17} /></button>
            <input ref={fileInput} hidden type="file" multiple accept="video/*,audio/*,image/*,.mkv,.avi,.flac" onChange={(event) => { if (event.target.files) void importFiles(event.target.files); event.target.value = ''; }} data-testid="input-media-files" />
          </div>
          <div className="asset-list">
            {filteredAssets.length === 0 ? (
              <button className="asset-row" style={{ minHeight: 72, cursor: 'pointer' }} onClick={() => fileInput.current?.click()} data-testid="button-empty-import">
                <span className="asset-thumb"><Upload size={16} /></span><span className="asset-details"><span className="asset-name">{assets.length ? 'No matching media' : 'Bring in your first clip'}</span><span className="asset-meta">{assets.length ? 'Try another search' : 'Import files from this PC'}</span></span>
              </button>
            ) : filteredAssets.map((asset) => (
              <div key={asset.id} role="button" tabIndex={0} className={`asset-row ${selectedAssetId === asset.id ? 'selected' : ''}`}
                draggable onDragStart={(event) => { event.dataTransfer.setData('application/x-cutline-asset', asset.id); event.dataTransfer.effectAllowed = 'copy'; }}
                onClick={() => setSelectedAssetId(asset.id)}
                onDoubleClick={() => addAssetToTimeline(asset)} onKeyDown={(event) => { if (event.key === 'Enter') addAssetToTimeline(asset); }}
                data-testid={`row-media-${asset.id}`}>
                <span className="asset-thumb">{isImage(asset) ? <FileImage size={16} /> : isAudio(asset) ? <FileAudio size={16} /> : <Film size={17} />}</span>
                <span className="asset-details"><span className="asset-name">{asset.name}</span><span className="asset-meta">{asset.duration ? formatTime(asset.duration) : 'Duration unavailable'} · {formatBytes(asset.byteSize)}</span></span>
                <button className="icon-btn asset-add" aria-label={`Add ${asset.name} to timeline`} onClick={(event) => { event.stopPropagation(); addAssetToTimeline(asset); }} data-testid={`button-add-media-${asset.id}`}><Plus size={15} /></button>
              </div>
            ))}
          </div>
          <div className="library-foot">Files remain on this device. Cutline does not upload your media.</div>
        </aside>
        <section className="stage">
          <div className="stage-tools">
            <button className="icon-btn" title="Add video track" onClick={() => addTrack('video')} data-testid="button-add-video-track"><Layers2 size={15} /></button>
            <button className="icon-btn" title="Add audio track" onClick={() => addTrack('audio')} data-testid="button-add-audio-track"><AudioLines size={15} /></button>
            <span className="divider" />
            <button className="icon-btn" title="Split selected clip at playhead" onClick={splitSelected} disabled={!selectedClip} data-testid="button-split"><Split size={15} /></button>
            <button className="icon-btn" title="Delete selected clip" onClick={removeSelected} disabled={!selectedClip} data-testid="button-delete-clip"><Trash2 size={15} /></button>
            <span className="divider" />
            <label>Canvas</label>
            <select aria-label="Project resolution" value={`${project.width}x${project.height}`} onChange={(event) => { const [width, height] = event.target.value.split('x').map(Number); commit((current) => ({ ...current, width, height })); }} data-testid="select-resolution">
              <option value="1920x1080">1080p</option><option value="1280x720">720p</option><option value="854x480">480p</option>
            </select>
            <select aria-label="Project frame rate" value={project.frameRate} onChange={(event) => commit((current) => ({ ...current, frameRate: Number(event.target.value) }))} data-testid="select-frame-rate">
              <option value={24}>24 fps</option><option value={30}>30 fps</option><option value={60}>60 fps</option>
            </select>
          </div>
          <div className="preview-wrap">
            <div className="preview-frame">
              {activeVisualAsset && isImage(activeVisualAsset) ? <img src={imagePreview || undefined} alt={`Preview: ${activeVisualAsset.name}`} /> :
                activeVisualAsset ? <video
                  ref={videoRef}
                  src={imagePreview || undefined}
                  playsInline
                  preload="auto"
                  onLoadedMetadata={(event) => {
                    if (!activeVisualClip) return;
                    const sourceTime = activeVisualClip.sourceIn + (playhead - activeVisualClip.timelineStart) * activeVisualClip.speed;
                    try { event.currentTarget.currentTime = Math.max(0, sourceTime); } catch { /* browser may not have a seekable range yet */ }
                    event.currentTarget.playbackRate = activeVisualClip.speed;
                  }}
                  onEnded={() => setPlaying(false)}
                /> :
                  <div className="preview-empty"><Clapperboard size={27} strokeWidth={1.25} /><strong>Your cut starts here</strong><span>Import media, then add it to a track</span></div>}
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
          onChange={updateSelectedClip}
          onRemove={removeSelected}
        />
      </section>
      <section className="timeline-panel">
        <div className="timeline-head">
          <span className="timeline-label">Timeline</span>
          <button className="btn flat" title="Trim selected clip start to playhead" disabled={!selectedClip} onClick={() => trimAtPlayhead('start')} data-testid="button-trim-start"><Minus size={13} />In</button>
          <button className="btn flat" title="Trim selected clip end to playhead" disabled={!selectedClip} onClick={() => trimAtPlayhead('end')} data-testid="button-trim-end"><Minus size={13} />Out</button>
          <button className="icon-btn" title="Delete selected clip" disabled={!selectedClip} onClick={removeSelected} data-testid="button-timeline-delete"><Trash2 size={14} /></button>
          <span className="minor">{selectedClip ? `Selected · ${formatTime((selectedClip.sourceOut - selectedClip.sourceIn) / selectedClip.speed)}` : `${project.clips.length} clips`}</span>
          {selectedClip && <label className="clip-volume">Clip gain
            <input aria-label="Selected clip volume" type="range" min="0" max="2" step=".01" value={selectedClip.volume} onChange={(event) => commit((current) => ({ ...current, clips: current.clips.map((clip) => clip.id === selectedClip.id ? { ...clip, volume: Number(event.target.value) } : clip) }))} data-testid="input-clip-volume" />
          </label>}
          <button className="icon-btn" title="Zoom out timeline" onClick={() => setZoom((value) => Math.max(.5, value - .25))} data-testid="button-zoom-out"><Minus size={14} /></button>
          <button className="icon-btn" title="Zoom in timeline" onClick={() => setZoom((value) => Math.min(2, value + .25))} data-testid="button-zoom-in"><Plus size={14} /></button>
        </div>
        <div className="tracks-scroll" ref={timelineRef} data-testid="region-timeline">
          <div className="timeline-inner" style={{ width: 124 + timelineEnd * scale }}>
            <div className="ruler">
              {Array.from({ length: Math.ceil(timelineEnd / 5) + 1 }, (_, index) => <span className="tick" key={index} style={{ left: index * 5 * scale }}>{index === 0 ? '00:00' : `${String(Math.floor(index * 5 / 60)).padStart(2, '0')}:${String(index * 5 % 60).padStart(2, '0')}`}</span>)}
            </div>
            {orderedTracks.map((track) => (
              <div className="track-row" key={track.id}>
                <div className="track-meta">
                  {track.kind === 'video' ? <Film size={13} color="#74bac0" /> : <AudioLines size={13} color="#b4a0e1" />}
                  <span className="track-name">{track.name}</span>
                  <button className={`icon-btn ${track.muted ? 'active' : ''}`} title={track.muted ? 'Unmute track' : 'Mute track'} onClick={() => commit((current) => ({ ...current, tracks: current.tracks.map((t) => t.id === track.id ? { ...t, muted: !t.muted } : t) }))} data-testid={`button-mute-track-${track.id}`}>{track.muted ? <VolumeX size={12} /> : <Volume2 size={12} />}</button>
                </div>
          <div className="track-lane" style={{ backgroundSize: `${5 * scale}px 100%` }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
            setDropActive(false);
                  const point = timelinePosition(event, track.id);
                  const clipId = event.dataTransfer.getData('application/x-cutline-clip');
                  const assetId = event.dataTransfer.getData('application/x-cutline-asset');
                  if (clipId) moveClip(clipId, point.time - Number(event.dataTransfer.getData('application/x-cutline-offset')), track.id);
                  else { const asset = assets.find((item) => item.id === assetId); if (asset) addAssetToTimeline(asset, track.id, point.time); }
            if (!clipId && !assetId && event.dataTransfer.files.length) void importFiles(event.dataTransfer.files);
                }} onClick={(event) => {
                  if ((event.target as HTMLElement).closest('.clip')) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  setPlayhead(Math.max(0, (event.clientX - rect.left + (timelineRef.current?.scrollLeft || 0)) / scale));
                }} data-testid={`lane-track-${track.id}`}>
                  {project.clips.filter((clip) => clip.trackId === track.id).map((clip) => {
                    const asset = assets.find((item) => item.id === clip.assetId);
                    if (!asset) return null;
                    const duration = (clip.sourceOut - clip.sourceIn) / clip.speed;
                    return <div key={clip.id} draggable className={`clip ${isAudio(asset) ? 'audio' : isImage(asset) ? 'image' : 'video'} ${selectedClipId === clip.id ? 'selected' : ''}`}
                      style={{ left: clip.timelineStart * scale, width: Math.max(8, duration * scale), opacity: track.muted ? .5 : 1 }}
                      onClick={(event) => { event.stopPropagation(); setSelectedClipId(clip.id); setSelectedAssetId(asset.id); }}
                      onDoubleClick={(event) => { event.stopPropagation(); setSelectedClipId(clip.id); setPlayhead(clip.timelineStart); }}
                      onDragStart={(event) => {
                        if ((event.target as HTMLElement).closest('.clip-trim-handle')) {
                          event.preventDefault();
                          return;
                        }
                        event.dataTransfer.setData('application/x-cutline-clip', clip.id);
                        event.dataTransfer.setData('application/x-cutline-offset', String(Math.max(0, (event.clientX - event.currentTarget.getBoundingClientRect().left) / scale)));
                      }}
                      title={`${asset.name} · ${formatTime(duration)}`} data-testid={`clip-${clip.id}`}>
                <button
                  type="button"
                  className="clip-trim-handle clip-trim-handle--start"
                  aria-label={`Trim start of ${asset.name}`}
                  title="Drag to trim clip start"
                  onPointerDown={(event) => startTrimDrag(event, clip, 'start')}
                  onPointerMove={updateTrimDrag}
                  onPointerUp={finishTrimDrag}
                  onPointerCancel={finishTrimDrag}
                  data-testid={`button-trim-clip-start-${clip.id}`}
                />
                <span className="clip-title">{asset.name}</span>
                <button
                  type="button"
                  className="clip-trim-handle clip-trim-handle--end"
                  aria-label={`Trim end of ${asset.name}`}
                  title="Drag to trim clip end"
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
      {dialog === 'project' && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setDialog(null); }}>
        <section className="dialog" aria-label="Local projects">
          <h2>Projects on this device</h2><p>Your project files and imported media are stored in this browser only.</p>
          <button className="btn primary" onClick={newProject} data-testid="button-new-project"><FilePlus2 size={14} />New project</button>
          <div style={{ marginTop: 14, maxHeight: 280, overflow: 'auto' }}>
            {savedProjects.length ? savedProjects.sort((a, b) => b.savedAt - a.savedAt).map((record) => <button key={record.project.id} className="asset-row" style={{ width: '100%' }} onClick={() => void openProject(record)} data-testid={`button-open-saved-${record.project.id}`}>
              <span className="asset-thumb"><Clapperboard size={16} /></span><span className="asset-details"><span className="asset-name">{record.project.name}</span><span className="asset-meta">{record.project.clips.length} clips · {new Date(record.savedAt).toLocaleString()}</span></span>
              {record.project.id === project.id && <Check size={15} color="#edb94e" />}
            </button>) : <div className="library-foot" style={{ padding: 14 }}>No saved projects yet. The current project autosaves locally.</div>}
          </div>
          <div className="dialog-actions"><button className="btn" onClick={() => setDialog(null)} data-testid="button-close-projects">Close</button></div>
        </section>
      </div>}
      {dialog === 'export' && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !exporting) setDialog(null); }}>
        <section className="dialog" aria-label="Export project">
          <h2>Export your cut</h2><p>Rendered on this device with WebCodecs. Cutline checks the selected browser encoders before rendering; no FFmpeg engine or cloud service is used.</p>
          <label htmlFor="export-name">File name</label><input id="export-name" value={exportName} onChange={(event) => setExportName(event.target.value)} disabled={exporting} data-testid="input-export-name" />
          <label htmlFor="export-format">Format</label><select id="export-format" value={format} onChange={(event) => setFormat(event.target.value as 'mp4' | 'webm')} disabled={exporting} data-testid="select-export-format"><option value="mp4">MP4 · AVC video + AAC audio</option><option value="webm">WebM · VP8 video + Opus audio</option></select>
          <p style={{ marginBottom: 0 }}>Output: {project.width} × {project.height} at {project.frameRate} fps. Large renders stream to disk when File System Access is available. Without it, the in-memory fallback is limited to cuts under 30 seconds.</p>
          {exporting && <div className="progress-track"><span style={{ width: `${exportProgress}%` }} /></div>}
          <div className="dialog-actions"><button className="btn" onClick={() => { if (exporting) exportCancelRequested.current = true; else setDialog(null); }} data-testid="button-cancel-export">{exporting ? 'Stop render' : 'Cancel'}</button><button className="btn primary" disabled={exporting || project.clips.length === 0} onClick={() => void exportCut()} data-testid="button-start-export">{exporting ? `${exportProgress}%` : <><Download size={14} />Render {format.toUpperCase()}</>}</button></div>
        </section>
      </div>}
      {exporting && <div className="notice" role="status"><Activity size={15} />Rendering cut locally · {exportProgress}%</div>}
    </main>
  );
}

function App() {
  return <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></WouterRouter>;
}
export default App;
