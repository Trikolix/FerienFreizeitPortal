import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  return <dialog ref={ref} className="portal-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onClose(); }} onKeyDown={event => {
    if (event.key !== 'Tab' || (event.target as HTMLElement).closest('dialog') !== event.currentTarget) return;
    const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, textarea, select, summary, [tabindex]'))
      .filter(element => !element.matches(':disabled, [tabindex="-1"]') && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || document.activeElement === event.currentTarget)) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }}><div>{children}</div></dialog>;
}
