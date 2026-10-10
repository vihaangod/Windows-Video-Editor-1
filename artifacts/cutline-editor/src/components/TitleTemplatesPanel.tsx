import { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Type, X } from 'lucide-react';
import type { TextAnimation, TextBackgroundStyle } from '@/lib/composition';
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
  category?: string;
  animation?: TextAnimation;
  duration?: number;
  fontStyle?: 'normal' | 'italic';
  backgroundStyle?: TextBackgroundStyle;
  previewBackground?: string;
  letterSpacing?: string;
};

export const TITLE_TEMPLATES: TitleTemplate[] = [
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
  {
    id: 'typewriter-reveal',
    name: 'Typewriter reveal',
    text: 'TRANSMISSION\nINCOMING_',
    fontFamily: 'Consolas, "Courier New", monospace',
    fontSize: 62,
    fontWeight: 700,
    color: '#b7f7d2',
    align: 'left',
    x: 0.12,
    y: 0.2,
    backgroundColor: 'rgba(7, 25, 28, .84)',
    outlineColor: '#102c2b',
    outlineWidth: 0,
    shadow: true,
    opacity: 1,
    category: 'Animated heading',
    animation: 'typing',
    duration: 5,
    previewBackground: 'radial-gradient(ellipse at 68% 40%, rgba(67, 198, 151, .42), transparent 34%), linear-gradient(125deg, #132c2c, #265448 48%, #121d2a)',
    letterSpacing: '.09em',
  },
  {
    id: 'word-reveal',
    name: 'Word-by-word reveal',
    text: 'EVERY SECOND\nMATTERS',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 82,
    fontWeight: 700,
    color: '#f8ead1',
    align: 'center',
    x: 0.5,
    y: 0.46,
    backgroundColor: '',
    outlineColor: '#251d17',
    outlineWidth: 1,
    shadow: true,
    opacity: 1,
    category: 'Animated heading',
    animation: 'word-reveal',
    duration: 5,
    previewBackground: 'radial-gradient(ellipse at 50% 40%, rgba(219, 176, 113, .4), transparent 34%), linear-gradient(120deg, #55412f, #9c7552 47%, #25323a)',
    letterSpacing: '.1em',
  },
  {
    id: 'pop-in-title',
    name: 'Pop-in title',
    text: 'LEVEL UP',
    fontFamily: 'Impact, "Arial Narrow", sans-serif',
    fontSize: 116,
    fontWeight: 900,
    color: '#fff04e',
    align: 'center',
    x: 0.5,
    y: 0.5,
    backgroundColor: '',
    outlineColor: '#612caa',
    outlineWidth: 8,
    shadow: true,
    opacity: 1,
    category: 'Gaming',
    animation: 'pop-in',
    duration: 4,
    previewBackground: 'radial-gradient(ellipse at 50% 48%, rgba(225, 74, 208, .56), transparent 34%), linear-gradient(130deg, #292757, #654b91 44%, #172c43)',
    letterSpacing: '.025em',
  },
  {
    id: 'outline-editorial',
    name: 'Outline editorial',
    text: 'THE\nUNKNOWN',
    fontFamily: 'Arial, sans-serif',
    fontSize: 100,
    fontWeight: 900,
    color: '#f7f2e9',
    align: 'left',
    x: 0.11,
    y: 0.52,
    backgroundColor: '',
    outlineColor: '#111820',
    outlineWidth: 4,
    shadow: false,
    opacity: 1,
    category: 'Cinematic',
    duration: 6,
    previewBackground: 'radial-gradient(ellipse at 78% 32%, rgba(141, 164, 176, .48), transparent 30%), linear-gradient(115deg, #253540, #53616a 52%, #171f26)',
    letterSpacing: '.16em',
  },
  {
    id: 'glass-caption',
    name: 'Glass caption',
    text: 'A moment\nworth keeping',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 62,
    fontWeight: 500,
    color: '#fffaf2',
    align: 'center',
    x: 0.5,
    y: 0.77,
    backgroundColor: 'rgba(22, 29, 34, .66)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: true,
    opacity: 1,
    category: 'Subtitle',
    duration: 6,
    backgroundStyle: { enabled: true, opacity: .82, padding: 24, radius: 22, width: 1050, height: 210, borderColor: 'rgba(255,255,255,.35)', borderWidth: 2 },
    previewBackground: 'radial-gradient(ellipse at 66% 34%, rgba(193, 199, 178, .42), transparent 32%), linear-gradient(120deg, #40525a, #777b68 48%, #27393c)',
  },
  {
    id: 'subscribe-cta',
    name: 'Subscribe CTA',
    text: 'SUBSCRIBE  ▶',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 48,
    fontWeight: 900,
    color: '#ffffff',
    align: 'center',
    x: 0.5,
    y: 0.86,
    backgroundColor: '#c93632',
    outlineColor: '#551916',
    outlineWidth: 1,
    shadow: true,
    opacity: 1,
    category: 'Call to action',
    animation: 'pop-in',
    duration: 5,
    backgroundStyle: { enabled: true, opacity: 1, padding: 20, radius: 18, width: 520, height: 100 },
    previewBackground: 'radial-gradient(ellipse at 48% 42%, rgba(227, 90, 69, .4), transparent 30%), linear-gradient(120deg, #31343b, #6c5145 48%, #202b34)',
  },
  {
    id: 'chapter-marker',
    name: 'Chapter marker',
    text: 'CHAPTER 04\nTHE TURNING POINT',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 58,
    fontWeight: 600,
    color: '#f5ca78',
    align: 'left',
    x: 0.1,
    y: 0.76,
    backgroundColor: 'rgba(15, 20, 24, .82)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: false,
    opacity: 1,
    category: 'Chapter heading',
    animation: 'fade-in',
    duration: 5,
    backgroundStyle: { enabled: true, opacity: .82, padding: 22, radius: 0, width: 1120, height: 180, borderColor: '#d29343', borderWidth: 3 },
    previewBackground: 'radial-gradient(ellipse at 72% 40%, rgba(215, 161, 87, .4), transparent 30%), linear-gradient(120deg, #313b3e, #765941 49%, #1d282f)',
    letterSpacing: '.06em',
  },
  {
    id: 'creator-lower-third',
    name: 'Creator lower third',
    text: 'JORDAN LEE\nCREATOR · EDITOR',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 42,
    fontWeight: 750,
    color: '#f5f5f1',
    align: 'left',
    x: 0.12,
    y: 0.82,
    backgroundColor: 'rgba(16, 24, 31, .9)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: true,
    opacity: 1,
    category: 'Lower third',
    animation: 'slide-up',
    duration: 6,
    backgroundStyle: { enabled: true, opacity: .9, padding: 18, radius: 4, width: 720, height: 150, borderColor: '#62c3ba', borderWidth: 4 },
    previewBackground: 'radial-gradient(ellipse at 72% 36%, rgba(87, 184, 170, .34), transparent 30%), linear-gradient(120deg, #2d4347, #556863 48%, #1c2a34)',
  },
  {
    id: 'outro-endcard',
    name: 'YouTube outro end card',
    text: 'THANKS FOR WATCHING\nSEE YOU NEXT TIME',
    fontFamily: '"Segoe UI", Tahoma, sans-serif',
    fontSize: 52,
    fontWeight: 800,
    color: '#fff4dd',
    align: 'center',
    x: 0.5,
    y: 0.5,
    backgroundColor: 'rgba(17, 23, 33, .74)',
    outlineColor: '',
    outlineWidth: 0,
    shadow: true,
    opacity: 1,
    category: 'YouTube outro',
    animation: 'fade-in',
    duration: 7,
    backgroundStyle: { enabled: true, opacity: .74, padding: 30, radius: 10, width: 1200, height: 300, borderColor: 'rgba(255,255,255,.18)', borderWidth: 1 },
    previewBackground: 'radial-gradient(ellipse at 50% 45%, rgba(94, 124, 184, .42), transparent 33%), linear-gradient(120deg, #222f47, #536277 48%, #1a222f)',
    letterSpacing: '.055em',
  },
  {
    id: 'minimal-heading',
    name: 'Modern minimal heading',
    text: 'SLOW\nMORNINGS',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontSize: 96,
    fontWeight: 400,
    color: '#f3e8d4',
    align: 'center',
    x: 0.5,
    y: 0.48,
    backgroundColor: '',
    outlineColor: '',
    outlineWidth: 0,
    shadow: false,
    opacity: 0.94,
    category: 'Minimal',
    animation: 'slide-up',
    duration: 5,
    previewBackground: 'radial-gradient(ellipse at 52% 38%, rgba(205, 177, 132, .42), transparent 32%), linear-gradient(125deg, #5f695f, #909079 47%, #394a48)',
    letterSpacing: '.17em',
  },
];

