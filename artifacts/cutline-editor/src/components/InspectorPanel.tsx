import './inspector-panel.css';
import CutlineSelect from '@/components/CutlineSelect';
import CutlineColorPicker from '@/components/CutlineColorPicker';
import { DEFAULT_EFFECTS, DEFAULT_TRANSFORM, FILTER_PRESETS, type Clip, type ClipEffects, type ClipTransform, type TextBackgroundStyle, type TextOverlay, type TimelineFilterEffect } from '@/lib/composition';

type ClipPatch = Omit<Partial<Clip>, 'transform' | 'effects' | 'text' | 'filterEffect'> & {
  transform?: Partial<ClipTransform>;
  effects?: Partial<ClipEffects>;
  text?: Partial<TextOverlay>;
  filterEffect?: Partial<TimelineFilterEffect>;
};

export type InspectorPanelProps = {
  clip: Clip | null;
  assetName?: string;
  assetKind?: 'video' | 'audio' | 'image' | 'text' | 'effect';
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
    case 'effect': return 'Timeline filter';
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
  const transform = { ...DEFAULT_TRANSFORM, ...clip.transform };
  const effects = { ...DEFAULT_EFFECTS, ...clip.effects };
  const opacity = clip.opacity ?? 1;
  const fadeIn = clip.fadeIn ?? 0;
  const fadeOut = clip.fadeOut ?? 0;
  const isText = Boolean(clip.text);
  const backgroundStyle: TextBackgroundStyle = clip.text?.backgroundStyle || {};

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
  const updateBackground = (patch: Partial<TextBackgroundStyle>) => {
    onChange({ text: { backgroundStyle: { ...backgroundStyle, ...patch } } });
  };
  const effectToggle = (
    label: string,
    key: 'brightness' | 'contrast' | 'saturation' | 'blur',
  ) => (
    <label className="cutline-inspector__effect-toggle" htmlFor={`check-effect-${key}-${clip.id}`}>
      <input
        id={`check-effect-${key}-${clip.id}`}
        type="checkbox"
        checked={effects.enabled?.[key] !== false}
        disabled={disabled}
        onChange={(event) => onChange({ effects: { enabled: { [key]: event.currentTarget.checked } } })}
        aria-label={`${label} enabled`}
      />
      <span>On</span>
    </label>
  );

  if (clip.filterEffect) {
    const filterName = FILTER_PRESETS.find((preset) => preset.id === clip.filterEffect?.presetId)?.name || clip.filterEffect.presetId;
    const effectDuration = Math.max(0.08, clipDuration);
    return (
      <aside className="cutline-inspector" aria-label="Filter inspector" data-testid="panel-inspector">
        <div className="cutline-inspector__heading">
          <span className="cutline-inspector__eyebrow">FILTER INSPECTOR</span>
          <span className="cutline-inspector__index">EFFECTS TRACK</span>
        </div>
        <div className="cutline-inspector__identity" data-testid={`text-clip-name-${clip.id}`}>
          <span className="cutline-inspector__type cutline-inspector__type--effect" aria-label="Timeline filter">FX</span>
          <div className="cutline-inspector__identity-copy">
            <strong title={filterName}>{filterName}</strong>
            <span>Timed filter <i aria-hidden="true">·</i> {clip.id.slice(0, 8)}</span>
          </div>
        </div>
        <section className="cutline-inspector__section" aria-labelledby="inspector-filter-timing-heading">
          <div className="cutline-inspector__section-title">
            <h2 id="inspector-filter-timing-heading">Timing</h2>
            <span className="cutline-inspector__duration" data-testid="text-clip-duration">
              <span className="cutline-inspector__duration-dot" aria-hidden="true" />
              {formatTime(effectDuration)}
            </span>
          </div>
          <div className="cutline-inspector__fields cutline-inspector__fields--single">
            <label className="cutline-inspector__field" htmlFor={`input-filter-position-${clip.id}`}>
              <span className="cutline-inspector__field-label">Timeline position</span>
              <span className="cutline-inspector__input-wrap">
                <input id={`input-filter-position-${clip.id}`} type="number" min="0" max="86400" step=".01" value={clip.timelineStart} disabled={disabled} onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isFinite(value)) onChange({ timelineStart: clamp(value, 0, 86400) });
                }} aria-label="Timeline position" data-testid="input-timeline-position" />
                <span className="cutline-inspector__unit">sec</span>
              </span>
            </label>
            <label className="cutline-inspector__field" htmlFor={`input-filter-duration-${clip.id}`}>
              <span className="cutline-inspector__field-label">Effect duration</span>
              <span className="cutline-inspector__input-wrap">
                <input id={`input-filter-duration-${clip.id}`} type="number" min=".08" max="86400" step=".01" value={effectDuration} disabled={disabled} onChange={(event) => {
                  const value = Number(event.currentTarget.value);
                  if (Number.isFinite(value)) onChange({ sourceIn: 0, sourceOut: clamp(value, .08, 86400), speed: 1 });
                }} aria-label="Effect duration" data-testid="input-filter-duration" />
                <span className="cutline-inspector__unit">sec</span>
              </span>
            </label>
          </div>
          {rangeControl('Strength', 'slider-filter-effect-intensity', clip.filterEffect.intensity, 0, 100, 1,
            (intensity) => onChange({ filterEffect: { intensity } }), '%')}
        </section>
        <footer className="cutline-inspector__footer">
          <span>Only affects the linked video clip during this timeline range.</span>
          <button type="button" className="cutline-inspector__remove" onClick={onRemove} disabled={disabled} data-testid="button-remove-filter-clip">
            Remove filter clip <span aria-hidden="true">×</span>
          </button>
        </footer>
      </aside>
    );
  }

  return (
    <aside className="cutline-inspector" aria-label="Clip inspector" data-testid="panel-inspector">
      <div className="cutline-inspector__heading">
        <span className="cutline-inspector__eyebrow">CLIP INSPECTOR</span>
        <span className="cutline-inspector__index">SELECTED</span>
      </div>

      <div className="cutline-inspector__identity" data-testid={`text-clip-name-${clip.id}`}>
        <span className={`cutline-inspector__type cutline-inspector__type--${assetKind}`} aria-label={kindLabel(assetKind)}>
          {assetKind === 'audio' ? 'AUD' : assetKind === 'image' ? 'IMG' : assetKind === 'text' ? 'TXT' : assetKind === 'effect' ? 'FX' : 'VID'}
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
        {(assetKind === 'audio' || assetKind === 'video') && <label className="cutline-inspector__check">
          <input
            type="checkbox"
            checked={Boolean(clip.muted)}
            disabled={disabled}
            onChange={(event) => onChange({ muted: event.currentTarget.checked })}
            data-testid="check-clip-muted"
          />
          <span>Mute this clip's audio</span>
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
        {rangeControl('Opacity', 'slider-clip-opacity', opacity * 100, 0, 100, 1, (value) => onChange({ opacity: value / 100 }), '%')}
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
        <label className="cutline-inspector__field cutline-inspector__field--spaced" htmlFor={`select-title-animation-${clip.id}`}>
          <span className="cutline-inspector__field-label">Text animation</span>
          <CutlineSelect
            id={`select-title-animation-${clip.id}`}
            className="cutline-inspector__select"
            value={clip.text.animation ?? 'none'}
            options={[
              { value: 'none', label: 'None' },
              { value: 'fade-in', label: 'Fade in' },
              { value: 'slide-up', label: 'Slide up' },
              { value: 'pop-in', label: 'Pop in' },
              { value: 'typing', label: 'Typewriter' },
              { value: 'word-reveal', label: 'Word by word' },
            ]}
            disabled={disabled}
            data-testid="select-title-animation"
            onValueChange={(value) => onChange({ text: { animation: value as TextOverlay['animation'] } })}
          />
        </label>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-size-${clip.id}`}>
            <span className="cutline-inspector__field-label">Font size</span>
            <input id={`input-title-size-${clip.id}`} className="cutline-inspector__number" type="number" min="8" max="500" value={clip.text.fontSize} disabled={disabled} data-testid="input-title-size" onChange={(event) => onChange({ text: { fontSize: clamp(Number(event.currentTarget.value) || 8, 8, 500) } })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`select-title-weight-${clip.id}`}>
            <span className="cutline-inspector__field-label">Weight</span>
            <CutlineSelect
              id={`select-title-weight-${clip.id}`}
              className="cutline-inspector__select"
              value={String(clip.text.fontWeight)}
              options={[
                { value: '400', label: 'Regular' },
                { value: '500', label: 'Medium' },
                { value: '700', label: 'Bold' },
                { value: '900', label: 'Heavy' },
              ]}
              disabled={disabled}
              data-testid="select-title-weight"
              onValueChange={(value) => onChange({ text: { fontWeight: Number(value) } })}
            />
          </label>
        </div>
        <div className="cutline-inspector__fields">
          <div className="cutline-inspector__field">
            <span className="cutline-inspector__field-label">Text color</span>
            <CutlineColorPicker
              className="cutline-inspector__color"
              label="Text color"
              value={/^#[0-9a-f]{6}$/i.test(clip.text.color) ? clip.text.color : '#ffffff'}
              disabled={disabled}
              testId="input-title-color"
              onChange={(color) => onChange({ text: { color } })}
            />
          </div>
          <label className="cutline-inspector__field" htmlFor={`select-title-align-${clip.id}`}>
            <span className="cutline-inspector__field-label">Alignment</span>
            <CutlineSelect
              id={`select-title-align-${clip.id}`}
              className="cutline-inspector__select"
              value={clip.text.align}
              options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
              disabled={disabled}
              data-testid="select-title-align"
              onValueChange={(value) => onChange({ text: { align: value as TextOverlay['align'] } })}
            />
          </label>
        </div>
        <label className="cutline-inspector__field cutline-inspector__field--spaced" htmlFor={`input-title-background-${clip.id}`}>
          <span className="cutline-inspector__field-label">Text background color (CSS color)</span>
          <input id={`input-title-background-${clip.id}`} className="cutline-inspector__number" type="text" value={clip.text.backgroundColor} disabled={disabled} data-testid="input-title-background" onChange={(event) => onChange({ text: { backgroundColor: event.currentTarget.value } })} />
        </label>
        <div className="cutline-inspector__background-presets" aria-label="Text background presets">
          <button type="button" disabled={disabled} onClick={() => onChange({ text: { backgroundStyle: { ...backgroundStyle, enabled: false } } })}>No background</button>
          <button type="button" disabled={disabled} onClick={() => onChange({ text: {
            backgroundColor: 'rgba(16,18,22,.82)',
            backgroundStyle: { ...backgroundStyle, enabled: true, opacity: .82, padding: 16, radius: 0, width: undefined, height: undefined },
          } })}>Subtitle</button>
          <button type="button" disabled={disabled} onClick={() => onChange({ text: {
            backgroundColor: '#111820',
            backgroundStyle: { ...backgroundStyle, enabled: true, opacity: 1, padding: 20, radius: 0, width: undefined, height: undefined },
          } })}>Solid</button>
          <button type="button" disabled={disabled} onClick={() => onChange({ text: {
            backgroundColor: 'rgba(16,18,22,.86)',
            backgroundStyle: { ...backgroundStyle, enabled: true, opacity: .86, padding: 18, radius: 14, width: undefined, height: undefined },
          } })}>Rounded</button>
        </div>
        <label className="cutline-inspector__check cutline-inspector__check--spaced" htmlFor={`check-title-background-${clip.id}`}>
          <input
            id={`check-title-background-${clip.id}`}
            type="checkbox"
            checked={backgroundStyle.enabled ?? Boolean(clip.text.backgroundColor)}
            disabled={disabled}
            data-testid="check-title-background"
            onChange={(event) => {
              if (event.currentTarget.checked && !clip.text?.backgroundColor) {
                onChange({ text: { backgroundColor: 'rgba(16,18,22,.82)', backgroundStyle: { ...backgroundStyle, enabled: true } } });
              } else updateBackground({ enabled: event.currentTarget.checked });
            }}
          />
          <span>Show background</span>
        </label>
        {rangeControl('Background opacity', 'slider-title-background-opacity', (backgroundStyle.opacity ?? 1) * 100, 0, 100, 1, (value) => updateBackground({ opacity: value / 100 }), '%')}
        <div className="cutline-inspector__fields">
          {rangeControl('Padding', 'slider-title-background-padding', backgroundStyle.padding ?? 16, 0, 120, 1, (value) => updateBackground({ padding: value }), 'px')}
          {rangeControl('Corner radius', 'slider-title-background-radius', backgroundStyle.radius ?? 0, 0, 100, 1, (value) => updateBackground({ radius: value }), 'px')}
        </div>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-background-width-${clip.id}`}>
            <span className="cutline-inspector__field-label">Background width (0 = auto)</span>
            <input id={`input-title-background-width-${clip.id}`} className="cutline-inspector__number" type="number" min="0" max="4000" value={backgroundStyle.width ?? 0} disabled={disabled} data-testid="input-title-background-width" onChange={(event) => updateBackground({ width: Number(event.currentTarget.value) > 0 ? clamp(Number(event.currentTarget.value), 1, 4000) : undefined })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`input-title-background-height-${clip.id}`}>
            <span className="cutline-inspector__field-label">Background height (0 = auto)</span>
            <input id={`input-title-background-height-${clip.id}`} className="cutline-inspector__number" type="number" min="0" max="4000" value={backgroundStyle.height ?? 0} disabled={disabled} data-testid="input-title-background-height" onChange={(event) => updateBackground({ height: Number(event.currentTarget.value) > 0 ? clamp(Number(event.currentTarget.value), 1, 4000) : undefined })} />
          </label>
        </div>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`select-title-background-align-x-${clip.id}`}>
            <span className="cutline-inspector__field-label">Background horizontal anchor</span>
            <CutlineSelect
              id={`select-title-background-align-x-${clip.id}`}
              className="cutline-inspector__select"
              value={backgroundStyle.alignX ?? clip.text.align}
              options={[{ value: 'left', label: 'Left' }, { value: 'center', label: 'Center' }, { value: 'right', label: 'Right' }]}
              disabled={disabled}
              data-testid="select-title-background-align-x"
              onValueChange={(value) => updateBackground({ alignX: value as TextBackgroundStyle['alignX'] })}
            />
          </label>
          <label className="cutline-inspector__field" htmlFor={`select-title-background-align-y-${clip.id}`}>
            <span className="cutline-inspector__field-label">Background vertical anchor</span>
            <CutlineSelect
              id={`select-title-background-align-y-${clip.id}`}
              className="cutline-inspector__select"
              value={backgroundStyle.alignY ?? 'center'}
              options={[{ value: 'top', label: 'Top' }, { value: 'center', label: 'Center' }, { value: 'bottom', label: 'Bottom' }]}
              disabled={disabled}
              data-testid="select-title-background-align-y"
              onValueChange={(value) => updateBackground({ alignY: value as TextBackgroundStyle['alignY'] })}
            />
          </label>
        </div>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-background-offset-x-${clip.id}`}>
            <span className="cutline-inspector__field-label">Background offset X</span>
            <input id={`input-title-background-offset-x-${clip.id}`} className="cutline-inspector__number" type="number" value={backgroundStyle.offsetX ?? 0} disabled={disabled} data-testid="input-title-background-offset-x" onChange={(event) => updateBackground({ offsetX: Number(event.currentTarget.value) || 0 })} />
          </label>
          <label className="cutline-inspector__field" htmlFor={`input-title-background-offset-y-${clip.id}`}>
            <span className="cutline-inspector__field-label">Background offset Y</span>
            <input id={`input-title-background-offset-y-${clip.id}`} className="cutline-inspector__number" type="number" value={backgroundStyle.offsetY ?? 0} disabled={disabled} data-testid="input-title-background-offset-y" onChange={(event) => updateBackground({ offsetY: Number(event.currentTarget.value) || 0 })} />
          </label>
        </div>
        <div className="cutline-inspector__fields">
          <label className="cutline-inspector__field" htmlFor={`input-title-background-border-${clip.id}`}>
            <span className="cutline-inspector__field-label">Border color</span>
            <input id={`input-title-background-border-${clip.id}`} className="cutline-inspector__number" type="text" value={backgroundStyle.borderColor ?? 'transparent'} disabled={disabled} data-testid="input-title-background-border" onChange={(event) => updateBackground({ borderColor: event.currentTarget.value })} />
          </label>
          {rangeControl('Border width', 'slider-title-background-border-width', backgroundStyle.borderWidth ?? 0, 0, 20, 1, (value) => updateBackground({ borderWidth: value }), 'px')}
        </div>
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

      {assetKind !== 'audio' && <section className="cutline-inspector__section" aria-labelledby="inspector-effects-heading">
        <div className="cutline-inspector__section-title">
          <h2 id="inspector-effects-heading">Effects</h2>
          <button type="button" className="cutline-inspector__reset-effects" disabled={disabled} onClick={() => onChange({ effects: { ...DEFAULT_EFFECTS, filterPreset: undefined, filterIntensity: 100 } })} data-testid="button-reset-effects">Reset</button>
        </div>
        <div className="cutline-inspector__effect-control">{effectToggle('Brightness', 'brightness')}{rangeControl('Brightness', 'slider-effect-brightness', effects.brightness, 0, 2, .05, (value) => onChange({ effects: { brightness: value } }))}</div>
        <div className="cutline-inspector__effect-control">{effectToggle('Contrast', 'contrast')}{rangeControl('Contrast', 'slider-effect-contrast', effects.contrast, 0, 2, .05, (value) => onChange({ effects: { contrast: value } }))}</div>
        <div className="cutline-inspector__effect-control">{effectToggle('Saturation', 'saturation')}{rangeControl('Saturation', 'slider-effect-saturation', effects.saturation, 0, 2, .05, (value) => onChange({ effects: { saturation: value } }))}</div>
        <div className="cutline-inspector__effect-control">{effectToggle('Blur', 'blur')}{rangeControl('Blur', 'slider-effect-blur', effects.blur, 0, 20, .25, (value) => onChange({ effects: { blur: value } }), 'px')}</div>
      </section>}

      {(assetKind === 'video' || assetKind === 'image') && <section className="cutline-inspector__section" aria-labelledby="inspector-color-heading">
        <div className="cutline-inspector__section-title">
          <h2 id="inspector-color-heading">Color adjustments</h2>
          <button type="button" className="cutline-inspector__reset-effects" disabled={disabled} onClick={() => onChange({ effects: {
            ...DEFAULT_EFFECTS,
            filterPreset: undefined,
            filterIntensity: 100,
          } })} data-testid="button-reset-color">Reset color</button>
        </div>
        {rangeControl('Exposure', 'slider-color-exposure', effects.exposure, -2, 2, .05, (value) => onChange({ effects: { exposure: value } }), ' EV')}
        {rangeControl('Temperature', 'slider-color-temperature', effects.temperature, -100, 100, 1, (value) => onChange({ effects: { temperature: value } }))}
        {rangeControl('Tint', 'slider-color-tint', effects.tint, -100, 100, 1, (value) => onChange({ effects: { tint: value } }))}
        {rangeControl('Fade', 'slider-color-fade', effects.fade * 100, 0, 100, 1, (value) => onChange({ effects: { fade: value / 100 } }), '%')}
        {rangeControl('Vignette', 'slider-color-vignette', effects.vignette * 100, 0, 100, 1, (value) => onChange({ effects: { vignette: value / 100 } }), '%')}
      </section>}

      <section className="cutline-inspector__section" aria-labelledby="inspector-fade-heading">
        <div className="cutline-inspector__section-title"><h2 id="inspector-fade-heading">Fades</h2></div>
        {rangeControl('Fade in', 'slider-fade-in', fadeIn, 0, Math.min(5, clipDuration / 2), .05, (value) => onChange({ fadeIn: value }), 's')}
        {rangeControl('Fade out', 'slider-fade-out', fadeOut, 0, Math.min(5, clipDuration / 2), .05, (value) => onChange({ fadeOut: value }), 's')}
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
