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
  enabled?: Partial<Record<'brightness' | 'contrast' | 'saturation' | 'blur', boolean>>;
};

export type TextBackgroundStyle = {
  enabled?: boolean;
  opacity?: number;
  padding?: number;
  radius?: number;
  width?: number;
  height?: number;
  alignX?: 'left' | 'center' | 'right';
  alignY?: 'top' | 'center' | 'bottom';
  offsetX?: number;
  offsetY?: number;
  borderColor?: string;
  borderWidth?: number;
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
  backgroundStyle?: TextBackgroundStyle;
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
  displayName?: string;
  audioOnly?: boolean;
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
  transitions?: ClipTransition[];
  removedAssetIds?: string[];
};

export type ClipTransition = {
  id: string;
  fromClipId: string;
  toClipId: string;
  type: 'cross-dissolve' | 'fade-through-black' | 'wipe' | 'slide' | 'zoom';
  duration: number;
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
  hasAudio?: boolean;
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
  enabled: { brightness: true, contrast: true, saturation: true, blur: true },
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
  const layout = getTextLayout(context, text, project);
  const transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const effects = { ...DEFAULT_EFFECTS, ...clip.effects };
  context.save();
  context.translate(project.width / 2 + transform.x, project.height / 2 + transform.y);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.scale, transform.scale);
  context.globalAlpha = Math.max(0, Math.min(1, (clip.opacity ?? 1) * text.opacity * getClipFade(clip, time)));
  context.filter = `brightness(${effects.enabled?.brightness === false ? 1 : effects.brightness}) contrast(${effects.enabled?.contrast === false ? 1 : effects.contrast}) saturate(${effects.enabled?.saturation === false ? 1 : effects.saturation}) blur(${effects.enabled?.blur === false ? 0 : effects.blur}px)`;

  const { fontSize, lineHeight, lines, x, firstY, background } = layout;
  context.font = `${text.fontWeight} ${fontSize}px ${text.fontFamily}`;
  if (background && text.backgroundColor) {
    context.save();
    context.globalAlpha *= Math.max(0, Math.min(1, background.opacity));
    context.fillStyle = text.backgroundColor;
    roundedRect(context, background.x, background.y, background.width, background.height, background.radius);
    context.fill();
    if (background.borderWidth > 0) {
      context.strokeStyle = background.borderColor;
      context.lineWidth = background.borderWidth;
      context.stroke();
    }
    context.restore();
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
      context.strokeText(item, x, y, layout.maxWidth);
    }
    context.fillStyle = text.color;
    context.fillText(item, x, y, layout.maxWidth);
  });
  context.restore();
}

type TextLayout = {
  fontSize: number;
  lineHeight: number;
  lines: string[];
  x: number;
  firstY: number;
  maxWidth: number;
  textLeft: number;
  textTop: number;
  textRight: number;
  textBottom: number;
  background: { x: number; y: number; width: number; height: number; radius: number; opacity: number; borderColor: string; borderWidth: number } | null;
};

