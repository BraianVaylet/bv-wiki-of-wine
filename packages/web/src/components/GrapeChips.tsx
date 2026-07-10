const MAX_VISIBLE = 3;

/** Chips de uvas. Muestra hasta 3 y `+N` si hay más. */
export function GrapeChips({ grapes }: { grapes: string[] }) {
  if (grapes.length === 0) return null;
  const visible = grapes.slice(0, MAX_VISIBLE);
  const extra = grapes.length - visible.length;
  return (
    <div className="flex flex-wrap items-center gap-1">
      {visible.map((grape) => (
        <span
          key={grape}
          className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-muted text-xs"
        >
          {grape}
        </span>
      ))}
      {extra > 0 && <span className="text-dim text-xs">+{extra}</span>}
    </div>
  );
}
