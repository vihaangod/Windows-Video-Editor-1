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
  exposure: number;
  temperature: number;
  tint: number;
  fade: number;
  vignette: number;
  filterPreset?: string;
  filterIntensity?: number;
  filterStack?: ClipFilter[];
  enabled?: Partial<Record<'brightness' | 'contrast' | 'saturation' | 'blur', boolean>>;
};

export type ClipFilter = {
  presetId: string;
  intensity: number;
  enabled: boolean;
};

export type MarkupTool = 'pen' | 'highlighter' | 'arrow' | 'line' | 'rectangle' | 'ellipse' | 'text';
export type MarkupPoint = { x: number; y: number };
export type MarkupDrawing = {
  id: string;
  tool: MarkupTool;
  points: MarkupPoint[];
  start: number;
  end: number;
  color: string;
  size: number;
  opacity: number;
  lineStyle: 'solid' | 'dashed' | 'dotted';
  fillColor?: string;
  fillOpacity?: number;
  content?: string;
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

export type TextAnimation = 'none' | 'typing' | 'word-reveal' | 'pop-in' | 'fade-in' | 'slide-up';

export type TextOverlay = {
  templateId: string;
  templateName: string;
  content: string;
  fontFamily: string;
  fontStyle?: 'normal' | 'italic';
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
  animation?: TextAnimation;
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
  muted?: boolean;
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
  markups?: MarkupDrawing[];
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

export type ProjectRenderIndex = {
  assetsById: ReadonlyMap<string, Asset>;
  tracksById: ReadonlyMap<string, Track>;
  clipsById: ReadonlyMap<string, Clip>;
};

export function createProjectRenderIndex(project: Project, assets: Asset[]): ProjectRenderIndex {
  return {
    assetsById: new Map(assets.map((asset) => [asset.id, asset])),
    tracksById: new Map(project.tracks.map((track) => [track.id, track])),
    clipsById: new Map(project.clips.map((clip) => [clip.id, clip])),
  };
}

export function getPreviewCanvasSize(width: number, height: number, maxDimension = 1920) {
  const safeWidth = Math.max(1, Math.round(width));
  const safeHeight = Math.max(1, Math.round(height));
  const scale = Math.min(1, maxDimension / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(1, Math.round(safeWidth * scale)),
    height: Math.max(1, Math.round(safeHeight * scale)),
  };
}

export function shouldDeferPreviewVideoFrame(readyState: number, seeking: boolean, currentTime: number, targetTime: number) {
  return readyState < 2 || seeking || !Number.isFinite(currentTime) || !Number.isFinite(targetTime) ||
    Math.abs(currentTime - targetTime) > .32;
}

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
  exposure: 0,
  temperature: 0,
  tint: 0,
  fade: 0,
  vignette: 0,
  enabled: { brightness: true, contrast: true, saturation: true, blur: true },
};

export const FILTER_PRESETS = [
  { id: 'original', name: 'Original', description: 'No filter; keep the source colors.', values: { brightness: 1, contrast: 1, saturation: 1, temperature: 0, tint: 0, fade: 0, vignette: 0 } },
  { id: 'vivid', name: 'Vivid', description: 'Punchier color and contrast for gameplay.', values: { brightness: 1.04, contrast: 1.2, saturation: 1.38, temperature: 0, tint: 0, fade: 0, vignette: 0 } },
  { id: 'cinematic', name: 'Cinematic', description: 'Cool shadows, softer color, and a subtle vignette.', values: { brightness: .97, contrast: 1.18, saturation: .84, temperature: -7, tint: 3, fade: .05, vignette: .24 } },
  { id: 'cool-blue', name: 'Cool Blue', description: 'Shift the image toward a crisp blue tone.', values: { brightness: 1, contrast: 1.08, saturation: 1.08, temperature: -36, tint: -3, fade: 0, vignette: 0 } },
  { id: 'warm', name: 'Warm', description: 'Add a golden warmth to the image.', values: { brightness: 1.03, contrast: 1.04, saturation: 1.12, temperature: 34, tint: 2, fade: 0, vignette: 0 } },
  { id: 'dream', name: 'Dream', description: 'Lifted highlights with soft contrast and color.', values: { brightness: 1.12, contrast: .88, saturation: 1.06, temperature: 12, tint: 5, fade: .16, vignette: .08 } },
  { id: 'pine', name: 'Pine', description: 'Cool, forest-toned color with deeper contrast.', values: { brightness: .98, contrast: 1.16, saturation: .9, temperature: -12, tint: -8, fade: 0, vignette: .12 } },
  { id: 'vintage', name: 'Vintage', description: 'Muted color, lifted blacks, and a warm finish.', values: { brightness: 1.04, contrast: .86, saturation: .72, temperature: 20, tint: 7, fade: .2, vignette: .18 } },
  { id: 'noir', name: 'Noir', description: 'Monochrome with stronger contrast and edge falloff.', values: { brightness: 1.02, contrast: 1.32, saturation: 0, temperature: 0, tint: 0, fade: 0, vignette: .28 } },
  { id: 'fade', name: 'Fade', description: 'Lower contrast and gently lift dark tones.', values: { brightness: 1.06, contrast: .82, saturation: .88, temperature: 0, tint: 0, fade: .28, vignette: 0 } },
  { id: 'bleach-bypass', name: 'Bleach Bypass', description: 'Hard contrast and restrained color for a gritty film finish.', values: { brightness: .98, contrast: 1.34, saturation: .42, temperature: -4, tint: 2, fade: .06, vignette: .12 } },
  { id: 'soft-pastel', name: 'Soft Pastel', description: 'Gentle highlights, softer contrast, and light pastel color.', values: { brightness: 1.1, contrast: .87, saturation: .82, temperature: 9, tint: 6, fade: .17, vignette: .02 } },
  { id: 'golden-hour', name: 'Golden Hour', description: 'Warm, bright highlights with a saturated late-day glow.', values: { brightness: 1.08, contrast: 1.06, saturation: 1.24, temperature: 44, tint: 7, fade: .03, vignette: .04 } },
  { id: 'sepia-print', name: 'Sepia Print', description: 'Low-color warm brown tones with a subtle printed-film fade.', values: { brightness: 1.03, contrast: .96, saturation: .38, temperature: 38, tint: 9, fade: .13, vignette: .06 } },
  { id: 'neon-night', name: 'Neon Night', description: 'Deep, cool shadows and vivid color for nighttime scenes.', values: { brightness: .88, contrast: 1.3, saturation: 1.34, temperature: -28, tint: 12, fade: 0, vignette: .26 } },
  { id: 'crisp-detail', name: 'Crisp Detail', description: 'Clean, high contrast with natural color and minimal tint.', values: { brightness: 1, contrast: 1.3, saturation: 1.02, temperature: 0, tint: 0, fade: 0, vignette: .04 } },
  { id: 'teal-amber', name: 'Teal & Amber', description: 'Cool shadows and warm highlights for a balanced cinematic grade.', values: { brightness: 1, contrast: 1.2, saturation: 1.12, temperature: 15, tint: -12, fade: .02, vignette: .1 } },
  { id: 'high-key-airy', name: 'High Key Airy', description: 'Bright, low-contrast color with a clean, open look.', values: { brightness: 1.2, contrast: .84, saturation: .9, temperature: 5, tint: 1, fade: .12, vignette: 0 } },
  { id: 'magenta-pop', name: 'Magenta Pop', description: 'A vivid pink-violet cast with rich color and deep edges.', values: { brightness: 1.02, contrast: 1.14, saturation: 1.32, temperature: -8, tint: 34, fade: 0, vignette: .1 } },
  { id: 'soft-film-print', name: 'Soft Film Print', description: 'Warm, restrained color with lifted blacks and gentle contrast.', values: { brightness: 1.06, contrast: .9, saturation: .76, temperature: 24, tint: 4, fade: .2, vignette: .05 } },
  { id: 'arctic-silver', name: 'Arctic Silver', description: 'Cool, nearly monochrome tones with clean contrast.', values: { brightness: 1.04, contrast: 1.12, saturation: .18, temperature: -38, tint: -4, fade: .04, vignette: .08 } },
  { id: 'shadow-crush', name: 'Shadow Crush', description: 'Dark, high-contrast color with pronounced edge falloff.', values: { brightness: .78, contrast: 1.48, saturation: 1.16, temperature: -5, tint: 0, fade: 0, vignette: .34 } },
] as const;

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function interpolate(from: number, to: number, amount: number) {
  return from + (to - from) * amount;
}

function getRenderedEffects(clip: Clip) {
  const base = { ...DEFAULT_EFFECTS, ...clip.effects };
  const stack = Array.isArray(clip.effects?.filterStack)
    ? clip.effects.filterStack.filter((filter) => filter.enabled)
    : base.filterPreset
      ? [{ presetId: base.filterPreset, intensity: base.filterIntensity ?? 100, enabled: true }]
      : [];
  const filtered = stack.reduce((result, filter) => {
    const preset = FILTER_PRESETS.find((item) => item.id === filter.presetId);
    if (!preset || preset.id === 'original') return result;
    const amount = clamp01(filter.intensity / 100);
    return {
      brightness: result.brightness * interpolate(1, preset.values.brightness, amount),
      contrast: result.contrast * interpolate(1, preset.values.contrast, amount),
      saturation: result.saturation * interpolate(1, preset.values.saturation, amount),
      temperature: result.temperature + preset.values.temperature * amount,
      tint: result.tint + preset.values.tint * amount,
      fade: 1 - (1 - result.fade) * (1 - preset.values.fade * amount),
      vignette: 1 - (1 - result.vignette) * (1 - preset.values.vignette * amount),
    };
  }, { brightness: 1, contrast: 1, saturation: 1, temperature: 0, tint: 0, fade: 0, vignette: 0 });
  return {
    brightness: (base.enabled?.brightness === false ? 1 : base.brightness) *
      filtered.brightness * 2 ** Math.max(-4, Math.min(4, base.exposure)),
    contrast: (base.enabled?.contrast === false ? 1 : base.contrast) * filtered.contrast *
      Math.max(.05, 1 - Math.max(0, base.fade) * .25),
    saturation: (base.enabled?.saturation === false ? 1 : base.saturation) * filtered.saturation,
    blur: base.enabled?.blur === false ? 0 : base.blur,
    temperature: Math.max(-100, Math.min(100, base.temperature + filtered.temperature)),
    tint: Math.max(-100, Math.min(100, base.tint + filtered.tint)),
    fade: clamp01(1 - (1 - clamp01(base.fade)) * (1 - filtered.fade)),
    vignette: clamp01(1 - (1 - clamp01(base.vignette)) * (1 - filtered.vignette)),
  };
}

function drawColorOverlays(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  effects: ReturnType<typeof getRenderedEffects>,
) {
  if (effects.temperature) {
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = Math.min(.24, Math.abs(effects.temperature) / 500);
    context.fillStyle = effects.temperature > 0 ? '#ff923f' : '#398de0';
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
  }
  if (effects.tint) {
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.globalAlpha = Math.min(.2, Math.abs(effects.tint) / 500);
    context.fillStyle = effects.tint > 0 ? '#d040b7' : '#48bf82';
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
  }
  if (effects.fade > 0) {
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = effects.fade * .18;
    context.fillStyle = '#fff';
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
  }
  if (effects.vignette > 0) {
    context.save();
    const radius = Math.hypot(width, height) * .62;
    const gradient = context.createRadialGradient(0, 0, radius * .2, 0, 0, radius);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(.58, `rgba(0,0,0,${effects.vignette * .16})`);
    gradient.addColorStop(1, `rgba(0,0,0,${effects.vignette * .76})`);
    context.fillStyle = gradient;
    context.fillRect(-width / 2, -height / 2, width, height);
    context.restore();
  }
}

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
  const effects = getRenderedEffects(clip);
  const elapsed = Math.max(0, time - clip.timelineStart);
  const animation = text.animation ?? 'none';
  const animationProgress = clamp01(elapsed / .58);
  const easedProgress = 1 - (1 - animationProgress) ** 3;
  let animationOpacity = 1;
  let animationScale = 1;
  let animationOffsetY = 0;
  let revealCharacters: number | null = null;
  let revealWords: number | null = null;
  if (animation === 'fade-in') animationOpacity = .08 + .92 * easedProgress;
  if (animation === 'pop-in') {
    animationOpacity = .18 + .82 * easedProgress;
    animationScale = .72 + .28 * easedProgress;
  }
  if (animation === 'slide-up') {
    animationOpacity = .08 + .92 * easedProgress;
    animationOffsetY = (1 - easedProgress) * 38;
  }
  if (animation === 'typing') {
    const characterCount = Math.max(1, layout.lines.reduce((count, line) => count + Array.from(line).length, 0));
    const revealDuration = Math.min(2.8, Math.max(.75, characterCount * .045));
    revealCharacters = Math.max(1, Math.ceil(characterCount * clamp01(elapsed / revealDuration)));
  }
  if (animation === 'word-reveal') {
    const wordCount = Math.max(1, layout.lines.reduce((count, line) => count + (line.match(/\S+/g)?.length ?? 0), 0));
    const revealDuration = Math.min(3, Math.max(.8, wordCount * .28));
    revealWords = Math.max(1, Math.ceil(wordCount * clamp01(elapsed / revealDuration)));
  }
  context.save();
  context.translate(project.width / 2 + transform.x, project.height / 2 + transform.y + animationOffsetY);
  context.rotate(transform.rotation * Math.PI / 180);
  context.scale(transform.scale * animationScale, transform.scale * animationScale);
  context.globalAlpha = Math.max(0, Math.min(1, (clip.opacity ?? 1) * text.opacity * animationOpacity * getClipFade(clip, time)));
  context.filter = `brightness(${effects.brightness}) contrast(${effects.contrast}) saturate(${effects.saturation}) blur(${effects.blur}px)`;

  const { fontSize, lineHeight, lines, x, firstY, background } = layout;
  context.font = `${text.fontStyle === 'italic' ? 'italic ' : ''}${text.fontWeight} ${fontSize}px ${text.fontFamily}`;
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
  const isRevealAnimation = revealCharacters !== null || revealWords !== null;
  context.textAlign = isRevealAnimation ? 'left' : text.align;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  if (text.shadow) {
    context.shadowColor = 'rgba(0,0,0,.8)';
    context.shadowBlur = fontSize * .22;
    context.shadowOffsetX = 0;
    context.shadowOffsetY = fontSize * .08;
  }
  let charactersRemaining = revealCharacters;
  let wordsRemaining = revealWords;
  lines.forEach((item, index) => {
    const y = firstY + index * lineHeight;
    let renderedText = item;
    let drawX = x;
    if (charactersRemaining !== null) {
      const fullLineCharacters = Array.from(item);
      const visibleCount = Math.min(fullLineCharacters.length, charactersRemaining);
      charactersRemaining = Math.max(0, charactersRemaining - fullLineCharacters.length);
      renderedText = fullLineCharacters.slice(0, visibleCount).join('');
      const fullLineWidth = context.measureText(item).width;
      drawX = text.align === 'center' ? x - fullLineWidth / 2 : text.align === 'right' ? x - fullLineWidth : x;
    } else if (wordsRemaining !== null) {
      const lineWords = Array.from(item.matchAll(/\S+/g));
      const visibleCount = Math.min(lineWords.length, wordsRemaining);
      wordsRemaining = Math.max(0, wordsRemaining - lineWords.length);
      const visibleEnd = visibleCount > 0
        ? (lineWords[visibleCount - 1].index ?? 0) + lineWords[visibleCount - 1][0].length
        : 0;
      renderedText = item.slice(0, visibleEnd);
      const fullLineWidth = context.measureText(item).width;
      drawX = text.align === 'center' ? x - fullLineWidth / 2 : text.align === 'right' ? x - fullLineWidth : x;
    }
    if (text.outlineWidth > 0) {
      context.strokeStyle = text.outlineColor;
      context.lineWidth = text.outlineWidth;
      context.strokeText(renderedText, drawX, y, layout.maxWidth);
    }
    context.fillStyle = text.color;
    context.fillText(renderedText, drawX, y, layout.maxWidth);
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
  context.font = `${text.fontStyle === 'italic' ? 'italic ' : ''}${text.fontWeight} ${fontSize}px ${text.fontFamily}`;
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
  const effects = getRenderedEffects(clip);
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
  context.filter = `brightness(${effects.brightness}) contrast(${effects.contrast}) saturate(${effects.saturation}) blur(${effects.blur}px)`;
  const left = -transform.anchorX * drawWidth;
  const top = -transform.anchorY * drawHeight;
  context.beginPath();
  context.rect(left, top, drawWidth, drawHeight);
  context.clip();
  context.drawImage(source, left, top, drawWidth, drawHeight);
  context.filter = 'none';
  context.translate(left + drawWidth / 2, top + drawHeight / 2);
  drawColorOverlays(context, drawWidth, drawHeight, effects);
  context.restore();
}

function drawMarkup(context: CanvasRenderingContext2D, drawing: MarkupDrawing) {
  if (!drawing.points.length) return;
  const first = drawing.points[0];
  const last = drawing.points[drawing.points.length - 1];
  context.save();
  context.globalAlpha = clamp01(drawing.opacity);
  context.strokeStyle = drawing.color;
  context.fillStyle = drawing.fillColor || drawing.color;
  context.lineWidth = Math.max(1, drawing.size);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.setLineDash(drawing.lineStyle === 'dashed' ? [drawing.size * 2.5, drawing.size * 1.5] : drawing.lineStyle === 'dotted' ? [drawing.size * .25, drawing.size * 1.5] : []);
  if (drawing.tool === 'highlighter') {
    context.globalAlpha *= .34;
    context.lineWidth *= 3.2;
    context.globalCompositeOperation = 'multiply';
  }
  if (drawing.tool === 'text') {
    context.font = `700 ${Math.max(12, drawing.size * 4)}px "Segoe UI", sans-serif`;
    context.shadowColor = 'rgba(0,0,0,.8)';
    context.shadowBlur = Math.max(2, drawing.size * .35);
    context.fillText(drawing.content || 'Note', first.x, first.y, 900);
    context.restore();
    return;
  }
  context.beginPath();
  if (drawing.tool === 'pen' || drawing.tool === 'highlighter') {
    context.moveTo(first.x, first.y);
    drawing.points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.stroke();
    context.restore();
    return;
  }
  if (drawing.tool === 'line' || drawing.tool === 'arrow') {
    context.moveTo(first.x, first.y);
    context.lineTo(last.x, last.y);
    context.stroke();
    if (drawing.tool === 'arrow') {
      const angle = Math.atan2(last.y - first.y, last.x - first.x);
      const head = Math.max(12, drawing.size * 3.5);
      context.beginPath();
      context.moveTo(last.x, last.y);
      context.lineTo(last.x - head * Math.cos(angle - Math.PI / 6), last.y - head * Math.sin(angle - Math.PI / 6));
      context.moveTo(last.x, last.y);
      context.lineTo(last.x - head * Math.cos(angle + Math.PI / 6), last.y - head * Math.sin(angle + Math.PI / 6));
      context.stroke();
    }
    context.restore();
    return;
  }
  const x = Math.min(first.x, last.x);
  const y = Math.min(first.y, last.y);
  const width = Math.abs(last.x - first.x);
  const height = Math.abs(last.y - first.y);
  if (drawing.tool === 'rectangle') {
    if (drawing.fillColor && (drawing.fillOpacity ?? 0) > 0) {
      context.save();
      context.globalAlpha *= clamp01(drawing.fillOpacity ?? 0);
      context.fillRect(x, y, width, height);
      context.restore();
    }
    context.strokeRect(x, y, width, height);
  } else if (drawing.tool === 'ellipse') {
    context.ellipse(x + width / 2, y + height / 2, Math.max(.5, width / 2), Math.max(.5, height / 2), 0, 0, Math.PI * 2);
    if (drawing.fillColor && (drawing.fillOpacity ?? 0) > 0) {
      context.save();
      context.globalAlpha *= clamp01(drawing.fillOpacity ?? 0);
      context.fill();
      context.restore();
    }
    context.stroke();
  }
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
  markupDraft?: MarkupDrawing | null,
  renderIndex?: ProjectRenderIndex,
  options: { layer?: 'all' | 'base' | 'overlay' } = {},
) {
  const layer = options.layer ?? 'all';
  const scaleX = context.canvas.width / Math.max(1, project.width);
  const scaleY = context.canvas.height / Math.max(1, project.height);
  const activeVisual = project.clips.filter((clip) => {
    if (layer === 'base' && clip.text) return false;
    if (layer === 'overlay' && !clip.text) return false;
    const track = renderIndex
      ? renderIndex.tracksById.get(clip.trackId)
      : project.tracks.find((item) => item.id === clip.trackId);
    if (!track || (track.kind !== 'video' && track.kind !== 'text')) return false;
    return track.visible !== false && time >= clip.timelineStart && time < clip.timelineStart + getClipDuration(clip);
  });

  // Keep the last complete preview frame visible while a new source frame is decoding.
  if (layer === 'base') {
    for (const clip of activeVisual) {
      const source = clip.assetId ? mediaByAsset.get(clip.assetId) : undefined;
      if (typeof HTMLVideoElement === 'undefined' || !(source instanceof HTMLVideoElement)) continue;
      const sourceTime = clip.sourceIn + (time - clip.timelineStart) * clip.speed;
      if (shouldDeferPreviewVideoFrame(source.readyState, source.seeking, source.currentTime, sourceTime)) {
        if (source.readyState >= 2 && !source.seeking && Number.isFinite(sourceTime)) {
          try { source.currentTime = Math.max(0, sourceTime); } catch { /* metadata may still be loading */ }
        }
        return;
      }
    }
  }

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.save();
  context.filter = 'none';
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  if (layer === 'overlay') {
    context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  }
  context.setTransform(scaleX, 0, 0, scaleY, 0, 0);
  if (layer !== 'overlay') {
    context.fillStyle = '#101216';
    context.fillRect(0, 0, project.width, project.height);
  }

  const activeTransitions = (layer === 'overlay' ? [] : project.transitions || []).flatMap((transition) => {
    const fromClip = renderIndex
      ? renderIndex.clipsById.get(transition.fromClipId)
      : project.clips.find((clip) => clip.id === transition.fromClipId);
    const toClip = renderIndex
      ? renderIndex.clipsById.get(transition.toClipId)
      : project.clips.find((clip) => clip.id === transition.toClipId);
    if (!fromClip || !toClip) return [];
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
    if (Boolean(a.text) !== Boolean(b.text)) return a.text ? 1 : -1;
    const orderA = (renderIndex
      ? renderIndex.tracksById.get(a.trackId)
      : project.tracks.find((track) => track.id === a.trackId))?.order ?? 0;
    const orderB = (renderIndex
      ? renderIndex.tracksById.get(b.trackId)
      : project.tracks.find((track) => track.id === b.trackId))?.order ?? 0;
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
       const fromAsset = renderIndex
         ? renderIndex.assetsById.get(fromClip.assetId || '')
         : assets.find((asset) => asset.id === fromClip.assetId);
       const toAsset = renderIndex
         ? renderIndex.assetsById.get(toClip.assetId || '')
         : assets.find((asset) => asset.id === toClip.assetId);
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
      if (layer !== 'base') drawText(context, clip, time, project);
      continue;
    }
    if (layer === 'overlay') continue;
    if (!clip.assetId) continue;
    activeAssetIds.add(clip.assetId);
    const asset = renderIndex
      ? renderIndex.assetsById.get(clip.assetId)
      : assets.find((item) => item.id === clip.assetId);
    const source = mediaByAsset.get(clip.assetId);
    if (asset && source) drawMedia(context, clip, asset, source, time, project, playing);
  }

  if (layer !== 'base') {
    [...(project.markups || []), ...(markupDraft ? [markupDraft] : [])]
      .filter((drawing) => time >= drawing.start && time < drawing.end)
      .forEach((drawing) => drawMarkup(context, drawing));
  }

  if (layer !== 'base' && selectedClipId) {
    const selected = renderClips.find((clip) => clip.id === selectedClipId && clip.text);
    if (selected) drawTextSelection(context, selected, project);
  }

  if (layer !== 'overlay') {
    for (const [assetId, source] of mediaByAsset) {
      if (source instanceof HTMLVideoElement && !activeAssetIds.has(assetId) && !source.paused) source.pause();
    }
  }
  context.restore();
}

export function getAudioFade(clip: Clip, time: number): number {
  return getClipFade(clip, time);
}
