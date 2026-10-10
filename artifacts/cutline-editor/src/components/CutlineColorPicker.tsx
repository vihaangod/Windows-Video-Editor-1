import { Check, ChevronDown, Pipette } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import './cutline-color-picker.css';

type CutlineColorPickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  disabled?: boolean;
  testId?: string;
  hexInputTestId?: string;
};

type HsvColor = { h: number; s: number; v: number };
type EyeDropperResult = { sRGBHex: string };
type EyeDropperInstance = { open: () => Promise<EyeDropperResult> };
type EyeDropperConstructor = new () => EyeDropperInstance;

const QUICK_COLORS = [
  { name: 'Cutline gold', value: '#F9B643' },
  { name: 'Warm white', value: '#FFF4D8' },
  { name: 'Red', value: '#FF3B30' },
  { name: 'Sunshine yellow', value: '#FFD60A' },
  { name: 'Green', value: '#32D74B' },
  { name: 'Blue', value: '#0A84FF' },
  { name: 'White', value: '#FFFFFF' },
  { name: 'Magenta', value: '#FF00FF' },
];

function normalizeHex(color: string): string {
  const digits = color.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(digits)) return `#${digits.toUpperCase()}`;
  if (/^[\da-f]{3}$/i.test(digits)) {
    return `#${digits.split('').map((digit) => `${digit}${digit}`).join('').toUpperCase()}`;
  }
  return '#FFFFFF';
}

