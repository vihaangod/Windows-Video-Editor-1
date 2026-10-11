import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { FILTER_PRESETS, type ClipEffects, type ClipFilter, type ClipTransition } from '@/lib/composition';

export type TransitionPresetType = ClipTransition['type'];
export type TransitionPresetMode = 'entrance' | 'exit' | 'between';
export type TransitionPresetDirection = 'left' | 'right' | 'up' | 'down';
type TransitionCategory = 'Basic' | 'Slide' | 'Reveal' | 'Split' | 'Zoom' | 'Creative';

type Props = {
  workspace: 'effects' | 'transitions' | 'filters';
  disabled?: boolean;
  disabledReason?: string;
  onEffects: (effects: Partial<ClipEffects>) => void;
  onFilter: (presetId: string) => void;
  onTransition: (type: TransitionPresetType, duration: number, mode: TransitionPresetMode, direction: TransitionPresetDirection) => void;
  onRemoveTransition: () => void;
  hasSelectedTransition?: boolean;
  selectedTransition?: ClipTransition | null;
  selectedEffects?: Partial<ClipEffects>;
  thumbnail?: string;
  canApplyTransition?: boolean;
  canApplyBetweenTransition?: boolean;
};

const EFFECTS: Array<{ name: string; description: string; values: Partial<ClipEffects>; sample: string }> = [
  { name: 'Soft focus', description: 'Gentle blur with a small brightness lift.', values: { brightness: 1.04, contrast: .98, saturation: 1, blur: 1.2 }, sample: 'soft' },
  { name: 'Punch', description: 'Stronger contrast and color for gameplay.', values: { brightness: 1.02, contrast: 1.22, saturation: 1.18, blur: 0 }, sample: 'punch' },
  { name: 'Muted', description: 'Lower color intensity and contrast.', values: { brightness: .98, contrast: .92, saturation: .72, blur: 0 }, sample: 'muted' },
  { name: 'Brighten', description: 'Lift brightness without changing framing.', values: { brightness: 1.18, contrast: 1.04, saturation: 1.04, blur: 0 }, sample: 'bright' },
];

const FILTERS = FILTER_PRESETS.map((preset) => ({
  id: preset.id,
  name: preset.name,
  description: preset.description,
  values: { ...preset.values, filterPreset: preset.id === 'original' ? undefined : preset.id, filterIntensity: 100 } as Partial<ClipEffects>,
  sample: preset.id,
}));

const TRANSITIONS: Array<{ name: string; description: string; type: TransitionPresetType; sample: string; category: TransitionCategory }> = [
  { name: 'Fade', description: 'Fade a clip from or to the background.', type: 'fade', sample: 'fade', category: 'Basic' },
  { name: 'Cross dissolve', description: 'Blend both moving clips through the edit point.', type: 'cross-dissolve', sample: 'cross', category: 'Basic' },
  { name: 'Fade through black', description: 'Fade out, pause on black, then fade in.', type: 'fade-through-black', sample: 'black', category: 'Basic' },
  { name: 'Wipe', description: 'Reveal the next clip along the selected direction.', type: 'wipe', sample: 'wipe', category: 'Reveal' },
  { name: 'Slide', description: 'Bring the incoming clip over a stationary outgoing clip.', type: 'slide', sample: 'slide', category: 'Slide' },
  { name: 'Zoom', description: 'Dissolve as the incoming clip settles into frame.', type: 'zoom', sample: 'zoom', category: 'Zoom' },
  { name: 'Zoom in', description: 'Scale up from a smaller frame into the next shot.', type: 'zoom-in', sample: 'zoom-in', category: 'Zoom' },
  { name: 'Zoom out', description: 'Scale down from a larger frame into the next shot.', type: 'zoom-out', sample: 'zoom-out', category: 'Zoom' },
  { name: 'Split horizontal', description: 'Open the incoming frame outward from a horizontal seam.', type: 'split-horizontal', sample: 'split-h', category: 'Split' },
  { name: 'Split vertical', description: 'Open the incoming frame outward from a vertical seam.', type: 'split-vertical', sample: 'split-v', category: 'Split' },
  { name: 'Barn doors', description: 'Two angled panels part from the center to reveal the shot.', type: 'doors', sample: 'doors', category: 'Split' },
  { name: 'Blinds', description: 'Reveal the next shot in staggered horizontal strips.', type: 'blinds', sample: 'blinds', category: 'Reveal' },
  { name: 'Iris', description: 'Expand an oval window from the center of the frame.', type: 'iris', sample: 'iris', category: 'Reveal' },
  { name: 'Circle reveal', description: 'Expand a circular window from the frame center.', type: 'circle', sample: 'circle', category: 'Reveal' },
  { name: 'Diamond reveal', description: 'Open a diamond-shaped window into the next shot.', type: 'diamond', sample: 'diamond', category: 'Reveal' },
  { name: 'Blur dissolve', description: 'Blend the shots through a brief, soft-focus peak.', type: 'blur-dissolve', sample: 'blur', category: 'Creative' },
  { name: 'Push', description: 'Push the outgoing frame away as the next shot enters.', type: 'push', sample: 'push', category: 'Slide' },
  { name: 'Curtains', description: 'Reveal the frame from its outside edges inward.', type: 'curtain', sample: 'curtain', category: 'Reveal' },
  { name: 'Flash', description: 'Blend the shots through a brief white flash.', type: 'flash', sample: 'flash', category: 'Creative' },
  { name: 'Diagonal reveal', description: 'Wipe the next shot across the frame on a diagonal.', type: 'diagonal', sample: 'diagonal', category: 'Reveal' },
];
const TRANSITION_CATEGORIES: Array<'All' | TransitionCategory> = ['All', 'Basic', 'Slide', 'Reveal', 'Split', 'Zoom', 'Creative'];

