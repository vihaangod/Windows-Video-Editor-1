import {
  Download, FolderOpen, HardDrive, Redo2, Scissors, Undo2,
} from "lucide-react";
import "./_group.css";

export function Current() {
  return (
    <main className="workspace">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Scissors size={16} strokeWidth={2.6} /></span>
          <span>cutline</span>
        </div>
        <div className="save-state save-state--saved" role="status">
          <span aria-hidden="true">●</span>Saved
        </div>
        <div className="top-spacer" />
        <button className="icon-btn" aria-label="Undo"><Undo2 size={16} /></button>
        <button className="icon-btn" aria-label="Redo"><Redo2 size={16} /></button>
        <button className="btn"><FolderOpen size={14} /><span>Projects</span></button>
        <button className="btn"><HardDrive size={14} /><span>Save</span></button>
        <button className="btn primary"><Download size={14} /><span>Export</span></button>
      </header>
    </main>
  );
}
