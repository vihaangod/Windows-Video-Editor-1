import {
  ArrowDownRight, ArrowRight, Circle, Eraser, Highlighter, Minus, MousePointer2,
  Pencil, Redo2, Square, Trash2, Type, Undo2,
} from 'lucide-react';
import type { MarkupDrawing, MarkupTool } from '@/lib/composition';
import CutlineSelect from '@/components/CutlineSelect';
import CutlineColorPicker from '@/components/CutlineColorPicker';

type Props = {
  tool: MarkupTool | 'eraser';
  color: string;
  fillColor: string;
  size: number;
  opacity: number;
  fillOpacity: number;
  duration: number;
  lineStyle: MarkupDrawing['lineStyle'];
  noteText: string;
  drawings: MarkupDrawing[];
  canUndo: boolean;
  canRedo: boolean;
  onTool: (tool: MarkupTool | 'eraser') => void;
  onColor: (color: string) => void;
  onFillColor: (color: string) => void;
  onSize: (value: number) => void;
  onOpacity: (value: number) => void;
  onFillOpacity: (value: number) => void;
  onDuration: (value: number) => void;
  onLineStyle: (style: MarkupDrawing['lineStyle']) => void;
  onNoteText: (value: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
};

const TOOLS: Array<{ id: MarkupTool | 'eraser'; label: string; icon: typeof Pencil }> = [
  { id: 'pen', label: 'Pen', icon: Pencil },
  { id: 'highlighter', label: 'Highlighter', icon: Highlighter },
  { id: 'arrow', label: 'Arrow', icon: ArrowDownRight },
  { id: 'line', label: 'Straight line', icon: ArrowRight },
  { id: 'rectangle', label: 'Rectangle', icon: Square },
  { id: 'ellipse', label: 'Ellipse', icon: Circle },
  { id: 'text', label: 'Text note', icon: Type },
  { id: 'eraser', label: 'Eraser', icon: Eraser },
];

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${(safe % 60).toFixed(1).padStart(4, '0')}`;
}

export default function MarkupWorkspace(props: Props) {
  return (
    <section className="cutline-markup" data-testid="panel-markup" aria-label="Markup tools">
      <header className="cutline-markup__header">
        <span className="cutline-effect-workspace__eyebrow">VIDEO ANNOTATION</span>
        <h2>Markup</h2>
        <p>Draw on the preview. Markups are saved with the project and rendered in exports.</p>
      </header>

      <div className="cutline-markup__history">
        <button type="button" className="btn flat" onClick={props.onUndo} disabled={!props.canUndo} data-testid="button-markup-undo"><Undo2 size={13} />Undo</button>
        <button type="button" className="btn flat" onClick={props.onRedo} disabled={!props.canRedo} data-testid="button-markup-redo"><Redo2 size={13} />Redo</button>
        <span>Click-drag on video</span>
      </div>

      <div className="cutline-markup__tools" role="toolbar" aria-label="Markup tools">
        {TOOLS.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            className={props.tool === id ? 'is-active' : ''}
            aria-label={label}
            aria-pressed={props.tool === id}
            title={label}
            onClick={() => props.onTool(id)}
            data-testid={`button-markup-tool-${id}`}
          ><Icon size={15} /></button>
        ))}
      </div>

      <div className="cutline-markup__settings">
        <div className="cutline-markup__color-field">
          <span>Stroke color</span>
          <span className="cutline-markup__color-row">
            <CutlineColorPicker
              className="cutline-markup__color-picker"
              label="Stroke color"
              value={props.color}
              testId="input-markup-color"
              hexInputTestId="input-markup-hex"
              onChange={props.onColor}
            />
          </span>
        </div>
        <div className="cutline-markup__swatches" aria-label="Recent markup colors">
          {['#f9b643', '#ff3b30', '#ffd60a', '#32d74b', '#0a84ff', '#ffffff', '#ff00ff'].map((swatch) => (
            <button type="button" key={swatch} style={{ background: swatch }} aria-label={`Use ${swatch} stroke color`} title={swatch} onClick={() => props.onColor(swatch)} />
          ))}
        </div>
        <div className="cutline-markup__color-field">
          <span>Shape fill</span>
          <span className="cutline-markup__color-row">
            <CutlineColorPicker
              className="cutline-markup__color-picker"
              label="Shape fill"
              value={props.fillColor}
              testId="input-markup-fill-color"
              onChange={props.onFillColor}
            />
            <input type="range" min="0" max="80" step="1" value={props.fillOpacity} onChange={(event) => props.onFillOpacity(Number(event.currentTarget.value))} aria-label="Shape fill opacity" data-testid="slider-markup-fill-opacity" />
          </span>
        </div>

        {props.tool === 'text' && <label className="cutline-markup__field">
          <span>Note text</span>
          <input type="text" value={props.noteText} maxLength={180} onChange={(event) => props.onNoteText(event.currentTarget.value)} placeholder="Type a note to place on the video" data-testid="input-markup-note" />
        </label>}

        <label className="cutline-markup__field">
          <span>Brush size <strong>{props.size}px</strong></span>
          <input type="range" min="2" max="32" step="1" value={props.size} onChange={(event) => props.onSize(Number(event.currentTarget.value))} aria-label="Brush size" data-testid="slider-markup-size" />
        </label>
        <label className="cutline-markup__field">
          <span>Opacity <strong>{props.opacity}%</strong></span>
          <input type="range" min="10" max="100" step="1" value={props.opacity} onChange={(event) => props.onOpacity(Number(event.currentTarget.value))} aria-label="Markup opacity" data-testid="slider-markup-opacity" />
        </label>
        <label className="cutline-markup__field">
          <span>Visible duration <strong>{props.duration.toFixed(1)}s</strong></span>
          <input type="range" min=".5" max="30" step=".5" value={props.duration} onChange={(event) => props.onDuration(Number(event.currentTarget.value))} aria-label="Markup duration" data-testid="slider-markup-duration" />
        </label>
        <label className="cutline-markup__field">
          <span>Line style</span>
          <CutlineSelect
            value={props.lineStyle}
            options={[{ value: 'solid', label: 'Solid' }, { value: 'dashed', label: 'Dashed' }, { value: 'dotted', label: 'Dotted' }]}
            onValueChange={(value) => props.onLineStyle(value as MarkupDrawing['lineStyle'])}
            aria-label="Markup line style"
            data-testid="select-markup-line-style"
          />
        </label>
      </div>

      <div className="cutline-markup__list-heading">
        <strong>Drawings</strong>
        <button type="button" className="btn flat" disabled={!props.drawings.length} onClick={props.onClear} data-testid="button-markup-clear"><Trash2 size={13} />Clear all</button>
      </div>
      <div className="cutline-markup__list">
        {props.drawings.length ? props.drawings.map((drawing, index) => (
          <div className="cutline-markup__drawing" key={drawing.id} data-testid={`row-markup-${drawing.id}`}>
            <span className="cutline-markup__swatch" style={{ background: drawing.color }} />
            <span><strong>{drawing.tool === 'text' ? drawing.content || 'Note' : `${drawing.tool} ${index + 1}`}</strong><small>{formatTime(drawing.start)}–{formatTime(drawing.end)}</small></span>
            <button type="button" aria-label={`Delete markup ${drawing.tool} ${index + 1}`} onClick={() => props.onRemove(drawing.id)} data-testid={`button-remove-markup-${drawing.id}`}><Trash2 size={13} /></button>
          </div>
        )) : <p className="cutline-markup__empty"><MousePointer2 size={15} />No drawings yet. Select a tool and draw over the preview.</p>}
      </div>
    </section>
  );
}
