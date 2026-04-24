"use client";

import { useCallback, useState } from 'react';
import { Copy, Check, Play, ExternalLink, AlertCircle } from 'lucide-react';
import PythonArtifact from './PythonArtifact';
import MermaidArtifact from './MermaidArtifact';
import { useArtifactsStore } from '@/lib/artifacts-store';

type Props = {
  lang: string;
  code: string;
  // when true, execute inline directly. When false (default), just render the
  // code with a ▶ Run button that spawns the artifact inline.
  autoRun?: boolean;
};

const RUNNABLE = new Set(['python', 'py', 'mermaid', 'javascript', 'js']);

function normalizeLang(lang: string): string {
  const l = (lang || '').toLowerCase().trim();
  if (l === 'py') return 'python';
  if (l === 'js') return 'javascript';
  return l;
}

function JsArtifact({ code }: { code: string }) {
  const [lines, setLines] = useState<string[]>([]);
  const [errored, setErrored] = useState<boolean>(false);
  const [running, setRunning] = useState<boolean>(false);

  const run = useCallback(() => {
    setLines([]);
    setErrored(false);
    setRunning(true);
    const captured: string[] = [];
    try {
      // sandbox: Function ctor avoids leaking local scope. Still shares the
      // global window/document of the WebView, so treat with care.
      const origLog = console.log;
      const origErr = console.error;
      console.log = (...args: unknown[]) => {
        const s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        captured.push(s);
      };
      console.error = (...args: unknown[]) => {
        const s = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
        captured.push(`[err] ${s}`);
      };
      try {
        // eslint-disable-next-line no-new-func
        const fn = new Function(code);
        const ret = fn();
        if (ret !== undefined) captured.push(String(ret));
      } finally {
        console.log = origLog;
        console.error = origErr;
      }
    } catch (err: unknown) {
      setErrored(true);
      captured.push(err instanceof Error ? err.stack || err.message : String(err));
    } finally {
      setLines(captured);
      setRunning(false);
    }
  }, [code]);

  return (
    <div className="rounded-md border border-border bg-secondary/30">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <span className="font-mono text-xs text-muted-foreground">javascript</span>
        <button
          onClick={run}
          disabled={running}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> {running ? 'En cours' : 'Exécuter'}
        </button>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs font-mono text-foreground/90 whitespace-pre-wrap">{code}</pre>
      {lines.length > 0 && (
        <div className="border-t border-border/60 px-3 py-2">
          <pre className={`text-xs font-mono whitespace-pre-wrap ${errored ? 'text-red-400' : 'text-foreground/85'}`}>
            {errored && <AlertCircle className="inline h-3.5 w-3.5 mr-1" />}
            {lines.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function CodeBlock({ lang, code, autoRun = false }: Props) {
  const [copied, setCopied] = useState(false);
  const [executed, setExecuted] = useState(autoRun);
  const addArtifact = useArtifactsStore((s) => s.addArtifact);

  const norm = normalizeLang(lang);
  const runnable = RUNNABLE.has(norm);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const openInPanel = () => {
    if (norm === 'python' || norm === 'mermaid' || norm === 'javascript') {
      const firstLine = code.split('\n').find((l) => l.trim()) || '';
      addArtifact({
        kind: norm as 'python' | 'mermaid' | 'javascript',
        title: firstLine.slice(0, 60) || norm,
        source: code,
      });
    }
  };

  if (executed) {
    if (norm === 'python') return <PythonArtifact code={code} autoRun />;
    if (norm === 'mermaid') return <MermaidArtifact src={code} />;
    if (norm === 'javascript') return <JsArtifact code={code} />;
  }

  return (
    <div className="rounded-md border border-border bg-secondary/20 my-2">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/60 text-xs text-muted-foreground">
        <span className="font-mono">{norm || 'code'}</span>
        <div className="flex items-center gap-1">
          {runnable && (
            <button
              onClick={() => setExecuted(true)}
              className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-secondary"
              title="Exécuter inline"
            >
              <Play className="h-3.5 w-3.5" /> Run
            </button>
          )}
          {runnable && (
            <button
              onClick={openInPanel}
              className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-secondary"
              title="Ouvrir dans le panneau artefacts"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={copy}
            className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-secondary"
            title="Copier"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs font-mono text-foreground/90 whitespace-pre-wrap">{code}</pre>
    </div>
  );
}