function getTextLayout(context: CanvasRenderingContext2D, text: TextOverlay, project: Project): TextLayout {
  const fontSize = Math.max(8, text.fontSize);
  const lineHeight = fontSize * 1.18;
  const maxWidth = project.width * .84;
  const lines: string[] = [];
  context.font = `${text.fontWeight} ${fontSize}px ${text.fontFamily}`;
  for (const paragraph of text.content.replace(/\r/g, '').split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  if (!lines.length) lines.push('');
  const x = text.x * project.width - project.width / 2;
  const firstY = text.y * project.height - project.height / 2;
  const widest = Math.min(maxWidth, Math.max(0, ...lines.map((line) => context.measureText(line).width)));
  const textLeft = text.align === 'center' ? x - widest / 2 : text.align === 'right' ? x - widest : x;
  const textTop = firstY - lineHeight / 2;
  const textRight = textLeft + widest;
  const textBottom = textTop + lineHeight * lines.length;
  const style = text.backgroundStyle;
  const enabled = style?.enabled ?? Boolean(text.backgroundColor);
  const padding = Math.max(0, style?.padding ?? fontSize * .2);
  const width = Math.max(0, Math.min(project.width * 2, style?.width ?? widest + padding * 2));
  const height = Math.max(0, Math.min(project.height * 2, style?.height ?? lineHeight * lines.length + padding * 2));
  const anchorX = text.align === 'left' ? x : text.align === 'right' ? x : x;
  const textBlockCenterY = firstY + (lines.length - 1) * lineHeight / 2;
  const alignX = style?.alignX ?? text.align;
  const alignY = style?.alignY ?? 'center';
  const bgX = (alignX === 'left' ? anchorX : alignX === 'right' ? anchorX - width : anchorX - width / 2) + (style?.offsetX ?? 0);
  const bgAnchorY = alignY === 'top' ? textTop : alignY === 'bottom' ? textBottom : textBlockCenterY;
  const bgY = (alignY === 'top' ? bgAnchorY : alignY === 'bottom' ? bgAnchorY - height : bgAnchorY - height / 2) + (style?.offsetY ?? 0);
  const background = enabled && text.backgroundColor ? {
    x: bgX,
    y: bgY,
    width,
    height,
    radius: Math.max(0, Math.min(Math.min(width, height) / 2, style?.radius ?? 0)),
    opacity: Math.max(0, Math.min(1, style?.opacity ?? 1)),
    borderColor: style?.borderColor ?? 'transparent',
    borderWidth: Math.max(0, style?.borderWidth ?? 0),
  } : null;

  return {
    fontSize, lineHeight, lines, x, firstY, maxWidth,
    textLeft, textTop, textRight, textBottom, background,
  };
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

export function getTextOverlayBounds(
  context: CanvasRenderingContext2D,
  clip: Clip,
  project: Project,
): Array<{ x: number; y: number }> | null {
  if (!clip.text) return null;
  context.save();
  const layout = getTextLayout(context, clip.text, project);
  context.restore();
  const left = Math.min(layout.textLeft, layout.background?.x ?? layout.textLeft);
  const top = Math.min(layout.textTop, layout.background?.y ?? layout.textTop);
  const right = Math.max(layout.textRight, (layout.background?.x ?? 0) + (layout.background?.width ?? 0));
  const bottom = Math.max(layout.textBottom, (layout.background?.y ?? 0) + (layout.background?.height ?? 0));
  const transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const cos = Math.cos(transform.rotation * Math.PI / 180);
  const sin = Math.sin(transform.rotation * Math.PI / 180);
  const toProject = (x: number, y: number) => ({
    x: project.width / 2 + transform.x + transform.scale * (x * cos - y * sin),
    y: project.height / 2 + transform.y + transform.scale * (x * sin + y * cos),
  });
  return [
    toProject(left, top),
    toProject(right, top),
    toProject(right, bottom),
    toProject(left, bottom),
  ];
}

function drawTextSelection(context: CanvasRenderingContext2D, clip: Clip, project: Project) {
  const corners = getTextOverlayBounds(context, clip, project);
  if (!corners) return;
  context.save();
  context.setLineDash([10, 7]);
  context.strokeStyle = '#f2bf57';
  context.lineWidth = Math.max(2, project.width / 1000);
  context.beginPath();
  context.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.stroke();
  context.setLineDash([]);
  corners.forEach((point) => {
    context.beginPath();
    context.arc(point.x, point.y, Math.max(5, project.width / 250), 0, Math.PI * 2);
    context.fillStyle = '#171a20';
    context.fill();
    context.strokeStyle = '#f2bf57';
    context.lineWidth = Math.max(2, project.width / 1000);
    context.stroke();
  });
  const topCenter = { x: (corners[0].x + corners[1].x) / 2, y: (corners[0].y + corners[1].y) / 2 };
  const center = {
    x: corners.reduce((sum, point) => sum + point.x, 0) / 4,
    y: corners.reduce((sum, point) => sum + point.y, 0) / 4,
  };
  const vx = topCenter.x - center.x;
  const vy = topCenter.y - center.y;
  const length = Math.hypot(vx, vy) || 1;
  const handle = { x: topCenter.x + vx / length * 28, y: topCenter.y + vy / length * 28 };
  context.beginPath();
  context.moveTo(topCenter.x, topCenter.y);
  context.lineTo(handle.x, handle.y);
  context.strokeStyle = '#f2bf57';
  context.lineWidth = Math.max(2, project.width / 1000);
  context.stroke();
  context.beginPath();
  context.arc(handle.x, handle.y, Math.max(5, project.width / 280), 0, Math.PI * 2);
  context.fillStyle = '#f2bf57';
  context.fill();
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
  options: { alpha?: number; sampleTime?: number; offsetX?: number; scaleMultiplier?: number; fade?: boolean } = {},
) {
  const sourceWidth = source instanceof HTMLVideoElement ? source.videoWidth || asset.width || 0 : source.naturalWidth || asset.width || 0;
  const sourceHeight = source instanceof HTMLVideoElement ? source.videoHeight || asset.height || 0 : source.naturalHeight || asset.height || 0;
  if (!sourceWidth || !sourceHeight) return;
  if (source instanceof HTMLImageElement && !source.complete) return;
  if (source instanceof HTMLVideoElement) {
    if (source.readyState < 2) return;
    const sourceTime = options.sampleTime ?? clip.sourceIn + (time - clip.timelineStart) * clip.speed;
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
  context.translate(project.width / 2 + transform.x + (options.offsetX ?? 0), project.height / 2 + transform.y);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.scale * (options.scaleMultiplier ?? 1), transform.scale * (options.scaleMultiplier ?? 1));
  context.globalAlpha *= Math.max(0, Math.min(1, (clip.opacity ?? 1) * (options.fade === false ? 1 : getClipFade(clip, time)) * (options.alpha ?? 1)));
  context.filter = `brightness(${effects.enabled?.brightness === false ? 1 : effects.brightness}) contrast(${effects.enabled?.contrast === false ? 1 : effects.contrast}) saturate(${effects.enabled?.saturation === false ? 1 : effects.saturation}) blur(${effects.enabled?.blur === false ? 0 : effects.blur}px)`;
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
  selectedClipId?: string | null,
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
  });
  const activeTransitions = (project.transitions || []).flatMap((transition) => {
    const fromClip = project.clips.find((clip) => clip.id === transition.fromClipId);
    const toClip = project.clips.find((clip) => clip.id === transition.toClipId);
    if (!fromClip || !toClip || fromClip.assetId === toClip.assetId) return [];
    const fromEnd = fromClip.timelineStart + getClipDuration(fromClip);
    if (Math.abs(fromEnd - toClip.timelineStart) > .05) return [];
    const boundary = (fromEnd + toClip.timelineStart) / 2;
    const duration = Math.max(.1, Math.min(4, transition.duration));
    const start = boundary - duration / 2;
    const end = boundary + duration / 2;
    if (time < start || time > end) return [];
    return [{ transition, fromClip, toClip, boundary, start, end, progress: Math.max(0, Math.min(1, (time - start) / duration)) }];
  });
  const transitionClipIds = new Set(activeTransitions.flatMap(({ fromClip, toClip }) => [fromClip.id, toClip.id]));
  const transitionForClip = new Map(activeTransitions.flatMap((active) => [[active.fromClip.id, active], [active.toClip.id, active]]));
  const renderClips = [...new Map([...activeVisual, ...activeTransitions.flatMap(({ fromClip, toClip }) => [fromClip, toClip])].map((clip) => [clip.id, clip])).values()].sort((a, b) => {
    const orderA = project.tracks.find((track) => track.id === a.trackId)?.order ?? 0;
    const orderB = project.tracks.find((track) => track.id === b.trackId)?.order ?? 0;
    return orderA - orderB || a.timelineStart - b.timelineStart;
  });
  const activeAssetIds = new Set<string>();
  const renderedTransitionIds = new Set<string>();
  for (const clip of renderClips) {
    const activeTransition = transitionForClip.get(clip.id);
    if (activeTransition) {
      const transitionId = activeTransition.transition.id;
      if (renderedTransitionIds.has(transitionId)) continue;
      renderedTransitionIds.add(transitionId);
      const { fromClip, toClip, progress, boundary, transition } = activeTransition;
      const fromAsset = assets.find((asset) => asset.id === fromClip.assetId);
      const toAsset = assets.find((asset) => asset.id === toClip.assetId);
      const fromSource = fromClip.assetId ? mediaByAsset.get(fromClip.assetId) : undefined;
      const toSource = toClip.assetId ? mediaByAsset.get(toClip.assetId) : undefined;
      if (!fromAsset || !toAsset || !fromSource || !toSource) continue;
      const fromSample = Math.min(fromClip.sourceOut, fromClip.sourceIn + Math.max(0, boundary - fromClip.timelineStart) * fromClip.speed);
      const toSample = Math.max(toClip.sourceIn, toClip.sourceIn + Math.max(0, time - boundary) * toClip.speed);
      if (transition.type === 'wipe' || transition.type === 'slide') {
        drawMedia(context, fromClip, fromAsset, fromSource, time, project, playing, { sampleTime: fromSample, fade: false });
        context.save();
        const revealWidth = project.width * progress;
        if (transition.type === 'wipe') {
          context.beginPath();
          context.rect(0, 0, revealWidth, project.height);
          context.clip();
        } else {
          context.beginPath();
          context.rect(0, 0, project.width, project.height);
          context.clip();
        }
        drawMedia(context, toClip, toAsset, toSource, time, project, playing, {
          sampleTime: toSample,
          fade: false,
          offsetX: transition.type === 'slide' ? project.width * (1 - progress) : 0,
        });
        context.restore();
      } else if (transition.type === 'zoom') {
        drawMedia(context, fromClip, fromAsset, fromSource, time, project, playing, { sampleTime: fromSample, alpha: 1 - progress, fade: false });
        drawMedia(context, toClip, toAsset, toSource, time, project, playing, { sampleTime: toSample, alpha: progress, scaleMultiplier: .82 + .18 * progress, fade: false });
      } else {
        drawMedia(context, fromClip, fromAsset, fromSource, time, project, playing, { sampleTime: fromSample, alpha: 1 - progress, fade: false });
        drawMedia(context, toClip, toAsset, toSource, time, project, playing, { sampleTime: toSample, alpha: progress, fade: false });
        if (transition.type === 'fade-through-black') {
          context.save();
          context.globalAlpha = Math.max(0, 1 - Math.abs(progress * 2 - 1));
          context.fillStyle = '#000';
          context.fillRect(0, 0, project.width, project.height);
          context.restore();
        }
      }
      if (fromClip.assetId) activeAssetIds.add(fromClip.assetId);
      if (toClip.assetId) activeAssetIds.add(toClip.assetId);
      continue;
    }
    if (transitionClipIds.has(clip.id)) continue;
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

  if (selectedClipId) {
    const selected = renderClips.find((clip) => clip.id === selectedClipId && clip.text);
    if (selected) drawTextSelection(context, selected, project);
  }

  for (const [assetId, source] of mediaByAsset) {
    if (source instanceof HTMLVideoElement && !activeAssetIds.has(assetId) && !source.paused) source.pause();
  }
  context.restore();
}

export function getAudioFade(clip: Clip, time: number): number {
  return getClipFade(clip, time);
}
