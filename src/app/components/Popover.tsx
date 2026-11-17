import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/** A button that opens a small panel of controls. Closes on Escape or a press outside. */
export function Popover({
  label,
  active,
  children,
}: {
  label: string;
  /** Marks the button when the controls inside hold a value. */
  active?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="popover" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`btn btn-menu${active ? ' btn-active' : ''}`}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {label}
      </button>
      {open ? (
        <div className="popover-panel" id={panelId} role="group" aria-label={label}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
