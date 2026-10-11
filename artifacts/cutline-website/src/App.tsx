import { ArrowDown, ArrowRight, AudioLines, Check, Cloud, Download, Film, HardDrive, Layers3, LockKeyhole, Monitor, MousePointer2, Play, Sparkles, Type, WandSparkles, Waves } from 'lucide-react';
import cutlineLogo from '../../cutline-editor/src/assets/cutline-app-icon.svg';
import { TeamSection } from './components/TeamSection';

const CUTLINE_DOWNLOAD_URL =
  import.meta.env.VITE_CUTLINE_DOWNLOAD_URL ||
  'https://downloads.example.com/cutline/Cutline-1.0.0-Setup.exe';
const PUBLIC_ASSET_BASE = import.meta.env.BASE_URL;

const highlights = [
  { icon: Layers3, title: 'A timeline with room to think', text: 'Arrange video, audio, and text on separate tracks. Shape a sequence at your pace, without losing sight of the whole.' },
  { icon: Play, title: 'See the cut as it comes together', text: 'Preview your composition while you work, then refine clip timing and playback from the editor.' },
  { icon: Type, title: 'Give the frame a voice', text: 'Layer in titles and text overlays. Add filters, transitions, and markup to make the story feel like yours.' },
  { icon: HardDrive, title: 'Your media stays yours', text: 'Projects and source media live on your PC. Optional Supabase sync is for project state; actual media files remain local.' },
];

function DownloadLink({ className = '' }: { className?: string }) {
  return (
    <a className={`download-link focus-ring ${className}`} href={CUTLINE_DOWNLOAD_URL} aria-describedby="download-status">
      <Download size={18} strokeWidth={2.2} />
      <span>Download for Windows</span>
      <ArrowRight size={17} />
    </a>
  );
}