function hexToHsv(color: string): HsvColor {
  const hex = normalizeHex(color).slice(1);
  const red = Number.parseInt(hex.slice(0, 2), 16) / 255;
  const green = Number.parseInt(hex.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(hex.slice(4, 6), 16) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min;

  let hue = 0;
  if (delta !== 0) {
    if (max === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (max === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }

  return {
    h: (hue + 360) % 360,
    s: max === 0 ? 0 : delta / max,
    v: max,
  };
}

function hsvToHex({ h, s, v }: HsvColor): string {
  const chroma = v * s;
  const intermediate = chroma * (1 - Math.abs(((h / 60) % 2) - 1));
  const offset = v - chroma;
  let channels: [number, number, number];

  if (h < 60) channels = [chroma, intermediate, 0];
  else if (h < 120) channels = [intermediate, chroma, 0];
  else if (h < 180) channels = [0, chroma, intermediate];
  else if (h < 240) channels = [0, intermediate, chroma];
  else if (h < 300) channels = [intermediate, 0, chroma];
  else channels = [chroma, 0, intermediate];

  return `#${channels
    .map((channel) => Math.round((channel + offset) * 255).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()}`;
}

function colorLuminance(color: string): number {
  const hex = normalizeHex(color).slice(1);
  const channels = [0, 2, 4].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const linear = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

export default function CutlineColorPicker({
  label,
  value,
  onChange,
  className = '',
  disabled = false,
  testId,
  hexInputTestId,
}: CutlineColorPickerProps) {
  const currentColor = normalizeHex(value);
  const hsv = hexToHsv(currentColor);
  const instructionsId = useId();
  const hueInputId = useId();
  const hexInputId = useId();
  const planeRef = useRef<HTMLDivElement>(null);
  const activePointerId = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState(currentColor);
  const [hexFocused, setHexFocused] = useState(false);
  const [sampleError, setSampleError] = useState('');
  const eyeDropperConstructor = typeof window === 'undefined'
    ? undefined
    : (window as Window & { EyeDropper?: EyeDropperConstructor }).EyeDropper;

  useEffect(() => {
    if (!hexFocused) setHexDraft(currentColor);
  }, [currentColor, hexFocused]);

  const updatePlaneFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width === 0 || bounds.height === 0) return;
    const saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const brightness = 1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    onChange(hsvToHex({ ...hsv, s: saturation, v: brightness }));
  };

  const handlePlaneKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.025;
    const next = { ...hsv };
    if (event.key === 'ArrowLeft') next.s = Math.max(0, hsv.s - step);
    else if (event.key === 'ArrowRight') next.s = Math.min(1, hsv.s + step);
    else if (event.key === 'ArrowUp') next.v = Math.min(1, hsv.v + step);
    else if (event.key === 'ArrowDown') next.v = Math.max(0, hsv.v - step);
    else return;
    event.preventDefault();
    onChange(hsvToHex(next));
  };

  const handleHexChange = (nextValue: string) => {
    let sanitized = nextValue.replace(/[^#\da-f]/gi, '').slice(0, 7).toUpperCase();
    if (sanitized && !sanitized.startsWith('#')) sanitized = `#${sanitized}`;
    setHexDraft(sanitized);
    const digits = sanitized.replace(/^#/, '');
    if (/^[\da-f]{6}$/i.test(digits) || /^[\da-f]{3}$/i.test(digits)) {
      onChange(normalizeHex(sanitized));
    }
  };

  const handleEyeDropper = async () => {
    if (!eyeDropperConstructor) return;
    setSampleError('');
    try {
      const result = await new eyeDropperConstructor().open();
      onChange(normalizeHex(result.sRGBHex));
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setSampleError('Could not sample that color. Use the color field or HEX value instead.');
    }
  };

  const handlePlanePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    activePointerId.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return (
    <div className={`cutline-color-picker ${className}`.trim()}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="cutline-color-picker__trigger"
            aria-label={`${label}, ${currentColor}`}
            aria-haspopup="dialog"
            aria-expanded={open}
            disabled={disabled}
            data-testid={testId}
          >
            <span className="cutline-color-picker__trigger-swatch" style={{ backgroundColor: currentColor }} aria-hidden="true" />
            <span className="cutline-color-picker__trigger-value">{currentColor}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          className="cutline-color-picker__popover"
          align="start"
          sideOffset={7}
          aria-label={`${label} color picker`}
          data-testid={testId ? `${testId}-popover` : undefined}
        >
          <div className="cutline-color-picker__heading">
            <div>
              <span className="cutline-color-picker__eyebrow">COLOR</span>
              <h3>{label}</h3>
            </div>
            <span className="cutline-color-picker__heading-swatch" style={{ backgroundColor: currentColor }} aria-hidden="true" />
          </div>

          <div
            ref={planeRef}
            className="cutline-color-picker__plane"
            role="group"
            tabIndex={disabled ? -1 : 0}
            aria-label={`${label} saturation and brightness`}
            aria-describedby={instructionsId}
            style={{ '--cutline-picker-hue': `hsl(${hsv.h} 100% 50%)` } as React.CSSProperties}
            onPointerDown={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.currentTarget.focus();
              activePointerId.current = event.pointerId;
              event.currentTarget.setPointerCapture(event.pointerId);
              updatePlaneFromPointer(event);
            }}
            onPointerMove={(event) => {
              if (activePointerId.current === event.pointerId) updatePlaneFromPointer(event);
            }}
            onPointerUp={handlePlanePointerUp}
            onPointerCancel={handlePlanePointerUp}
            onLostPointerCapture={() => { activePointerId.current = null; }}
            onKeyDown={handlePlaneKeyDown}
            data-testid={testId ? `${testId}-plane` : undefined}
          >
            <span
              className="cutline-color-picker__plane-indicator"
              style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: currentColor }}
              aria-hidden="true"
            />
          </div>
          <span className="cutline-color-picker__sr-only" id={instructionsId}>
            Use left and right arrow keys to adjust saturation and up and down arrow keys to adjust brightness. Hold Shift to make larger changes.
          </span>

          <div className="cutline-color-picker__hue-label">
            <label htmlFor={hueInputId}>Hue</label>
            <output htmlFor={hueInputId}>{Math.round(hsv.h)}°</output>
          </div>
          <input
            id={hueInputId}
            className="cutline-color-picker__hue"
            type="range"
            min="0"
            max="360"
            step="1"
            value={Math.round(hsv.h)}
            aria-label={`${label} hue`}
            disabled={disabled}
            onChange={(event) => onChange(hsvToHex({ ...hsv, h: Number(event.currentTarget.value) }))}
            data-testid={testId ? `${testId}-hue` : undefined}
          />

          <div className="cutline-color-picker__value-row">
            <label htmlFor={hexInputId}>HEX</label>
            <input
              id={hexInputId}
              className="cutline-color-picker__hex"
              type="text"
              value={hexDraft}
              maxLength={7}
              spellCheck={false}
              autoComplete="off"
              aria-label={`${label} HEX value`}
              aria-invalid={hexDraft.length > 0 && !/^#(?:[\da-f]{6}|[\da-f]{3})$/i.test(hexDraft)}
              disabled={disabled}
              data-testid={hexInputTestId}
              onFocus={() => setHexFocused(true)}
              onChange={(event) => handleHexChange(event.currentTarget.value)}
              onBlur={() => {
                setHexFocused(false);
                setHexDraft(currentColor);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <button
              type="button"
              className="cutline-color-picker__eyedropper"
              aria-label="Sample a color from the screen"
              title={eyeDropperConstructor ? 'Sample a color from the screen' : 'Screen color sampling is not supported in this browser'}
              disabled={disabled || !eyeDropperConstructor}
              onClick={() => { void handleEyeDropper(); }}
            >
              <Pipette size={15} aria-hidden="true" />
            </button>
          </div>
          {sampleError && <p className="cutline-color-picker__error" role="status">{sampleError}</p>}

          <div className="cutline-color-picker__palette-heading">Quick colors</div>
          <div className="cutline-color-picker__palette" aria-label={`${label} quick colors`}>
            {QUICK_COLORS.map((color) => {
              const selected = currentColor === color.value;
              const checkColor = colorLuminance(color.value) > 0.43 ? '#171A1F' : '#FFFFFF';
              return (
                <button
                  key={color.value}
                  type="button"
                  className={`cutline-color-picker__palette-swatch${selected ? ' is-selected' : ''}`}
                  style={{ backgroundColor: color.value, '--cutline-swatch-check': checkColor } as React.CSSProperties}
                  aria-label={`${color.name}, ${color.value}`}
                  aria-pressed={selected}
                  title={color.name}
                  disabled={disabled}
                  onClick={() => onChange(color.value)}
                >
                  {selected && <Check size={12} aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
