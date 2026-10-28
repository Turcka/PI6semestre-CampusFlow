import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type DrawerProps = {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  /** Lado em que o painel aparece em telas ≥ sm. Em telas pequenas sempre sobe de baixo. */
  side?: 'right' | 'bottom';
  /** Largura máxima do painel lateral (classe Tailwind). */
  widthClassName?: string;
  /** Conteúdo fixo no rodapé (ações). */
  footer?: ReactNode;
};

/**
 * Painel lateral acessível renderizado em portal.
 * Fecha com Esc, clique no overlay ou botão X; trava o scroll do body e devolve o foco ao elemento que abriu.
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  side = 'right',
  widthClassName = 'sm:max-w-md',
  footer,
}: DrawerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>('[data-autofocus], button, [href], input, select, textarea') ?? panelRef.current;
    focusTarget?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (!focusable.length) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const panelPosition =
    side === 'bottom'
      ? 'inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl'
      : `inset-x-0 bottom-0 max-h-[85vh] rounded-t-3xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-full sm:rounded-none ${widthClassName}`;

  return createPortal(
    <div className="fixed inset-0 z-50" role="presentation">
      <button
        type="button"
        aria-label="Fechar painel"
        className="absolute inset-0 h-full w-full cursor-default bg-slate-900/40 backdrop-blur-[1px]"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={`absolute flex flex-col bg-white shadow-2xl outline-none ${panelPosition}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold capitalize text-slate-900">
              {title}
            </h2>
            {description ? (
              <p id={descriptionId} className="mt-0.5 text-sm text-slate-500">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <svg aria-hidden="true" viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
            </svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <footer className="border-t border-slate-100 px-5 py-3">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}