function App() {
  return (
    <div className="page-grain min-h-[100dvh]">
      <header className="site-header">
        <div className="nav-shell">
          <a className="brand focus-ring" href="#top" aria-label="Cutline home">
            <img src={cutlineLogo} alt="" />
            <span>cutline<span className="brand-period">.</span></span>
          </a>
          <nav aria-label="Main navigation" className="main-nav">
            <a className="focus-ring" href="#editor">The editor</a>
            <a className="focus-ring" href="#local-first">Local by design</a>
            <a className="focus-ring" href="#requirements">Requirements</a>
            <a className="focus-ring" href="#team">The team</a>
          </nav>
          <a href="#download" className="nav-download focus-ring">Get Cutline <ArrowDown size={14} /></a>
        </div>
      </header>

      <main id="top">
        <section className="hero section-wrap">
          <div className="hero-copy">
            <div className="eyebrow reveal"><span className="live-dot" /> A video editor, on your terms</div>
            <h1 className="reveal reveal-delay">Make the cut.<br /><em>Keep control.</em></h1>
            <p className="hero-lede reveal reveal-delay">Cutline is a local-first video editor for independent creators. Bring your footage, build your sequence, and keep the working files on your own PC.</p>
            <div className="hero-actions reveal reveal-delay">
              <DownloadLink />
              <span className="hero-version mono">VERSION 1.0.0&nbsp; / &nbsp;WINDOWS X64</span>
            </div>
            <p className="not-hosted" id="download-status"><span aria-hidden="true">i</span> The installer is not hosted yet. This download link is a placeholder until a release is published.</p>
            <div className="hero-trust"><LockKeyhole size={14} /> Local media. Optional project-state sync.</div>
          </div>
          <div className="hero-art" aria-label="Cutline editor interface preview">
            <div className="hero-kicker mono">A WORKSPACE FOR THE WORK</div>
            <div className="frame-tilt screen-frame">
              <img src={`${PUBLIC_ASSET_BASE}cutline-editor-workspace.png`} alt="Cutline editor workspace showing the preview canvas, media panel, inspector, and multitrack timeline." />
              <div className="image-caption"><span><span className="caption-dot" /> CUTLINE / EDITOR</span><span>01 — WORKSPACE</span></div>
            </div>
            <div className="hero-stamp"><span className="stamp-top mono">EDIT LOCALLY</span><span className="stamp-mark">C<span>↗</span></span><span className="stamp-bottom mono">EXPORT ON YOUR TERMS</span></div>
          </div>
          <div className="hero-bottomline"><span>BUILT FOR INDEPENDENT CREATORS</span><span>LESS FRICTION. MORE FINISH.</span><a href="#editor" className="focus-ring">SCROLL TO EXPLORE <ArrowDown size={12} /></a></div>
        </section>

        <section className="manifesto" id="local-first">
          <div className="manifesto-inner">
            <div className="section-label mono"><span>01</span> / THE CUTLINE APPROACH</div>
            <p className="manifesto-quote">Your footage isn’t a cloud problem.<br /><span>It’s your story, on your machine.</span></p>
            <div className="manifesto-foot"><p>Cutline is made for creators who want a straightforward place to shape a video—and know where their project lives.</p><div className="manifesto-sign mono">PRIVATE BY DEFAULT<br />PRACTICAL BY DESIGN</div></div>
          </div>
        </section>

        <section className="editor-section section-wrap" id="editor">
          <div className="section-heading">
            <div className="section-label mono"><span>02</span> / THE WORKSPACE</div>
            <div className="heading-row"><h2>Everything in<br /><em>the frame.</em></h2><p>One focused workspace for the parts of editing that move a project forward: organize clips, watch the composition, and work across tracks.</p></div>
          </div>
          <figure className="editor-shot screen-frame">
            <img src={`${PUBLIC_ASSET_BASE}cutline-project-library.jpg`} alt="Cutline project library on device, with project folders, import actions, and an optional cloud projects panel." loading="lazy" />
          </figure>
          <div className="shot-note"><span className="mono">02 / PROJECTS ON THIS DEVICE</span><p>Organize projects locally. If you choose to sign in, project-state sync is optional; video and audio media stay on this device.</p></div>
          <div className="feature-list">
            {highlights.map(({ icon: Icon, title, text }, i) => (
              <article className="feature-row" key={title}>
                <span className="feature-number mono">0{i + 1}</span>
                <span className="feature-icon"><Icon size={19} strokeWidth={1.7} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
                <ArrowRight className="feature-arrow" size={16} />
              </article>
            ))}
          </div>
        </section>

        <section className="tools-band">
          <div className="tools-inner">
            <div className="section-label mono"><span>03</span> / A GOOD SET OF TOOLS</div>
            <h2>From first clip<br />to <em>final frame.</em></h2>
            <div className="tools-grid">
              <div className="tool-note"><span className="tool-icon"><Film /></span><div><h3>Multitrack editing</h3><p>Arrange clips across video, audio, and text tracks in a dedicated timeline.</p></div></div>
              <div className="tool-note"><span className="tool-icon"><AudioLines /></span><div><h3>Preview as you shape</h3><p>See and hear your composition in the video and audio preview as you edit.</p></div></div>
              <div className="tool-note"><span className="tool-icon"><WandSparkles /></span><div><h3>Style the sequence</h3><p>Work with titles, text overlays, filters, transitions, and markup.</p></div></div>
              <div className="tool-note"><span className="tool-icon"><Cloud /></span><div><h3>Sync project state, optionally</h3><p>Supabase sync can keep project state in step. It does not upload your media files.</p></div></div>
            </div>
            <div className="tools-footer"><span className="mono">TOOLS FOR YOUR NEXT GOOD IDEA</span><Sparkles size={18} /></div>
          </div>
        </section>

        <TeamSection />

        <section className="download-section" id="download">
          <div className="download-inner">
            <div className="download-copy">
              <div className="section-label mono"><span>05</span> / READY WHEN YOU ARE</div>
              <h2>Make something<br /><em>worth keeping.</em></h2>
              <p>Cutline 1.0.0 is built for Windows x64. Give it a home on your PC and bring the footage you want to work with.</p>
              <DownloadLink className="download-large" />
              <p className="not-hosted download-warning"><span aria-hidden="true">i</span> The installer is not hosted yet. The button uses a configurable placeholder URL until the release is available.</p>
            </div>
            <div className="download-spec">
              <div className="spec-header"><span className="mono">CUTLINE / 1.0.0</span><span className="spec-mark"><Check size={15} /> FOR WINDOWS</span></div>
              <div className="spec-row"><span><Monitor size={17} /> Operating system</span><strong>Windows x64</strong></div>
              <div className="spec-row"><span><MousePointer2 size={17} /> Processor</span><strong>Intel Core i3-class baseline</strong></div>
              <div className="spec-row"><span><Layers3 size={17} /> Memory</span><strong>8 GB RAM baseline</strong></div>
              <div className="spec-row"><span><HardDrive size={17} /> Storage</span><strong>Space for local media</strong></div>
              <div className="spec-note">Storage needs depend on the media you choose to keep on your PC. Plan room for your project files and source footage.</div>
              <div className="spec-bottom mono">X64 DESKTOP EDITOR <span>VERSION 1.0.0</span></div>
            </div>
          </div>
        </section>

        <section className="faq-section section-wrap">
          <div className="section-label mono"><span>06</span> / A FEW GOOD QUESTIONS</div>
          <div className="faq-layout">
            <h2>Good to<br /><em>know.</em></h2>
            <div className="faq-list">
              <article><h3>Where do my video and audio files go?</h3><p>Your media stays on your PC. Optional Supabase sync applies to project state, not the actual video or audio files.</p></article>
              <article><h3>What does Cutline do?</h3><p>It’s a desktop video editor with a multitrack timeline, preview and editing for video and audio, titles and text overlays, filters, transitions, markup, local project and media storage, and exports.</p></article>
              <article><h3>Can I download the installer today?</h3><p>Not yet. The installer is not hosted. The download URL is intentionally configurable so a release link can be added without changing the page design.</p></article>
            </div>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="footer-main"><a className="brand footer-brand focus-ring" href="#top"><img src={cutlineLogo} alt="" /><span>cutline<span className="brand-period">.</span></span></a><p>Make the cut. Keep control.</p><a className="back-top focus-ring" href="#top">BACK TO TOP ↑</a></div>
        <div className="footer-meta mono"><span>© CUTLINE 2026</span><span>WINDOWS X64 · VERSION 1.0.0</span><span>MADE FOR THE MAKING</span></div>
      </footer>
    </div>
  );
}

export default App;
