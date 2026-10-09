import { useMemo, useState } from 'react';
import { Search, Sparkles, WandSparkles } from 'lucide-react';
import type { ClipEffects } from '@/lib/composition';

type Props = {
  workspace: 'effects' | 'transitions' | 'filters';
  disabled?: boolean;
  onEffects: (effects: Partial<ClipEffects>) => void;
  onFade: (fadeIn: number, fadeOut: number) => void;
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

const TRANSITIONS = [
  { name: 'Fade in', description: 'Fade this clip up from the canvas background.', in: .5, out: 0, sample: 'fade-in' },
  { name: 'Fade out', description: 'Fade this clip down to the canvas background.', in: 0, out: .5, sample: 'fade-out' },
  { name: 'Fade both ends', description: 'Apply a fade at the beginning and end.', in: .45, out: .45, sample: 'fade-both' },
];

export default function EffectWorkspace({ workspace, disabled = false, onEffects, onFade }: Props) {
  const [query, setQuery] = useState('');
  const presets = workspace === 'effects' ? EFFECTS : workspace === 'filters' ? FILTERS : TRANSITIONS;
  const visible = useMemo(
    () => presets.filter((preset) => `${preset.name} ${preset.description}`.toLowerCase().includes(query.trim().toLowerCase())),
    [presets, query],
  );
  const title = workspace === 'effects' ? 'Effects' : workspace === 'filters' ? 'Filters' : 'Transitions';
  const apply = (preset: typeof presets[number]) => {
    if (workspace === 'transitions') {
      const transition = preset as typeof TRANSITIONS[number];
      onFade(transition.in, transition.out);
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
          ? 'Fades apply to the selected clip and are included in playback and export.'
          : 'Choose a preset for the selected clip. Adjust the exact values in the Clip Inspector.'}
      </p>
      <div className="cutline-effect-workspace__list">
        {visible.map((preset) => (
          <button
            key={preset.name}
            type="button"
            className="cutline-effect-card"
            disabled={disabled}
            onClick={() => apply(preset)}
            title={disabled ? 'Select an unlocked timeline clip first' : `Apply ${preset.name}`}
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
