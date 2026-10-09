import './inspector-panel.css';
import type { Clip, ClipEffects, ClipTransform, TextOverlay } from '@/lib/composition';

export type InspectorClip = Clip & {
  transform: ClipTransform;
  effects: ClipEffects;
  opacity: number;
  fadeIn: number;
  fadeOut: number;
};
type ClipPatch = Partial<Clip> & {
  transform?: Partial<ClipTransform>;
  effects?: Partial<ClipEffects>;
  text?: Partial<TextOverlay>;
};

export type InspectorPanelProps = {
  clip: InspectorClip | null;
  assetName?: string;
  assetKind?: 'video' | 'audio' | 'image' | 'text';
  sourceDuration?: number;
  disabled?: boolean;
  onChange: (patch: ClipPatch) => void;
  onRemove: () => void;
  onFit: () => void;
  onFill: () => void;
  onReset: () => void;
};

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${remainder.toFixed(2).padStart(5, '0')}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function kindLabel(kind: InspectorPanelProps['assetKind']): string {
  switch (kind) {
    case 'audio': return 'Audio clip';
    case 'image': return 'Still image';
    case 'text': return 'Text overlay';
    default: return 'Video clip';
  }
}

export default function InspectorPanel({
  clip,
  assetName,
  assetKind = 'video',
  sourceDuration,
  disabled = false,
  onChange,
  onRemove,
  onFit,
  onFill,
  onReset,
}: InspectorPanelProps) {
  if (!clip) {
    return (
      <aside className="cutline-inspector" aria-label="Clip inspector" data-testid="panel-inspector-empty">
        <div className="cutline-inspector__heading">
          <span className="cutline-inspector__eyebrow">CLIP INSPECTOR</span>
          <span className="cutline-inspector__index">—</span>
        </div>
        <div className="cutline-inspector__empty">
          <span className="cutline-inspector__empty-mark" aria-hidden="true">+</span>
          <strong>Nothing selected</strong>
          <p>Select a clip on the timeline to inspect its timing and playback settings.</p>
        </div>
      </aside>
    );
  }

  const safeSourceIn = Math.max(0, clip.sourceIn);
  const sourceMax = Number.isFinite(sourceDuration) && (sourceDuration ?? 0) > 0
    ? sourceDuration as number
    : Math.max(clip.sourceOut, safeSourceIn + 0.01);
  const speed = clamp(clip.speed, 0.1, 4);
  const sourceOut = Math.max(safeSourceIn, clip.sourceOut);
  const clipDuration = Math.max(0, (sourceOut - safeSourceIn) / Math.max(0.1, speed));
  const transform = clip.transform;
  const effects = clip.effects;
  const isText = Boolean(clip.text);

  const updateTime = (key: 'timelineStart' | 'sourceIn' | 'sourceOut', raw: string) => {
    if (raw === '') return;
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    if (key === 'timelineStart') {
      onChange({ timelineStart: clamp(next, 0, 86400) });
    } else if (key === 'sourceIn') {
      onChange({ sourceIn: clamp(next, 0, Math.min(sourceMax, sourceOut)) });
    } else {
      onChange({ sourceOut: clamp(next, safeSourceIn, sourceMax) });
    }
  };

  const timeField = (
    label: string,
    testId: string,
    value: number,
    min: number,
    max: number,
    key: 'timelineStart' | 'sourceIn' | 'sourceOut',
  ) => (
    <label className="cutline-inspector__field" htmlFor={`${testId}-${clip.id}`}>
      <span className="cutline-inspector__field-label">{label}</span>
      <span className="cutline-inspector__input-wrap">
        <input
          id={`${testId}-${clip.id}`}
          type="number"
          min={min}
          max={max}
          step="0.01"
          value={Number.isFinite(value) ? value : 0}
          onChange={(event) => updateTime(key, event.currentTarget.value)}
          aria-label={label}
          disabled={disabled}
          data-testid={testId}
        />
        <span className="cutline-inspector__unit">sec</span>
      </span>
    </label>
  );

  const rangeControl = (
    label: string,
    testId: string,
    value: number,
    min: number,
    max: number,
    step: number,
    onValue: (value: number) => void,
    suffix = '',
  ) => (
    <label className="cutline-inspector__range-field" htmlFor={`${testId}-${clip.id}`}>
      <span className="cutline-inspector__range-heading">
        <span>{label}</span>
        <strong>{value.toFixed(step < 0.1 ? 2 : 1)}{suffix}</strong>
      </span>
      <input
        id={`${testId}-${clip.id}`}
        className="cutline-inspector__range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onValue(Number(event.currentTarget.value))}
        aria-label={label}
        disabled={disabled}
        data-testid={testId}
      />
    </label>
  );

  return (
    <aside className="cutline-inspector" aria-label="Clip inspector" data-testid="panel-inspector">
      <div className="cutline-inspector__heading">
        <span className="cutline-inspector__eyebrow">CLIP INSPECTOR</span>
        <span className="cutline-inspector__index">SELECTED</span>
      </div>

      <div className="cutline-inspector__identity" data-testid={`text-clip-name-${clip.id}`}>
        <span className={`cutline-inspector__type cutline-inspector__type--${assetKind}`} aria-label={kindLabel(assetKind)}>
          {assetKind === 'audio' ? 'AUD' : assetKind === 'image' ? 'IMG' : assetKind === 'text' ? 'TXT' : 'VID'}
        </span>
        <div className="cutline-inspector__identity-copy">
          <strong title={assetName || 'Untitled clip'}>{assetName || 'Untitled clip'}</strong>
          <span>{kindLabel(assetKind)} <i aria-hidden="true">·</i> {clip.id.slice(0, 8)}</span>
        </div>
      </div>

      <section className="cutline-inspector__section" aria-labelledby="inspector-timing-heading">
        <div className="cutline-inspector__section-title">
          <h2 id="inspector-timing-heading">Timing</h2>
          <span className="cutline-inspector__duration" data-testid="text-clip-duration">
            <span className="cutline-inspector__duration-dot" aria-hidden="true" />
            {formatTime(clipDuration)}
          </span>
        </div>
        <div className="cutline-inspector__fields cutline-inspector__fields--single">
          {timeField('Timeline position', 'input-timeline-position', clip.timelineStart, 0, 86400, 'timelineStart')}
        </div>
        <div className="cutline-inspector__fields">
          {timeField('Source in', 'input-source-in', safeSourceIn, 0, sourceMax, 'sourceIn')}
          {timeField('Source out', 'input-source-out', sourceOut, safeSourceIn, sourceMax, 'sourceOut')}
        </div>
      </section>

      <section className="cutline-inspector__section cutline-inspector__section--playback" aria-labelledby="inspector-playback-heading">
        <div className="cutline-inspector__section-title">
          <h2 id="inspector-playback-heading">Playback</h2>
        </div>
        <label className="cutline-inspector__range-field" htmlFor={`input-speed-${clip.id}`}>
          <span className="cutline-inspector__range-heading">
            <span>Speed</span><strong data-testid="text-speed-value">{speed.toFixed(2)}×</strong>
          </span>
          {!isText && <input
            id={`input-speed-${clip.id}`}
            className="cutline-inspector__range"
            type="range"
            min="0.1"
            max="4"
            step="0.05"
            value={speed}
            onChange={(event) => onChange({ speed: Number(event.currentTarget.value) })}
            aria-label="Playback speed"
            disabled={disabled}
            data-testid="slider-playback-speed"
          />}
          {!isText && <span className="cutline-inspector__range-ends"><span>0.1×</span><span>4×</span></span>}
        </label>
        {assetKind !== 'text' && assetKind !== 'image' && <label className="cutline-inspector__range-field" htmlFor={`input-volume-${clip.id}`}>
          <span className="cutline-inspector__range-heading">
            <span>Clip gain</span><strong data-testid="text-volume-value">{Math.round(clamp(clip.volume, 0, 2) * 100)}%</strong>
          </span>
          <input
            id={`input-volume-${clip.id}`}
            className="cutline-inspector__range"
            type="range"
            min="0"
            max="2"
            step="0.01"
            value={clamp(clip.volume, 0, 2)}
            onChange={(event) => onChange({ volume: Number(event.currentTarget.value) })}
            aria-label="Clip gain"
            disabled={disabled}
            data-testid="slider-clip-gain"
          />
          <span className="cutline-inspector__range-ends"><span>Muted</span><span>200%</span></span>
        </label>}
      </section>

      <section className="cutline-inspector__section" aria-labelledby="inspector-transform-heading">
        <div className="cutline-inspector__section-title"><h2 id="inspector-transform-heading">Transform</h2></div>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-transform-x-${clip.id}`}>
            <span className="cutline-inspector__field-label">Position X</span>
            <input id={`input-transform-x-${clip.id}`} className="cutline-inspector__number" type="number" value={transform.x} disabled={disabled} data-testid="input-transform-x" onChange={(event) => onChange({ transform: { x: Number(event.currentTarget.value) || 0 } })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`input-transform-y-${clip.id}`}>
            <span className="cutline-inspector__field-label">Position Y</span>
            <input id={`input-transform-y-${clip.id}`} className="cutline-inspector__number" type="number" value={transform.y} disabled={disabled} data-testid="input-transform-y" onChange={(event) => onChange({ transform: { y: Number(event.currentTarget.value) || 0 } })} />
          </label>
        </div>
        {rangeControl('Scale', 'slider-transform-scale', transform.scale, .1, 4, .01, (value) => onChange({ transform: { scale: value } }), '×')}
        <label className="cutline-inspector__field cutline-inspector__field--spaced" htmlFor={`input-transform-rotation-${clip.id}`}>
          <span className="cutline-inspector__field-label">Rotation</span>
          <span className="cutline-inspector__input-wrap">
            <input id={`input-transform-rotation-${clip.id}`} className="cutline-inspector__number" type="number" min="-360" max="360" step="1" value={transform.rotation} disabled={disabled} data-testid="input-transform-rotation" onChange={(event) => onChange({ transform: { rotation: Number(event.currentTarget.value) || 0 } })} />
            <span className="cutline-inspector__unit">deg</span>
          </span>
        </label>
        <div className="cutline-inspector__section-title cutline-inspector__anchor-title"><h2>Anchor point</h2></div>
        <div className="cutline-inspector__fields">
          {rangeControl('Anchor X', 'slider-anchor-x', transform.anchorX, 0, 1, .01, (value) => onChange({ transform: { anchorX: value } }))}
          {rangeControl('Anchor Y', 'slider-anchor-y', transform.anchorY, 0, 1, .01, (value) => onChange({ transform: { anchorY: value } }))}
        {rangeControl('Opacity', 'slider-clip-opacity', clip.opacity * 100, 0, 100, 1, (value) => onChange({ opacity: value / 100 }), '%')}
        </div>
        {assetKind !== 'text' && <div className="cutline-inspector__actions">
          <button type="button" disabled={disabled} onClick={onFit} data-testid="button-fit-canvas">Fit canvas</button>
          <button type="button" disabled={disabled} onClick={onFill} data-testid="button-fill-canvas">Fill canvas</button>
        </div>}
        <button type="button" className="cutline-inspector__reset" disabled={disabled} onClick={onReset} data-testid="button-reset-transform">Reset transform</button>
      </section>

      {clip.text && <section className="cutline-inspector__section" aria-labelledby="inspector-text-heading">
        <div className="cutline-inspector__section-title"><h2 id="inspector-text-heading">Text &amp; styling</h2></div>
        <label className="cutline-inspector__field" htmlFor={`input-title-content-${clip.id}`}>
          <span className="cutline-inspector__field-label">Content</span>
          <textarea id={`input-title-content-${clip.id}`} className="cutline-inspector__textarea" value={clip.text.content} disabled={disabled} data-testid="input-title-content" onChange={(event) => onChange({ text: { content: event.currentTarget.value } })} />
        </label>
        <label className="cutline-inspector__field cutline-inspector__field--spaced" htmlFor={`input-title-font-${clip.id}`}>
          <span className="cutline-inspector__field-label">Font family</span>
          <input id={`input-title-font-${clip.id}`} className="cutline-inspector__number" type="text" value={clip.text.fontFamily} disabled={disabled} data-testid="input-title-font" onChange={(event) => onChange({ text: { fontFamily: event.currentTarget.value } })} />
        </label>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-size-${clip.id}`}>
            <span className="cutline-inspector__field-label">Font size</span>
            <input id={`input-title-size-${clip.id}`} className="cutline-inspector__number" type="number" min="8" max="500" value={clip.text.fontSize} disabled={disabled} data-testid="input-title-size" onChange={(event) => onChange({ text: { fontSize: clamp(Number(event.currentTarget.value) || 8, 8, 500) } })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`select-title-weight-${clip.id}`}>
            <span className="cutline-inspector__field-label">Weight</span>
            <select id={`select-title-weight-${clip.id}`} className="cutline-inspector__select" value={clip.text.fontWeight} disabled={disabled} data-testid="select-title-weight" onChange={(event) => onChange({ text: { fontWeight: Number(event.currentTarget.value) } })}>
              <option value="400">Regular</option><option value="500">Medium</option><option value="700">Bold</option><option value="900">Heavy</option>
            </select>
          </label>
        </div>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-color-${clip.id}`}>
            <span className="cutline-inspector__field-label">Text color</span>
            <input id={`input-title-color-${clip.id}`} className="cutline-inspector__color" type="color" value={/^#[0-9a-f]{6}$/i.test(clip.text.color) ? clip.text.color : '#ffffff'} disabled={disabled} data-testid="input-title-color" onChange={(event) => onChange({ text: { color: event.currentTarget.value } })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`select-title-align-${clip.id}`}>
            <span className="cutline-inspector__field-label">Alignment</span>
            <select id={`select-title-align-${clip.id}`} className="cutline-inspector__select" value={clip.text.align} disabled={disabled} data-testid="select-title-align" onChange={(event) => onChange({ text: { align: event.currentTarget.value as TextOverlay['align'] } })}>
              <option value="left">Left</option><option value="center">Center</option><option value="right">Right</option>
            </select>
          </label>
        </div>
        <label className="cutline-inspector__field cutline-inspector__field--spaced" htmlFor={`input-title-background-${clip.id}`}>
          <span className="cutline-inspector__field-label">Text background (CSS color)</span>
          <input id={`input-title-background-${clip.id}`} className="cutline-inspector__number" type="text" value={clip.text.backgroundColor} disabled={disabled} data-testid="input-title-background" onChange={(event) => onChange({ text: { backgroundColor: event.currentTarget.value } })} />
        </label>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-outline-${clip.id}`}>
            <span className="cutline-inspector__field-label">Outline color</span>
            <input id={`input-title-outline-${clip.id}`} className="cutline-inspector__number" type="text" value={clip.text.outlineColor} disabled={disabled} data-testid="input-title-outline" onChange={(event) => onChange({ text: { outlineColor: event.currentTarget.value } })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`input-title-outline-width-${clip.id}`}>
            <span className="cutline-inspector__field-label">Outline width</span>
            <input id={`input-title-outline-width-${clip.id}`} className="cutline-inspector__number" type="number" min="0" max="20" value={clip.text.outlineWidth} disabled={disabled} data-testid="input-title-outline-width" onChange={(event) => onChange({ text: { outlineWidth: clamp(Number(event.currentTarget.value) || 0, 0, 20) } })} />
          </label>
        </div>
        <label className="cutline-inspector__check" htmlFor={`check-title-shadow-${clip.id}`}>
          <input id={`check-title-shadow-${clip.id}`} type="checkbox" checked={clip.text.shadow} disabled={disabled} data-testid="check-title-shadow" onChange={(event) => onChange({ text: { shadow: event.currentTarget.checked } })} />
          <span>Text shadow</span>
        </label>
        {rangeControl('Text opacity', 'slider-title-opacity', clip.text.opacity * 100, 0, 100, 1, (value) => onChange({ text: { opacity: value / 100 } }), '%')}
      </section>}

      <section className="cutline-inspector__section" aria-labelledby="inspector-effects-heading">
        <div className="cutline-inspector__section-title"><h2 id="inspector-effects-heading">Effects</h2></div>
        {rangeControl('Brightness', 'slider-effect-brightness', effects.brightness, 0, 2, .05, (value) => onChange({ effects: { brightness: value } }))}
        {rangeControl('Contrast', 'slider-effect-contrast', effects.contrast, 0, 2, .05, (value) => onChange({ effects: { contrast: value } }))}
        {rangeControl('Saturation', 'slider-effect-saturation', effects.saturation, 0, 2, .05, (value) => onChange({ effects: { saturation: value } }))}
        {rangeControl('Blur', 'slider-effect-blur', effects.blur, 0, 20, .25, (value) => onChange({ effects: { blur: value } }), 'px')}
      </section>

      <section className="cutline-inspector__section" aria-labelledby="inspector-fade-heading">
        <div className="cutline-inspector__section-title"><h2 id="inspector-fade-heading">Fades</h2></div>
        {rangeControl('Fade in', 'slider-fade-in', clip.fadeIn, 0, Math.min(5, clipDuration / 2), .05, (value) => onChange({ fadeIn: value }), 's')}
        {rangeControl('Fade out', 'slider-fade-out', clip.fadeOut, 0, Math.min(5, clipDuration / 2), .05, (value) => onChange({ fadeOut: value }), 's')}
      </section>

      <div className="cutline-inspector__footer">
        <span>{disabled ? 'This track is locked' : 'Changes apply to this clip'}</span>
        <button
          className="cutline-inspector__remove"
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove ${assetName || 'clip'} from timeline`}
          data-testid="button-remove-clip"
        >
          Remove clip <span aria-hidden="true">⌫</span>
        </button>
      </div>
    </aside>
  );
}
