import type { VisitStatus } from '@campusflow/shared';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  const styles = {
    primary: 'bg-brand-600 text-white hover:bg-brand-700 focus:ring-brand-500',
    secondary: 'bg-white text-slate-800 border border-slate-200 hover:bg-slate-50 focus:ring-brand-500',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 focus:ring-brand-500',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-500',
  }[variant];
  return (
    <button
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        styles,
        className,
      )}
      {...props}
    />
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cx(
        'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200',
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        'min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200',
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cx(
        'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-slate-700">
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-sm text-rose-600">{children}</p>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>{children}</div>;
}

export function Badge({ status, children }: { status?: VisitStatus | string; children?: ReactNode }) {
  const map: Record<string, string> = {
    agendada: 'bg-sky-100 text-sky-800',
    aguardando_promotor: 'bg-amber-100 text-amber-900',
    aguardando_professor: 'bg-orange-100 text-orange-900',
    confirmada: 'bg-emerald-100 text-emerald-800',
    em_atendimento: 'bg-indigo-100 text-indigo-800',
    realizada: 'bg-green-100 text-green-800',
    ausente: 'bg-slate-200 text-slate-700',
    cancelada: 'bg-rose-100 text-rose-800',
    reagendada: 'bg-violet-100 text-violet-800',
  };
  const label =
    children ??
    ({
      agendada: 'Agendada',
      aguardando_promotor: 'Aguardando promotor',
      aguardando_professor: 'Aguardando professor',
      confirmada: 'Confirmada',
      em_atendimento: 'Em atendimento',
      realizada: 'Realizada',
      ausente: 'Ausente',
      cancelada: 'Cancelada',
      reagendada: 'Reagendada',
    }[status ?? ''] ?? status);

  return (
    <span className={cx('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold', map[status ?? ''] ?? 'bg-slate-100 text-slate-700')}>
      {label}
    </span>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {description ? <p className="mt-2 max-w-md text-sm text-slate-600">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded-xl bg-slate-200', className)} />;
}

export function ScoreBar({ score, label }: { score: number; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, score)) * 100);
  return (
    <div className="space-y-1">
      {label ? <div className="flex justify-between text-xs text-slate-600"><span>{label}</span><span>{pct}%</span></div> : null}
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex flex-wrap gap-2">
      {steps.map((step, index) => {
        const active = index === current;
        const done = index < current;
        return (
          <li
            key={step}
            className={cx(
              'rounded-full px-3 py-1 text-xs font-semibold',
              active && 'bg-brand-600 text-white',
              done && 'bg-brand-100 text-brand-800',
              !active && !done && 'bg-slate-100 text-slate-500',
            )}
          >
            {index + 1}. {step}
          </li>
        );
      })}
    </ol>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
      </div>
      {actions}
    </div>
  );
}

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-600" role="status" aria-live="polite">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
      {label}
    </div>
  );
}