const TEMPLATE_CATEGORIES: Record<string, string> = {
  'gaming-title': 'Cinematic title',
  subtitle: 'Subtitle',
  'lower-third': 'Lower third',
  'title-card': 'Cinematic title',
  'social-caption': 'Social media',
  'basic-text': 'Minimal',
  'minecraft-highlight': 'Gaming',
  'kill-counter': 'Gaming',
  'round-heading': 'Chapter heading',
  'highlight-banner': 'Call to action',
};

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
    fontStyle: template.fontStyle,
    textAlign: template.align,
    transform: `translate(${template.align === 'center' ? '-50%' : template.align === 'right' ? '-100%' : '0'}, -50%)`,
    opacity: template.opacity,
    backgroundColor: template.backgroundColor || 'transparent',
    WebkitTextStroke: template.outlineWidth
      ? `${Math.max(0.5, template.outlineWidth / 4)}px ${template.outlineColor}`
      : undefined,
    textShadow: template.shadow ? '0 2px 9px rgba(0, 0, 0, .68)' : undefined,
    letterSpacing: template.letterSpacing,
  } as const;
}

export default function TitleTemplatesPanel({ onAdd }: TitleTemplatesPanelProps) {
  const [query, setQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState<TitleTemplate | null>(null);
  useEffect(() => {
    if (!previewTemplate) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewTemplate(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewTemplate]);
  const normalizedQuery = query.trim().toLowerCase();
  const visibleTemplates = useMemo(
    () => TITLE_TEMPLATES.filter((template) =>
      `${template.name} ${template.text} ${template.category || TEMPLATE_CATEGORIES[template.id] || ''}`.toLowerCase().includes(normalizedQuery),
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
              style={template.previewBackground ? { backgroundImage: template.previewBackground } : undefined}
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
              <span>{template.category || TEMPLATE_CATEGORIES[template.id] || 'Title'} <i aria-hidden="true">·</i> {template.animation ? template.animation.replace('-', ' ') : 'static'}</span>
              </div>
              <button
                type="button"
              className="cutline-template-card__add"
              onClick={() => setPreviewTemplate(template)}
              aria-label={`Preview ${template.name}`}
              data-testid={`button-preview-title-template-${template.id}`}
              >
              <span>Preview</span>
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
      {previewTemplate && <div className="cutline-template-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewTemplate(null); }}>
        <section className="cutline-template-dialog" role="dialog" aria-modal="true" aria-label={`${previewTemplate.name} preview`}>
          <header>
            <div><span>{previewTemplate.category || TEMPLATE_CATEGORIES[previewTemplate.id] || 'Title'}</span><h3>{previewTemplate.name}</h3></div>
            <button type="button" aria-label="Close preview" onClick={() => setPreviewTemplate(null)}><X size={16} /></button>
          </header>
          <div
            className={`cutline-template-preview cutline-template-preview--${previewTemplate.id} cutline-template-dialog__preview`}
            style={previewTemplate.previewBackground ? { backgroundImage: previewTemplate.previewBackground } : undefined}
            role="img"
            aria-label={`Design preview: ${previewTemplate.text.replaceAll('\n', ' ')}`}
          >
            <span className="cutline-template-preview__text" style={previewTextStyle(previewTemplate)}>
              {previewTemplate.text.split('\n').map((line, lineIndex) => <span key={`${previewTemplate.id}-dialog-line-${lineIndex}`}>{line}</span>)}
            </span>
          </div>
          <p>Editable text clip · {previewTemplate.duration ?? 5}s · {previewTemplate.animation || 'No animation'}</p>
          <div className="cutline-template-dialog__actions">
            <button type="button" onClick={() => setPreviewTemplate(null)}>Cancel</button>
            <button type="button" onClick={() => { onAdd({ ...previewTemplate }); setPreviewTemplate(null); }} data-testid={`button-add-title-template-${previewTemplate.id}`}><Plus size={14} />Add to timeline</button>
          </div>
        </section>
      </div>}
    </section>
  );
}
