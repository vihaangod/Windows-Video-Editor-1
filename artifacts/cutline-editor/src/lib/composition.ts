export type TrackKind = 'video' | 'audio' | 'text';

export type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  order: number;
  muted: boolean;
  visible?: boolean;
  locked?: boolean;
};

export type ClipTransform = {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
  fit: 'contain' | 'cover';
};

export type ClipEffects = {
  brightness: number;
  contrast: number;
  saturation: number;
  blur: number;
};

export type TextOverlay = {
  templateId: string;
  templateName: string;
  content: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  x: number;
  y: number;
  backgroundColor: string;
  outlineColor: string;
  outlineWidth: number;
  shadow: boolean;
  opacity: number;
};

export type Clip = {
  id: string;
  assetId?: string;
  trackId: string;
  timelineStart: number;
  sourceIn: number;
  sourceOut: number;
  volume: number;
  speed: number;
  transform?: Partial<ClipTransform>;
  effects?: Partial<ClipEffects>;
  opacity?: number;
  fadeIn?: number;
  fadeOut?: number;
  text?: TextOverlay;
};

export type Project = {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  tracks: Track[];
  clips: Clip[];
};

export type Asset = {
  id: string;
  name: string;
  mimeType: string;
  byteSize: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  blob: Blob;
};

export type AssetMetadata = Omit<Asset, 'blob'>;
export type SavedProject = { project: Project; assets: AssetMetadata[]; savedAt: number };

export const DEFAULT_TRANSFORM: ClipTransform = {
  x: 0,
  y: 0,
  scale: 1,
  rotation: 0,
  anchorX: .5,
  anchorY: .5,
  fit: 'contain',
};

export const DEFAULT_EFFECTS: ClipEffects = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  blur: 0,
};

export function getClipDuration(clip: Clip): number {
  return Math.max(0, (clip.sourceOut - clip.sourceIn) / Math.max(.1, clip.speed));
}

export function getClipFade(clip: Clip, time: number): number {
  const duration = getClipDuration(clip);
  const elapsed = time - clip.timelineStart;
  const fadeIn = Math.max(0, clip.fadeIn || 0);
  const fadeOut = Math.max(0, clip.fadeOut || 0);
  const inAlpha = fadeIn ? Math.min(1, elapsed / fadeIn) : 1;
  const outAlpha = fadeOut ? Math.min(1, (duration - elapsed) / fadeOut) : 1;
  return Math.max(0, Math.min(1, inAlpha, outAlpha));
}

function drawText(
  context: CanvasRenderingContext2D,
  clip: Clip,
  time: number,
  project: Project,
) {
  const text = clip.text;
  if (!text) return;
  const transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const effects = { ...DEFAULT_EFFECTS, ...clip.effects };
  context.save();
  context.translate(project.width / 2 + transform.x, project.height / 2 + transform.y);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.scale, transform.scale);
  context.globalAlpha = Math.max(0, Math.min(1, (clip.opacity ?? 1) * text.opacity * getClipFade(clip, time)));
  context.filter = `brightness(${effects.brightness}) contrast(${effects.contrast}) saturate(${effects.saturation}) blur(${effects.blur}px)`;

  const fontSize = Math.max(8, text.fontSize);
  const lineHeight = fontSize * 1.18;
  const maxWidth = project.width * .84;
  const words = text.content.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  context.font = `${text.fontWeight} ${fontSize}px ${text.fontFamily}`;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line || lines.length === 0) lines.push(line);

  const x = text.x * project.width - project.width / 2;
  const firstY = text.y * project.height - project.height / 2;
  const widest = Math.max(0, ...lines.map((item) => context.measureText(item).width));
  const left = text.align === 'center' ? x - widest / 2 : text.align === 'right' ? x - widest : x;
  const top = firstY - lineHeight / 2;
  if (text.backgroundColor) {
    context.fillStyle = text.backgroundColor;
    context.fillRect(left - fontSize * .3, top - fontSize * .14, widest + fontSize * .6, lineHeight * lines.length + fontSize * .28);
  }
  context.textAlign = text.align;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  if (text.shadow) {
    context.shadowColor = 'rgba(0,0,0,.8)';
    context.shadowBlur = fontSize * .22;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = fontSize * .08;
  }
  lines.forEach((item, index) => {
    const y = firstY + index * lineHeight;
    if (text.outlineWidth > 0) {
      context.strokeStyle = text.outlineColor;
      context.lineWidth = text.outlineWidth;
      context.strokeText(item, x, y, maxWidth);
    }
    context.fillStyle = text.color;
    context.fillText(item, x, y, maxWidth);
  });
  context.restore();
}

