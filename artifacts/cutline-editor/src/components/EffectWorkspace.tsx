import { useMemo, useState } from 'react';
import { Search, Sparkles, WandSparkles } from 'lucide-react';
import type { ClipEffects } from '@/lib/composition';

export type TransitionPresetType = 'cross-dissolve' | 'fade-through-black' | 'wipe' | 'slide' | 'zoom';

type Props = {
  workspace: 'effects' | 'transitions' | 'filters';
  disabled?: boolean;
  onEffects: (effects: Partial<ClipEffects>) => void;
  onTransition: (type: TransitionPresetType, duration: number) => void;
  onRemoveTransition: () => void;
  hasSelectedTransition?: boolean;
};

const EFFECTS: Array<{ name: string; description: string; values: Partial<ClipEffects>; sample: string }> = [
  { name: 'Soft focus', description: 'Gentle blur with a small brightness lift.', values: { brightness: 1.04, contrast: .98, saturation: 1, blur: 1.2 }, sample: 'soft' },
  { name: 'Punch', description: 'Stronger contrast and color for gameplay.', values: { brightness: 1.02, contrast: 1.22, saturation: 1.18, blur: 0 }, sample: 'punch' },
  { name: 'Muted', description: 'Lower color intensity and contrast.', values: { brightness: .98, contrast: .92, saturation: .72, blur: 0 }, sample: 'muted' },
  { name: 'Brighten', description: 'Lift brightness without changing framing.', values: { brightness: 1.18, contrast: 1.04, saturation: 1.04, blur: 0 }, sample: 'bright' },
];

const FILTERS: Array<{ name: string; description: string; values: Partial<ClipEffects>; sample: string }> = [
  { name: 'Natural', description: 'Restore the default picture controls.', values: { brightness: 1, contrast: 1, saturation: 1, blur: 0 }, sample: 'natural' },
  { name: 'Vivid', description: 'Boost contrast and saturation.', values: { brightness: 1.04, contrast: 1.18, saturation: 1.36, blur: 0 }, sample: 'vivid' },
  { name: 'Low contrast', description: 'Reduce contrast for a softer image.', values: { brightness: 1.04, contrast: .82, saturation: .92, blur: 0 }, sample: 'low' },
  { name: 'Soft focus', description: 'Apply a light, adjustable blur.', values: { brightness: 1.03, contrast: .97, saturation: 1, blur: 1.6 }, sample: 'soft' },
];

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
  onEffects,
  onTransition,
  onRemoveTransition,
  hasSelectedTransition = false,
}: Props) {
  const [query, setQuery] = useState('');
  const [duration, setDuration] = useState(.6);
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
    } else {
      onEffects((preset as typeof EFFECTS[number]).values);
    }
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
      <p className="cutline-effect-workspace__note">
        {workspace === 'transitions'
          ? 'Select a video clip followed by another clip on the same track. The transition appears in preview and export.'
          : 'Choose a preset for the selected clip. Adjust the exact values in the Clip Inspector.'}
      </p>
      {workspace === 'transitions' && <div className="cutline-transition-controls">
        <label htmlFor="input-transition-duration">Duration <strong>{duration.toFixed(1)}s</strong></label>
        <input id="input-transition-duration" type="range" min=".2" max="2" step=".1" value={duration} onChange={(event) => setDuration(Number(event.currentTarget.value))} aria-label="Transition duration" />
        <button type="button" className="btn flat" disabled={!hasSelectedTransition} onClick={onRemoveTransition} data-testid="button-remove-transition">Remove transition</button>
      </div>}
      <div className="cutline-effect-workspace__list">
        {visible.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="cutline-effect-card"
            disabled={disabled}
            onClick={() => apply(preset)}
            title={disabled ? 'Select an unlocked video clip with an adjacent clip on the same track' : `Apply ${preset.name}`}
          >
            <span className={`cutline-effect-card__preview cutline-effect-card__preview--${preset.sample}`} aria-hidden="true">
              <span />
            </span>
            <span className="cutline-effect-card__copy">
              <strong>{preset.name}</strong>
              <small>{preset.description}</small>
            </span>
            <span className="cutline-effect-card__apply">Apply</span>
          </button>
        ))}
        {visible.length === 0 && <p className="cutline-effect-workspace__empty">No matching presets.</p>}
      </div>
      <p className="cutline-effect-workspace__foot">Presets change clip data; they are not applied to source files.</p>
    </div>
  );
}
