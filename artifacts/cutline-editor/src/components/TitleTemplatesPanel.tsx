import { useMemo, useState } from 'react';
import { Plus, Search, Type } from 'lucide-react';
import './title-templates-panel.css';

export type TitleTemplate = {
  id: string;
  name: string;
  text: string;
  fontFamily: string;
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
};

const TITLE_TEMPLATES: TitleTemplate[] = [
  {
    id: 'gaming-title',
    name: 'Gaming title',
    text: 'THE FINAL\nROUND',
    fontFamily: 'Impact, "Arial Narrow", sans-serif',
    fontSize: 104,
    fontWeight: 900,
    color: '#fff4d7',
    align: 'center',
    x: 0.5,
    y: 0.5,
    backgroundColor: '',
    outlineColor: '#d38432',
    outlineWidth: 5,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'subtitle',
    name: 'Subtitle',
    text: 'Somewhere beyond the shoreline',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 42,
    fontWeight: 500,
    color: '#fff8e9',
    align: 'center',
    x: 0.5,
    y: 0.84,
    backgroundColor: 'rgba(19, 23, 29, 0.78)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'lower-third',
    name: 'Lower third',
    text: 'MARA VOSS\nFIELD PRODUCER',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 40,
    fontWeight: 700,
    color: '#f4eee3',
    align: 'left',
    x: 0.1,
    y: 0.78,
    backgroundColor: 'rgba(27, 31, 37, 0.92)',
    outlineColor: '#e6a748',
    outlineWidth: 0,
    shadow: false,
    opacity: 1,
  },
  {
    id: 'title-card',
    name: 'Title card',
    text: 'A QUIETER\nKIND OF WILD',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 78,
    fontWeight: 600,
    color: '#f3c46b',
    align: 'center',
    x: 0.5,
    y: 0.5,
    backgroundColor: 'rgba(18, 24, 27, 0.72)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: false,
    opacity: 0.96,
  },
  {
    id: 'social-caption',
    name: 'Social caption',
    text: 'wait for the light to change',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 48,
    fontWeight: 800,
    color: '#ffffff',
    align: 'center',
    x: 0.5,
    y: 0.72,
    backgroundColor: 'rgba(14, 16, 19, 0.82)',
    outlineColor: '#17191d',
    outlineWidth: 1,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'basic-text',
    name: 'Basic text',
    text: 'Add your text',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 64,
    fontWeight: 650,
    color: '#ffffff',
    align: 'center',
    x: 0.5,
    y: 0.5,
    backgroundColor: '',
    outlineColor: '#111820',
    outlineWidth: 1,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'minecraft-highlight',
    name: 'Minecraft highlight',
    text: '1 HP\nCLUTCH!',
    fontFamily: 'Impact, "Arial Narrow", sans-serif',
    fontSize: 108,
    fontWeight: 900,
    color: '#d4ff65',
    align: 'center',
    x: 0.5,
    y: 0.5,
    backgroundColor: '',
    outlineColor: '#142016',
    outlineWidth: 7,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'kill-counter',
    name: 'Kill counter',
    text: 'ELIMINATIONS  03',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 30,
    fontWeight: 800,
    color: '#ffffff',
    align: 'right',
    x: 0.94,
    y: 0.09,
    backgroundColor: 'rgba(15, 21, 19, 0.78)',
    outlineColor: '#263528',
    outlineWidth: 1,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'round-heading',
    name: 'Round heading',
    text: 'ROUND 01\nFINAL FIGHT',
    fontFamily: 'Impact, "Arial Narrow", sans-serif',
    fontSize: 76,
    fontWeight: 900,
    color: '#fff3d1',
    align: 'left',
    x: 0.09,
    y: 0.2,
    backgroundColor: 'rgba(18, 22, 28, 0.68)',
    outlineColor: '#17191d',
    outlineWidth: 2,
    shadow: true,
    opacity: 1,
  },
  {
    id: 'highlight-banner',
    name: 'Highlight banner',
    text: 'NEW PERSONAL BEST!',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 48,
    fontWeight: 900,
    color: '#161c21',
    align: 'center',
    x: 0.5,
    y: 0.78,
    backgroundColor: 'rgba(240, 186, 80, 0.94)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: true,
    opacity: 1,
  },
];

type TitleTemplatesPanelProps = {
  onAdd: (template: TitleTemplate) => void;
};