function drawMedia(
  context: CanvasRenderingContext2D,
  clip: Clip,
  asset: Asset,
  source: HTMLImageElement | HTMLVideoElement,
  time: number,
  project: Project,
  playing: boolean,
) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth || asset.width || 0 : source.naturalWidth || asset.width || 0;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight || asset.height || 0 : source.naturalHeight || asset.height || 0;
  if (!sourceWidth || !sourceHeight) return;
  if (source instanceof HTMLImageElement && !source.complete) return;
  if (source instanceof HTMLVideoElement) {
    if (source.readyState < 2) return;
    const sourceTime = clip.sourceIn + (time - clip.timelineStart) * clip.speed;
    if (Math.abs(source.currentTime - sourceTime) > .32) {
      try { source.currentTime = Math.max(0, sourceTime); } catch { /* the browser can seek after metadata loads */ }
    }
    source.playbackRate = clip.speed;
    if (playing && source.paused) void source.play().catch(() => undefined);
    else if (!playing && !source.paused) source.pause();
  }

  const transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const effects = { ...DEFAULT_EFFECTS, ...clip.effects };
  const fitScale = transform.fit === 'cover'
    ? Math.max(project.width / sourceWidth, project.height / sourceHeight)
    : Math.min(project.width / sourceWidth, project.height / sourceHeight);
  const drawWidth = sourceWidth * fitScale;
  const drawHeight = sourceHeight * fitScale;

  context.save();
  context.translate(project.width / 2 + transform.x, project.height / 2 + transform.y);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.scale, transform.scale);
  context.globalAlpha = Math.max(0, Math.min(1, (clip.opacity ?? 1) * getClipFade(clip, time)));
  context.filter = `brightness(${effects.brightness}) contrast(${effects.contrast}) saturate(${effects.saturation}) blur(${effects.blur}px)`;
  context.drawImage(source, -transform.anchorX * drawWidth, -transform.anchorY * drawHeight, drawWidth, drawHeight);
  context.restore();
}

export function renderProjectFrame(
  context: CanvasRenderingContext2D,
  project: Project,
  assets: Asset[],
  mediaByAsset: Map<string, HTMLImageElement | HTMLVideoElement>,
  time: number,
  playing: boolean,
) {
  context.save();
  context.filter = 'none';
  context.globalAlpha = 1;
  context.fillStyle = '#101216';
  context.fillRect(0, 0, project.width, project.height);

  const activeVisual = project.clips.filter((clip) => {
    const track = project.tracks.find((item) => item.id === clip.trackId);
    if (!track || (track.kind !== 'video' && track.kind !== 'text')) return false;
    return track.visible !== false && time >= clip.timelineStart && time < clip.timelineStart + getClipDuration(clip);
  }).sort((a, b) => {
    const orderA = project.tracks.find((track) => track.id === a.trackId)?.order ?? 0;
    const orderB = project.tracks.find((track) => track.id === b.trackId)?.order ?? 0;
    return orderA - orderB || a.timelineStart - b.timelineStart;
  });
  const activeAssetIds = new Set<string>();
  for (const clip of activeVisual) {
    if (clip.text) {
      drawText(context, clip, time, project);
      continue;
    }
    if (!clip.assetId) continue;
    activeAssetIds.add(clip.assetId);
    const asset = assets.find((item) => item.id === clip.assetId);
    const source = mediaByAsset.get(clip.assetId);
    if (asset && source) drawMedia(context, clip, asset, source, time, project, playing);
  }

  for (const [assetId, source] of mediaByAsset) {
    if (source instanceof HTMLVideoElement && !activeAssetIds.has(assetId) && !source.paused) source.pause();
  }
  context.restore();
}

export function getAudioFade(clip: Clip, time: number): number {
  return getClipFade(clip, time);
}
