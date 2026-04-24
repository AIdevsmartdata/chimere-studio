"use client";

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Home } from 'lucide-react';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);

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
    setMessages([...next, { role: 'assistant', content: '' }]);
    try {
      const res = await fetch(`${getBackend()}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'chimere',
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
        }),
      });
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
            const delta = chunk.choices?.[0]?.delta?.content || '';
            if (delta) {
              setMessages((prev) => {
                const copy = [...prev];
                copy[assistantIdx] = { ...copy[assistantIdx], content: copy[assistantIdx].content + delta };
                return copy;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages((prev) => {
        const copy = [...prev];
        copy[assistantIdx] = { role: 'assistant', content: `[erreur backend ${getBackend()}]` };
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  }

  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-border">
        <button onClick={() => router.push('/')} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <Home className="h-4 w-4" /> Nouveau
        </button>
        <button onClick={() => router.push('/settings')} className="text-sm text-muted-foreground hover:text-foreground">Settings</button>
      </header>
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex'}>
              <div className={`rounded-lg px-4 py-2.5 max-w-[85%] whitespace-pre-wrap ${m.role === 'user' ? 'bg-secondary' : 'bg-transparent'}`}>
                {m.content || (streaming && i === messages.length - 1 ? '…' : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); if (input.trim()) send(input); }} className="border-t border-border px-6 py-4">
        <div className="max-w-3xl mx-auto flex gap-2">
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
    </main>
  );
}
