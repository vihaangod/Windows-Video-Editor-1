import './inspector-panel.css';

export type InspectorClip = {
  id: string;
  timelineStart: number;
  sourceIn: number;
  sourceOut: number;
  speed: number;
  volume: number;
};

type ClipPatch = Partial<Pick<InspectorClip, 'timelineStart' | 'sourceIn' | 'sourceOut' | 'speed' | 'volume'>>;

export type InspectorPanelProps = {
  clip: InspectorClip | null;
  assetName?: string;
  assetKind?: 'video' | 'audio' | 'image';
  sourceDuration?: number;
  onChange: (patch: ClipPatch) => void;
  onRemove: () => void;
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
    default: return 'Video clip';
  }
}

export default function InspectorPanel({
  clip,
  assetName,
  assetKind = 'video',
  sourceDuration,
  onChange,
  onRemove,
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
          data-testid={testId}
        />
        <span className="cutline-inspector__unit">sec</span>
      </span>
    </label>
  );

  return (
    <aside className="cutline-inspector" aria-label="Clip inspector" data-testid="panel-inspector">
      <div className="cutline-inspector__heading">
        <span className="cutline-inspector__eyebrow">CLIP INSPECTOR</span>
        <span className="cutline-inspector__index">01 / 01</span>
      </div>

      <div className="cutline-inspector__identity" data-testid={`text-clip-name-${clip.id}`}>
        <span className={`cutline-inspector__type cutline-inspector__type--${assetKind}`} aria-label={kindLabel(assetKind)}>
          {assetKind === 'audio' ? 'AUD' : assetKind === 'image' ? 'IMG' : 'VID'}
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
          <input
            id={`input-speed-${clip.id}`}
            className="cutline-inspector__range"
            type="range"
            min="0.1"
            max="4"
            step="0.05"
            value={speed}
            onChange={(event) => onChange({ speed: Number(event.currentTarget.value) })}
            aria-label="Playback speed"
            data-testid="slider-playback-speed"
          />
          <span className="cutline-inspector__range-ends"><span>0.1×</span><span>4×</span></span>
        </label>
        <label className="cutline-inspector__range-field" htmlFor={`input-volume-${clip.id}`}>
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
            data-testid="slider-clip-gain"
          />
          <span className="cutline-inspector__range-ends"><span>Muted</span><span>200%</span></span>
        </label>
      </section>

      <div className="cutline-inspector__footer">
        <span>Changes apply to this clip</span>
        <button
          className="cutline-inspector__remove"
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${assetName || 'clip'} from timeline`}
          data-testid="button-remove-clip"
        >
          Remove clip <span aria-hidden="true">⌫</span>
        </button>
      </div>
    </aside>
  );
}
