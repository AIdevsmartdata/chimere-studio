"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Home, Brain, ChevronDown, ChevronRight, BookMarked, Layers } from 'lucide-react';
import MessageContent from '@/components/artifacts/MessageContent';
import ArtifactsPanel from '@/components/artifacts/ArtifactsPanel';
import { useArtifactsStore } from '@/lib/artifacts-store';

type Msg = {
  role: 'user' | 'assistant';
  content: string;
  reasoning?: string;
  reasoningOpen?: boolean;
};

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const panelOpen = useArtifactsStore((s) => s.panelOpen);
  const artifactsCount = useArtifactsStore((s) => s.artifacts.length);
  const togglePanel = useArtifactsStore((s) => s.togglePanel);

  useEffect(() => {
    const first = sessionStorage.getItem('chimere:first-message');
    if (first) {
      sessionStorage.removeItem('chimere:first-message');
      send(first);
    }
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const getBackend = () => (typeof window !== 'undefined' && localStorage.getItem('chimere:backend')) || 'http://127.0.0.1:8084/v1';

  async function send(text: string) {
    const next: Msg[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setStreaming(true);
    const assistantIdx = next.length;
    setMessages([...next, { role: 'assistant', content: '', reasoning: '', reasoningOpen: false }]);
    try {
      const res = await fetch(`${getBackend()}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'chimere',
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          max_tokens: 16384,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;
            const contentDelta: string = delta.content || '';
            const reasoningDelta: string = delta.reasoning_content || '';
            if (contentDelta || reasoningDelta) {
              setMessages((prev) => {
                const copy = [...prev];
                const cur = copy[assistantIdx];
                copy[assistantIdx] = {
                  ...cur,
                  content: cur.content + contentDelta,
                  reasoning: (cur.reasoning || '') + reasoningDelta,
                };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[assistantIdx] = { role: 'assistant', content: `[erreur backend ${getBackend()}] ${String(err)}` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  const toggleReasoning = (i: number) => {
    setMessages((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i], reasoningOpen: !copy[i].reasoningOpen };
      return copy;
    });
  };

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Home className="h-4 w-4" /> Nouveau
        </button>
        <div className="flex items-center gap-2">
          {artifactsCount > 0 && (
            <button
              type="button"
              onClick={togglePanel}
              aria-label="Artefacts"
              title={panelOpen ? 'Masquer les artefacts' : 'Afficher les artefacts'}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md px-2 py-1 hover:bg-secondary/60 transition-colors"
            >
              <Layers className="h-4 w-4" />
              <span>{artifactsCount}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => router.push('/memory')}
            aria-label="Mémoire"
            title="Inspecteur de mémoire"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground rounded-md px-2 py-1 hover:bg-secondary/60 transition-colors"
          >
            <BookMarked className="h-4 w-4" />
            <span className="hidden sm:inline">Mémoire</span>
          </button>
          <button onClick={() => router.push('/settings')} className="text-sm text-muted-foreground hover:text-foreground">Settings</button>
        </div>
      </header>
      <div className={`flex-1 min-h-0 grid ${panelOpen ? 'grid-cols-2' : 'grid-cols-1'} transition-[grid-template-columns]`}>
        <section className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-8">
            <div className={`${panelOpen ? 'max-w-2xl' : 'max-w-3xl'} mx-auto space-y-6`}>
              {messages.map((m, i) => {
                const isAssistant = m.role === 'assistant';
                const hasReasoning = isAssistant && m.reasoning && m.reasoning.length > 0;
                const thinking = isAssistant && streaming && i === messages.length - 1 && !m.content && hasReasoning;
                return (
                  <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex flex-col items-start'}>
                    {hasReasoning && (
                      <button
                        onClick={() => toggleReasoning(i)}
                        className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {m.reasoningOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                        <Brain className="h-3.5 w-3.5" />
                        {thinking ? 'Raisonne…' : 'Raisonnement'}
                      </button>
                    )}
                    {hasReasoning && m.reasoningOpen && (
                      <div className="mb-2 rounded-md bg-secondary/30 border border-border/50 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap max-w-[85%]">
                        {m.reasoning}
                      </div>
                    )}
                    <div className={`rounded-lg px-4 py-2.5 max-w-[85%] ${m.role === 'user' ? 'bg-secondary whitespace-pre-wrap' : 'bg-transparent space-y-2'}`}>
                      {m.role === 'user' ? (
                        m.content
                      ) : m.content ? (
                        <MessageContent content={m.content} />
                      ) : (
                        thinking ? '…' : (streaming && i === messages.length - 1 ? '…' : '')
                      )}
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) send(input); }} className="border-t border-border px-6 py-4">
            <div className={`${panelOpen ? 'max-w-2xl' : 'max-w-3xl'} mx-auto flex gap-2`}>
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={streaming}
                placeholder="Message"
                className="flex-1 rounded-md bg-secondary/50 border border-border px-3 py-2 placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <button type="submit" disabled={!input.trim() || streaming} className="rounded-md bg-primary px-3 text-primary-foreground disabled:opacity-30">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </section>
        {panelOpen && (
          <section className="overflow-hidden">
            <ArtifactsPanel />
          </section>
        )}
      </div>
    </main>
  );
}
