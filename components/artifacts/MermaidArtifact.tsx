"use client";

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';

type Props = {
  src: string;
  className?: string;
};

// Mermaid is loaded via CDN (ESM) so we don't force users to `pnpm install mermaid`
// at build time. It's ~500 KB gzipped; we cache the loader promise across mounts.
const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';

type MermaidModule = {
  initialize: (cfg: Record<string, unknown>) => void;
  render: (id: string, text: string) => Promise<{ svg: string }>;
};

declare global {
  interface Window {
    __chimere_mermaid?: Promise<MermaidModule>;
  }
}

// Use `new Function` so neither webpack nor TypeScript try to resolve the URL
// at build time. The real call happens in the browser at runtime.
// eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
const dynamicImport = new Function('url', 'return import(url)') as (
  url: string
) => Promise<{ default?: MermaidModule } & MermaidModule>;

async function loadMermaid(): Promise<MermaidModule> {
  if (typeof window === 'undefined') throw new Error('mermaid: SSR unsupported');
  if (window.__chimere_mermaid) return window.__chimere_mermaid;
  window.__chimere_mermaid = (async () => {
    const mod = await dynamicImport(MERMAID_CDN);
    const m: MermaidModule = (mod.default as MermaidModule) || (mod as MermaidModule);
    m.initialize({
      startOnLoad: false,
      theme: 'dark',
      securityLevel: 'strict',
      darkMode: true,
      fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    });
    return m;
  })();
  return window.__chimere_mermaid;
}

export default function MermaidArtifact({ src, className }: Props) {
  const [svg, setSvg] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const idRef = useRef<string>(`m_${Math.random().toString(36).slice(2, 9)}`);

  const render = async () => {
    setLoading(true);
    setError('');
    try {
      const m = await loadMermaid();
      const { svg: rendered } = await m.render(idRef.current, src);
      setSvg(rendered);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  return (
    <div className={`rounded-md border border-border bg-secondary/30 ${className || ''}`}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <span className="font-mono text-xs text-muted-foreground">mermaid</span>
        <button
          onClick={render}
          disabled={loading}
          className="flex items-center gap-1 rounded px-2 py-1 text-xs hover:bg-secondary disabled:opacity-50"
          title="Rafraîchir"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          Rafraîchir
        </button>
      </div>
      <div className="px-3 py-3">
        {loading && !svg && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> rendu…
          </div>
        )}
        {error && (
          <div className="flex items-start gap-2 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <pre className="whitespace-pre-wrap font-mono">{error}</pre>
          </div>
        )}
        {svg && !error && (
          <div
            className="mermaid-container overflow-x-auto text-foreground"
            // svg content comes from mermaid (strict security level), safe to inject
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        )}
        {!loading && !svg && !error && (
          <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap">{src}</pre>
        )}
      </div>
    </div>
  );
}
