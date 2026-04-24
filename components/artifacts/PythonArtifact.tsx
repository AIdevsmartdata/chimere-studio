"use client";

import { useCallback, useEffect, useState } from 'react';
import { Play, Loader2, AlertCircle, RotateCcw } from 'lucide-react';

type Line = { kind: 'out' | 'err' | 'info'; text: string };
type Img = { mime: string; dataUrl: string };

type Props = {
  code: string;
  autoRun?: boolean;
  className?: string;
};

// Worker is shared across component instances to avoid re-downloading Pyodide
// (~10 MB) every time a new artifact mounts.
let sharedReady: Promise<Worker> | null = null;

function getWorker(): Promise<Worker> {
  if (sharedReady) return sharedReady;
  sharedReady = new Promise((resolve, reject) => {
    try {
      const w = new Worker('/pyodide-worker.js');
      const onReady = (evt: MessageEvent) => {
        if (evt.data?.type === 'ready') {
          w.removeEventListener('message', onReady);
          resolve(w);
        } else if (evt.data?.type === 'error' && evt.data.id === 'init') {
          w.removeEventListener('message', onReady);
          sharedReady = null;
          reject(new Error(evt.data.message));
        }
      };
      w.addEventListener('message', onReady);
      w.postMessage({ type: 'init' });
    } catch (err) {
      sharedReady = null;
      reject(err);
    }
  });
  return sharedReady;
}

export default function PythonArtifact({ code, autoRun = false, className }: Props) {
  const [status, setStatus] = useState<'idle' | 'booting' | 'running' | 'done' | 'error'>('idle');
  const [lines, setLines] = useState<Line[]>([]);
  const [images, setImages] = useState<Img[]>([]);
  const [result, setResult] = useState<string>('');
  const [error, setError] = useState<string>('');

  const run = useCallback(async () => {
    setLines([]);
    setImages([]);
    setResult('');
    setError('');
    setStatus('booting');
    let w: Worker;
    try {
      w = await getWorker();
    } catch (err) {
      setError(`Impossible d'initialiser Pyodide: ${String(err)}`);
      setStatus('error');
      return;
    }
    const id = `r_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setStatus('running');

    const handler = (evt: MessageEvent) => {
      const msg = evt.data || {};
      if (msg.id !== id) return;
      if (msg.type === 'stdout') {
        setLines((prev) => [...prev, { kind: 'out', text: msg.text }]);
      } else if (msg.type === 'stderr') {
        setLines((prev) => [...prev, { kind: 'err', text: msg.text }]);
      } else if (msg.type === 'image') {
        setImages((prev) => [...prev, { mime: msg.mime, dataUrl: `data:${msg.mime};base64,${msg.dataBase64}` }]);
      } else if (msg.type === 'result') {
        setResult(msg.repr || '');
        setStatus('done');
        w.removeEventListener('message', handler);
      } else if (msg.type === 'error') {
        setError(msg.message);
        setStatus('error');
        w.removeEventListener('message', handler);
      }
    };
    w.addEventListener('message', handler);
    w.postMessage({ type: 'run', id, code });
  }, [code]);

  useEffect(() => {
    if (autoRun) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const running = status === 'booting' || status === 'running';

  return (
    <div className={`rounded-md border border-border bg-secondary/30 ${className || ''}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-mono">python</span>
          {status === 'booting' && <span>initialisation…</span>}
          {status === 'running' && <span>exécution…</span>}
          {status === 'done' && <span className="text-emerald-500">ok</span>}
          {status === 'error' && <span className="text-red-500">erreur</span>}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={run}
            disabled={running}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
            title="Exécuter"
          >
            {running ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : status === 'done' || status === 'error' ? (
              <RotateCcw className="h-3.5 w-3.5" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            {running ? 'En cours' : status === 'done' || status === 'error' ? 'Rejouer' : 'Exécuter'}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-3 py-2 text-xs font-mono text-foreground/90 whitespace-pre-wrap">
        {code}
      </pre>
      {(lines.length > 0 || images.length > 0 || result || error) && (
        <div className="border-t border-border/60 px-3 py-2 space-y-2">
          {lines.length > 0 && (
            <pre className="text-xs font-mono whitespace-pre-wrap">
              {lines.map((l, i) => (
                <span key={i} className={l.kind === 'err' ? 'text-red-400' : 'text-foreground/85'}>
                  {l.text}
                </span>
              ))}
            </pre>
          )}
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={img.dataUrl} alt={`figure ${i + 1}`} className="max-w-full rounded border border-border/60 bg-white" />
              ))}
            </div>
          )}
          {result && (
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">=&gt; {result}</pre>
          )}
          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <pre className="whitespace-pre-wrap font-mono">{error}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
