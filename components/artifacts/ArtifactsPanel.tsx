"use client";

import { X } from 'lucide-react';
import { useArtifactsStore } from '@/lib/artifacts-store';
import PythonArtifact from './PythonArtifact';
import MermaidArtifact from './MermaidArtifact';

export default function ArtifactsPanel() {
  const artifacts = useArtifactsStore((s) => s.artifacts);
  const activeId = useArtifactsStore((s) => s.activeId);
  const setActive = useArtifactsStore((s) => s.setActive);
  const close = useArtifactsStore((s) => s.closePanel);

  const active = artifacts.find((a) => a.id === activeId) || artifacts[artifacts.length - 1];

  return (
    <aside className="h-full flex flex-col border-l border-border bg-background">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2 overflow-x-auto">
          {artifacts.map((a) => (
            <button
              key={a.id}
              onClick={() => setActive(a.id)}
              className={`rounded px-2 py-1 text-xs whitespace-nowrap ${
                a.id === active?.id ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground'
              }`}
              title={a.title}
            >
              <span className="font-mono text-[10px] mr-1 text-muted-foreground">{a.kind}</span>
              {a.title.slice(0, 32) || 'artefact'}
            </button>
          ))}
        </div>
        <button
          onClick={close}
          className="text-muted-foreground hover:text-foreground"
          title="Fermer le panneau"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {active && active.kind === 'python' && <PythonArtifact code={active.source} autoRun />}
        {active && active.kind === 'mermaid' && <MermaidArtifact src={active.source} />}
        {active && active.kind === 'javascript' && (
          <div className="rounded-md border border-border bg-secondary/30 p-3 text-xs text-muted-foreground">
            JavaScript artifacts ne sont rendus qu'inline pour éviter de polluer le global window.
          </div>
        )}
        {!active && (
          <div className="text-xs text-muted-foreground">Aucun artefact actif.</div>
        )}
      </div>
    </aside>
  );
}
