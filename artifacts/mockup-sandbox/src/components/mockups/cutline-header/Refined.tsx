import {
  Check, Download, FolderOpen, HardDrive, Redo2, RefreshCw, Undo2,
} from "lucide-react";
import "./_group.css";

export function Refined() {
  return (
    <main className="workspace">
      <header className="topbar topbar--refined">
        <div className="brand brand--refined">
          <img
            className="brand-mark brand-mark--refined"
            src="/__mockup/images/cutline-app-icon.svg"
            alt=""
          />
          <span className="brand-wordmark">Cutline</span>
        </div>
        <div className="save-state save-state--saved save-state--refined" role="status">
          <Check size={13} strokeWidth={2.2} aria-hidden="true" />
          <span>Saved</span>
        </div>
        <div className="top-spacer" />
        <button className="icon-btn" aria-label="Undo"><Undo2 size={16} /></button>
        <button className="icon-btn" aria-label="Redo"><Redo2 size={16} /></button>
        <button className="btn"><FolderOpen size={14} /><span>Projects</span></button>
        <button className="btn"><HardDrive size={14} /><span>Save</span></button>
        <button className="btn primary"><Download size={14} /><span>Export</span></button>
      </header>
      <div className="save-state save-state--refined" style={{ margin: "18px", color: "#d6b56f", background: "#29251c", borderColor: "#55472c" }}>
        <RefreshCw size={13} aria-hidden="true" />
        <span>Saving…</span>
        <span style={{ color: "#87908f", marginInline: 4 }}>·</span>
        <span style={{ color: "#d9dadd" }}>Unsaved changes</span>
      </div>
    </main>
  );
}
