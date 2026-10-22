import { useEffect, useRef } from 'react';
import { CODEX, codexEntry } from './codex.ts';

const GROUPS = [
  { kind: 'trait', label: 'Traits' },
  { kind: 'concept', label: 'Concepts' },
  { kind: 'model', label: 'About the game' },
] as const;

/** The Codex: the science behind each trait and mechanism, with confidence and sources. */
export function CodexDialog({
  entryId,
  onSelect,
  onClose,
}: {
  /** Entry to show, or null when the Codex is closed. */
  entryId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const open = entryId !== null;

  useEffect(() => {
    const dialog = ref.current;
    if (dialog === null) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const entry = codexEntry(entryId ?? '') ?? CODEX[0];

  return (
    <dialog ref={ref} className="codex" aria-labelledby="codex-title" onClose={onClose}>
      <div className="codex-head">
        <h2 id="codex-title">Codex</h2>
        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Close the Codex"
        >
          ×
        </button>
      </div>
      <div className="codex-body">
        <nav aria-label="Codex entries">
          {GROUPS.map((group) => (
            <div key={group.kind}>
              <h3>{group.label}</h3>
              <ul>
                {CODEX.filter((e) => e.kind === group.kind).map((e) => (
                  <li key={e.id}>
                    <button
                      type="button"
                      aria-current={e.id === entry.id ? 'true' : undefined}
                      onClick={() => onSelect(e.id)}
                    >
                      {e.title}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <article>
          <h3>{entry.title}</h3>
          <p className="confidence">
            Confidence: <strong>{entry.confidence}</strong>
          </p>
          {entry.body.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {entry.sources.length > 0 && (
            <>
              <h4>Sources</h4>
              <ul className="sources">
                {entry.sources.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
        </article>
      </div>
    </dialog>
  );
}
