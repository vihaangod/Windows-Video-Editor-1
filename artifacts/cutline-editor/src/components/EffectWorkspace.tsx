import { useEffect, useMemo, useState } from 'react';
import { Search, Sparkles, Trash2, WandSparkles } from 'lucide-react';
import { FILTER_PRESETS, type ClipEffects, type ClipFilter, type ClipTransition } from '@/lib/composition';

export type TransitionPresetType = 'cross-dissolve' | 'fade-through-black' | 'wipe' | 'slide' | 'zoom';

type Props = {
  workspace: 'effects' | 'transitions' | 'filters';
  disabled?: boolean;
  disabledReason?: string;
  onEffects: (effects: Partial<ClipEffects>) => void;
  onTransition: (type: TransitionPresetType, duration: number) => void;
  onRemoveTransition: () => void;
  hasSelectedTransition?: boolean;
  selectedTransition?: ClipTransition | null;
  selectedEffects?: Partial<ClipEffects>;
  thumbnail?: string;
  canApplyTransition?: boolean;
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

const TRANSITIONS: Array<{ name: string; description: string; type: TransitionPresetType; sample: string }> = [
  { name: 'Cross dissolve', description: 'Blend adjacent clips with a real two-source dissolve.', type: 'cross-dissolve', sample: 'fade-both' },
  { name: 'Fade through black', description: 'Fade out, pass through black, then fade in.', type: 'fade-through-black', sample: 'fade-out' },
  { name: 'Wipe', description: 'Reveal the next adjacent clip from left to right.', type: 'wipe', sample: 'fade-in' },
  { name: 'Slide', description: 'Slide the incoming clip in from the right.', type: 'slide', sample: 'fade-in' },
  { name: 'Zoom', description: 'Dissolve while the incoming clip scales into place.', type: 'zoom', sample: 'soft' },
];

export default function EffectWorkspace({
  workspace,
  disabled = false,
  disabledReason,
  onEffects,
  onTransition,
  onRemoveTransition,
  hasSelectedTransition = false,
  selectedTransition = null,
  selectedEffects,
  thumbnail,
  canApplyTransition = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [duration, setDuration] = useState(.6);
  useEffect(() => {
    if (selectedTransition) setDuration(Math.min(4, Math.max(.2, selectedTransition.duration)));
  }, [selectedTransition?.id, selectedTransition?.duration]);
  const presets = workspace === 'effects' ? EFFECTS : workspace === 'filters' ? FILTERS : TRANSITIONS;
  const visible = useMemo(
    () => presets.filter((preset) => `${preset.name} ${preset.description}`.toLowerCase().includes(query.trim().toLowerCase())),
    [presets, query],
  );
  const title = workspace === 'effects' ? 'Effects' : workspace === 'filters' ? 'Filters' : 'Transitions';
  const apply = (preset: typeof presets[number]) => {
    if (workspace === 'transitions') {
      const transition = preset as typeof TRANSITIONS[number];
      onTransition(transition.type, duration);
    } else if (workspace === 'filters') {
      const filter = preset as typeof FILTERS[number];
      const legacyStack: ClipFilter[] = selectedEffects?.filterPreset
        ? [{ presetId: selectedEffects.filterPreset, intensity: selectedEffects.filterIntensity ?? 100, enabled: true }]
        : [];
      const stack = selectedEffects?.filterStack ?? legacyStack;
      if (filter.id === 'original') {
        onEffects({ filterStack: [], filterPreset: undefined, filterIntensity: 100 });
      } else if (!stack.some((entry) => entry.presetId === filter.id)) {
        onEffects({ filterStack: [...stack, { presetId: filter.id, intensity: 100, enabled: true }], filterPreset: undefined });
      }
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
    const clamped = Math.min(4, Math.max(.2, next));
    setDuration(clamped);
    if (selectedTransition && canApplyTransition) onTransition(selectedTransition.type, clamped);
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
          ? canApplyTransition || hasSelectedTransition
            ? 'A transition is applied between the selected adjacent clips. Choose a preset to replace it.'
            : 'Select one of two video clips that touch on the same track to enable transitions.'
          : workspace === 'filters'
            ? 'Filters change the selected clip in preview and export. Use intensity to blend with the original.'
            : 'Choose a preset for the selected clip. Adjust the exact values in the Clip Inspector.'}
      </p>
      {workspace === 'transitions' && <section className="cutline-transition-controls" aria-label="Transition duration">
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
          min=".2"
          max="4"
          step=".1"
          value={duration}
          onChange={(event) => updateTransitionDuration(Number(event.currentTarget.value))}
          aria-label="Transition duration"
          disabled={!canApplyTransition}
          data-testid="slider-transition-duration"
        />
        <div className="cutline-transition-controls__scale" aria-hidden="true"><span>0.2 s</span><span>4.0 s</span></div>
        <div className="cutline-transition-controls__footer">
          {selectedTransition && canApplyTransition
            ? <small className="cutline-transition-controls__applied"><i />Applied · {selectedTransition.type.replaceAll('-', ' ')}</small>
            : selectedTransition
              ? <small className="cutline-transition-controls__hint">The clips must touch to use this transition</small>
              : <small className="cutline-transition-controls__hint">Choose a transition to use this duration</small>}
          <button type="button" className="cutline-transition-controls__remove" disabled={!hasSelectedTransition} onClick={onRemoveTransition} data-testid="button-remove-transition">
            <Trash2 size={13} aria-hidden="true" />Remove
          </button>
        </div>
      </section>}
      {workspace === 'filters' && <>
        <div className="cutline-filter-workspace__active">
          <span>Active stack</span><strong>{selectedFilterLabel}</strong>
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
            disabled={disabled}
            onClick={() => apply(preset)}
              title={disabled ? disabledReason || `Select a clip to use ${title.toLowerCase()}` : `Apply ${preset.name}`}
            aria-pressed={workspace === 'filters' && activeFilters.some((filter) => filter.presetId === (preset as typeof FILTERS[number]).id)}
            data-testid={workspace === 'filters' ? `button-filter-${(preset as typeof FILTERS[number]).id}` : undefined}
          >
            <span className={`cutline-effect-card__preview cutline-effect-card__preview--${preset.sample} ${workspace === 'filters' && activeFilters.some((filter) => filter.presetId === (preset as typeof FILTERS[number]).id && filter.enabled) ? 'is-active' : ''}`} aria-hidden="true">
              {thumbnail ? <img src={thumbnail} alt="" style={{ filter: previewFilter }} /> : <span />}
            </span>
            <span className="cutline-effect-card__copy">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
            <span className="cutline-effect-card__apply">{workspace === 'filters' && activeFilters.some((filter) => filter.presetId === (preset as typeof FILTERS[number]).id) ? 'Added' : 'Apply'}</span>
          </button>
          );
        })}
        {visible.length === 0 && <p className="cutline-effect-workspace__empty">No matching presets.</p>}
      </div>
      <p className="cutline-effect-workspace__foot">Presets change clip data; they are not applied to source files.</p>
    </div>
  );
}