export default function EffectWorkspace({
  workspace,
  disabled = false,
  disabledReason,
  onEffects,
  onFilter,
  onTransition,
  onRemoveTransition,
  hasSelectedTransition = false,
  selectedTransition = null,
  selectedEffects,
  thumbnail,
  canApplyTransition = false,
  canApplyBetweenTransition = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [duration, setDuration] = useState(.6);
  const [mode, setMode] = useState<TransitionPresetMode>(selectedTransition?.mode || 'entrance');
  const [direction, setDirection] = useState<TransitionPresetDirection>(selectedTransition?.direction || 'right');
  const [transitionCategory, setTransitionCategory] = useState<'All' | TransitionCategory>('All');
  useEffect(() => {
    if (!selectedTransition) return;
    setDuration(Math.min(4, Math.max(.1, selectedTransition.duration)));
    setMode(selectedTransition.mode || 'between');
    setDirection(selectedTransition.direction || 'right');
  }, [selectedTransition?.id, selectedTransition?.duration, selectedTransition?.mode, selectedTransition?.direction]);
  const presets = workspace === 'effects' ? EFFECTS : workspace === 'filters' ? FILTERS : TRANSITIONS;
  const visible = useMemo(
    () => presets.filter((preset) =>
      `${preset.name} ${preset.description}`.toLowerCase().includes(query.trim().toLowerCase()) &&
      (workspace !== 'transitions' || transitionCategory === 'All' ||
        ('category' in preset && preset.category === transitionCategory))),
    [presets, query, transitionCategory, workspace],
  );
  const title = workspace === 'effects' ? 'Effects' : workspace === 'filters' ? 'Filters' : 'Transitions';
  const apply = (preset: typeof presets[number]) => {
    if (workspace === 'transitions') {
      const transition = preset as typeof TRANSITIONS[number];
      onTransition(transition.type, duration, mode, direction);
    } else if (workspace === 'filters') {
      const filter = preset as typeof FILTERS[number];
      onFilter(filter.id);
    } else {
      onEffects((preset as typeof EFFECTS[number]).values);
    }
  };
  const legacyStack: ClipFilter[] = selectedEffects?.filterPreset
    ? [{ presetId: selectedEffects.filterPreset, intensity: selectedEffects.filterIntensity ?? 100, enabled: true }]
    : [];
  const activeFilters = selectedEffects?.filterStack ?? legacyStack;
  const changeFilter = (presetId: string, patch: Partial<ClipFilter>) => onEffects({
    filterStack: activeFilters.map((filter) => filter.presetId === presetId ? { ...filter, ...patch } : filter),
    filterPreset: undefined,
  });
  const removeFilter = (presetId: string) => onEffects({
    filterStack: activeFilters.filter((filter) => filter.presetId !== presetId),
    filterPreset: undefined,
  });
  const selectedFilterLabel = activeFilters.length
    ? activeFilters.map((filter) => FILTER_PRESETS.find((preset) => preset.id === filter.presetId)?.name || filter.presetId).join(' + ')
    : 'Original';
  const updateTransitionDuration = (next: number) => {
    const clamped = Math.min(4, Math.max(.1, next));
    setDuration(clamped);
    if (selectedTransition) onTransition(selectedTransition.type, clamped, mode, direction);
  };
  const modeCanApply = mode === 'between' ? canApplyBetweenTransition : canApplyTransition;
  const updateMode = (next: TransitionPresetMode) => {
    setMode(next);
    if (selectedTransition) onTransition(selectedTransition.type, duration, next, direction);
  };
  const updateDirection = (next: TransitionPresetDirection) => {
    setDirection(next);
    if (selectedTransition) onTransition(selectedTransition.type, duration, mode, next);
  };

  return (
    <div className="cutline-effect-workspace" data-testid={`panel-${workspace}`}>
      <header className="cutline-effect-workspace__header">
        <div className="cutline-effect-workspace__title">
          <span className="cutline-effect-workspace__mark" aria-hidden="true">
            {workspace === 'transitions' ? <Sparkles size={16} /> : <WandSparkles size={16} />}
          </span>
          <div><span className="cutline-effect-workspace__eyebrow">CLIP TOOLS</span><h2>{title}</h2></div>
        </div>
        <label className="cutline-effect-workspace__search">
          <Search size={14} aria-hidden="true" />
          <span className="cutline-sr-only">Search {title.toLowerCase()}</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} />
        </label>
      </header>
      <p className="cutline-effect-workspace__note" role={disabled && disabledReason ? 'status' : undefined}>
        {disabled && disabledReason ? disabledReason : workspace === 'transitions'
          ? hasSelectedTransition
            ? 'Edit the selected transition here, or choose a preset to replace its effect.'
            : 'Select a video clip for an entrance or exit. Choose Between clips when two clips touch on the same track.'
          : workspace === 'filters'
            ? 'Choose a preset to add a 5-second filter clip at the playhead. Select it on the Effects track to change its strength and timing.'
            : 'Choose a preset for the selected clip. Adjust the exact values in the Clip Inspector.'}
      </p>
      {workspace === 'transitions' && <section className="cutline-transition-controls" aria-label="Transition settings">
        <div className="cutline-transition-controls__selectors">
          <label>Apply to
            <select value={mode} onChange={(event) => updateMode(event.currentTarget.value as TransitionPresetMode)} disabled={disabled} data-testid="select-transition-mode">
              <option value="entrance">Clip entrance</option>
              <option value="exit">Clip exit</option>
              <option value="between">Between clips</option>
            </select>
          </label>
          <label>Direction
            <select value={direction} onChange={(event) => updateDirection(event.currentTarget.value as TransitionPresetDirection)} disabled={disabled} data-testid="select-transition-direction">
              <option value="left">From / toward left</option>
              <option value="right">From / toward right</option>
              <option value="up">From / toward top</option>
              <option value="down">From / toward bottom</option>
            </select>
          </label>
        </div>
        <div className="cutline-transition-controls__header">
          <div className="cutline-transition-controls__heading">
            <span>TRANSITION LENGTH</span>
            <label htmlFor="input-transition-duration">Duration</label>
          </div>
          <output className="cutline-transition-controls__value" htmlFor="input-transition-duration" aria-live="polite">{duration.toFixed(1)}<small>s</small></output>
        </div>
        <input
          id="input-transition-duration"
          className="cutline-transition-controls__range"
          type="range"
          min=".1"
          max="4"
          step=".05"
          value={duration}
          onChange={(event) => updateTransitionDuration(Number(event.currentTarget.value))}
          aria-label="Transition duration"
          disabled={!modeCanApply}
          data-testid="slider-transition-duration"
        />
        <div className="cutline-transition-controls__scale" aria-hidden="true"><span>0.1 s</span><span>4.0 s</span></div>
        <div className="cutline-transition-controls__footer">
          {selectedTransition && modeCanApply
            ? <small className="cutline-transition-controls__applied"><i />Applied · {selectedTransition.type.replaceAll('-', ' ')}</small>
            : mode === 'between'
              ? <small className="cutline-transition-controls__hint">Select two touching video clips for a between-clips transition</small>
              : <small className="cutline-transition-controls__hint">Select a video clip to add an entrance or exit</small>}
          <button type="button" className="cutline-transition-controls__remove" disabled={!hasSelectedTransition} onClick={onRemoveTransition} data-testid="button-remove-transition">
            <Trash2 size={13} aria-hidden="true" />Remove
          </button>
        </div>
      </section>}
      {workspace === 'transitions' && <nav className="cutline-transition-categories" aria-label="Filter transition category">
        {TRANSITION_CATEGORIES.map((category) => <button
          type="button"
          key={category}
          className={transitionCategory === category ? 'is-active' : ''}
          aria-pressed={transitionCategory === category}
          onClick={() => setTransitionCategory(category)}
          data-testid={`button-transition-category-${category.toLowerCase()}`}
        >{category}</button>)}
      </nav>}
      {workspace === 'filters' && <>
        <div className="cutline-filter-workspace__active">
          <span>Existing clip-wide stack</span><strong>{selectedFilterLabel}</strong>
        </div>
        {activeFilters.map((filter) => {
          const filterName = FILTER_PRESETS.find((preset) => preset.id === filter.presetId)?.name || filter.presetId;
          return <div className="cutline-filter-workspace__layer" key={filter.presetId}>
            <label className="cutline-filter-workspace__enabled">
              <input type="checkbox" checked={filter.enabled} onChange={(event) => changeFilter(filter.presetId, { enabled: event.currentTarget.checked })} disabled={disabled} aria-label={`Enable ${filterName}`} />
              <strong>{filterName}</strong>
            </label>
            <button type="button" title={`Remove ${filterName}`} aria-label={`Remove ${filterName}`} onClick={() => removeFilter(filter.presetId)} disabled={disabled} data-testid={`button-remove-filter-${filter.presetId}`}><Trash2 size={12} /></button>
            <label className="cutline-filter-workspace__layer-intensity">
              <span>Strength <strong>{Math.round(filter.intensity)}%</strong></span>
              <input type="range" min="0" max="100" step="1" value={filter.intensity} onChange={(event) => changeFilter(filter.presetId, { intensity: Number(event.currentTarget.value) })} disabled={disabled} aria-label={`${filterName} strength`} data-testid={`slider-filter-intensity-${filter.presetId}`} />
            </label>
          </div>;
        })}
      </>}
      <div className="cutline-effect-workspace__list">
        {visible.map((preset) => {
          const previewValues = 'values' in preset ? preset.values as Partial<ClipEffects> : {};
          const previewId = 'id' in preset ? preset.id : '';
          const previewFilter = `brightness(${previewValues.brightness ?? 1}) contrast(${previewValues.contrast ?? 1}) saturate(${previewValues.saturation ?? 1}) sepia(${Math.max(0, Number(previewValues.temperature ?? 0)) / 230}) hue-rotate(${Number(previewValues.temperature ?? 0) * -.5}deg) grayscale(${previewId === 'noir' ? 1 : 0})`;
          return (
          <button
            key={preset.name}
            type="button"
            className="cutline-effect-card"
            disabled={disabled || (workspace === 'transitions' && !modeCanApply)}
            onClick={() => apply(preset)}
              title={disabled ? disabledReason || `Select a clip to use ${title.toLowerCase()}` : workspace === 'transitions' && !modeCanApply ? 'Select a compatible clip or pair first' : `Apply ${preset.name}`}
            aria-pressed={workspace === 'filters' && activeFilters.some((filter) => filter.presetId === (preset as typeof FILTERS[number]).id)}
            data-testid={workspace === 'filters' ? `button-filter-${(preset as typeof FILTERS[number]).id}` : undefined}
          >
            <span className={`cutline-effect-card__preview cutline-effect-card__preview--${preset.sample} ${workspace === 'filters' && activeFilters.some((filter) => filter.presetId === (preset as typeof FILTERS[number]).id && filter.enabled) ? 'is-active' : ''}`} aria-hidden="true">
              {workspace === 'transitions'
                ? <span className={`cutline-transition-thumb cutline-transition-thumb--${preset.sample}`}><i /><b /><em /></span>
                : thumbnail ? <img src={thumbnail} alt="" style={{ filter: previewFilter }} /> : <span />}
            </span>
            <span className="cutline-effect-card__copy">
              <strong>{preset.name}</strong>
              {workspace === 'transitions' && 'category' in preset && <small className="cutline-effect-card__category">{preset.category}</small>}
              <small>{preset.description}</small>
            </span>
            <span className="cutline-effect-card__apply">{workspace === 'filters' ? (preset.name === 'Original' ? 'Clear' : 'Add 5s') : 'Apply'}</span>
          </button>
          );
        })}
        {visible.length === 0 && <p className="cutline-effect-workspace__empty">No matching presets.</p>}
      </div>
      <p className="cutline-effect-workspace__foot">Presets change clip data; they are not applied to source files.</p>
    </div>
  );
}