function previewTextStyle(template: TitleTemplate) {
  return {
    left: `${template.x * 100}%`,
    top: `${template.y * 100}%`,
    color: template.color,
    fontFamily: template.fontFamily,
    fontSize: `clamp(9px, ${template.fontSize / 16}cqw, 27px)`,
    fontWeight: template.fontWeight,
    textAlign: template.align,
    transform: `translate(${template.align === 'center' ? '-50%' : template.align === 'right' ? '-100%' : '0'}, -50%)`,
    opacity: template.opacity,
    backgroundColor: template.backgroundColor || 'transparent',
    WebkitTextStroke: template.outlineWidth
      ? `${Math.max(0.5, template.outlineWidth / 4)}px ${template.outlineColor}`
      : undefined,
    textShadow: template.shadow ? '0 2px 9px rgba(0, 0, 0, .68)' : undefined,
  } as const;
}

export default function TitleTemplatesPanel({ onAdd }: TitleTemplatesPanelProps) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = useMemo(
    () => TITLE_TEMPLATES.filter((template) =>
      `${template.name} ${template.text}`.toLowerCase().includes(normalizedQuery),
    ),
    [normalizedQuery],
  );

  return (
    <section className="cutline-title-templates" aria-label="Title templates" data-testid="panel-title-templates">
      <header className="cutline-title-templates__header">
        <div className="cutline-title-templates__heading">
          <span className="cutline-title-templates__icon" aria-hidden="true"><Type size={16} /></span>
          <div>
            <p className="cutline-title-templates__eyebrow">TEXT &amp; TITLES</p>
            <h2>Title templates</h2>
          </div>
          <span className="cutline-title-templates__count" aria-label={`${visibleTemplates.length} templates`}>
            {String(visibleTemplates.length).padStart(2, '0')}
          </span>
        </div>
        <p className="cutline-title-templates__intro">Start with a look. Fine-tune it on the canvas.</p>
        <label className="cutline-title-templates__search">
          <Search size={15} aria-hidden="true" />
          <span className="cutline-sr-only">Search title templates</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a style…"
            data-testid="input-search-title-templates"
          />
          {query && (
            <button
              type="button"
              className="cutline-title-templates__clear"
              aria-label="Clear template search"
              onClick={() => setQuery('')}
              data-testid="button-clear-template-search"
            >
              Clear
            </button>
          )}
        </label>
      </header>

      <div className="cutline-title-templates__list" aria-live="polite">
        {visibleTemplates.map((template, index) => (
          <article
            className="cutline-template-card"
            key={template.id}
            style={{ animationDelay: `${index * 45}ms` }}
            data-testid={`card-title-template-${template.id}`}
          >
            <div
              className={`cutline-template-preview cutline-template-preview--${template.id}`}
              aria-label={`${template.name} preview`}
              role="img"
              data-testid={`preview-title-template-${template.id}`}
            >
              <span className="cutline-template-preview__frame-mark cutline-template-preview__frame-mark--tl" />
              <span className="cutline-template-preview__frame-mark cutline-template-preview__frame-mark--br" />
              <span className="cutline-template-preview__ratio">16:9</span>
              <span className="cutline-template-preview__text" style={previewTextStyle(template)}>
                {template.text.split('\n').map((line, lineIndex) => (
                  <span key={`${template.id}-line-${lineIndex}`}>{line}</span>
                ))}
              </span>
            </div>
            <div className="cutline-template-card__footer">
              <div className="cutline-template-card__copy">
                <h3>{template.name}</h3>
                <span>{template.fontSize}px <i aria-hidden="true">·</i> {template.align}</span>
              </div>
              <button
                type="button"
                className="cutline-template-card__add"
                onClick={() => onAdd({ ...template })}
                aria-label={`Add ${template.name} to timeline`}
                data-testid={`button-add-title-template-${template.id}`}
              >
                <Plus size={15} aria-hidden="true" />
                <span>Add</span>
              </button>
            </div>
          </article>
        ))}
        {visibleTemplates.length === 0 && (
          <div className="cutline-title-templates__empty" data-testid="empty-title-templates">
            <span className="cutline-title-templates__empty-icon" aria-hidden="true"><Search size={18} /></span>
            <strong>No matching styles</strong>
            <p>Try another phrase, or clear your search to see every title.</p>
            <button type="button" onClick={() => setQuery('')} data-testid="button-reset-template-search">
              Show all templates
            </button>
          </div>
        )}
      </div>
      <p className="cutline-title-templates__footnote">Add a title, then adjust its timing in the timeline.</p>
    </section>
  );
}
