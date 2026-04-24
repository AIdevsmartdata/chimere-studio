"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles } from 'lucide-react';

export default function Home() {
  const [input, setInput] = useState('');
  const router = useRouter();

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sessionStorage.setItem('chimere:first-message', input);
    router.push('/chat');
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex items-center gap-3 text-foreground/80">
          <Sparkles className="h-6 w-6" />
          <h1 className="text-3xl font-light tracking-tight">Chimère</h1>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(e); }
            }}
            placeholder="De quoi on parle ?"
            className="w-full min-h-32 resize-none rounded-lg bg-secondary/50 border border-border px-4 py-3 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Enter pour envoyer · Shift+Enter nouvelle ligne</span>
            <button
              type="submit"
              disabled={!input.trim()}
              className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground text-sm font-medium disabled:opacity-30"
            >
              Envoyer
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
