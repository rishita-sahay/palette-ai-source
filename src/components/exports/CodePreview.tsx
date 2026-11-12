/** Read-only code block. Shows exactly the string that copy and download use. */
export function CodePreview({ code, label }: { code: string; label: string }) {
  const lines = code.replace(/\n$/, '').split('\n');
  return (
    <div className="scroll-quiet max-h-[min(60vh,640px)] overflow-auto rounded-control border border-line bg-soft" tabIndex={0} role="region" aria-label={label}>
      <pre className="grid min-w-max grid-cols-[auto_1fr] gap-x-4 p-4 font-mono text-[13px] leading-[22px] text-ink">
        {lines.map((line, i) => (
          <span key={i} className="contents">
            <span className="text-right text-faint select-none tabular-nums" aria-hidden>{i + 1}</span>
            <code className={/^\s*(\/\*|\/\/)/.test(line) ? 'text-muted' : undefined}>{line || ' '}</code>
          </span>
        ))}
      </pre>
    </div>
  );
}
