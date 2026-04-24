"use client";

import { Fragment, useMemo } from 'react';
import CodeBlock from './CodeBlock';

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'code'; lang: string; code: string };

// Minimal fenced-block parser: splits content on ```lang\n…\n``` triplets.
// We don't bring a full markdown renderer here — we just want fenced blocks
// to become runnable artifacts while leaving prose untouched.
function parse(content: string): Part[] {
  const parts: Part[] = [];
  const re = /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) parts.push({ kind: 'text', text: content.slice(last, m.index) });
    parts.push({ kind: 'code', lang: m[1] || '', code: m[2].replace(/\n$/, '') });
    last = re.lastIndex;
  }
  if (last < content.length) parts.push({ kind: 'text', text: content.slice(last) });
  if (parts.length === 0) parts.push({ kind: 'text', text: content });
  return parts;
}

export default function MessageContent({ content }: { content: string }) {
  const parts = useMemo(() => parse(content), [content]);
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {p.kind === 'text' ? (
            <div className="whitespace-pre-wrap">{p.text}</div>
          ) : (
            <CodeBlock lang={p.lang} code={p.code} />
          )}
        </Fragment>
      ))}
    </>
  );
}
