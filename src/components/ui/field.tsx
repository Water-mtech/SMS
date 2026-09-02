import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

const CONTROL_CLASSES =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm ' +
  'placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 aria-[invalid=true]:border-red-400 aria-[invalid=true]:ring-red-500/20';

interface FieldShellProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (ids: { controlId: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
  className?: string;
}

/** Label + control + error wiring, so every form field is announced correctly. */
export function Field({ label, error, hint, required, children, className }: FieldShellProps) {
  const controlId = useId();
  const errorId = `${controlId}-error`;
  const hintId = `${controlId}-hint`;
  const describedBy = [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={controlId} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-red-500" aria-hidden="true">*</span>}
      </label>
      {children({ controlId, describedBy, invalid: Boolean(error) })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, error, hint, required, className, ...props },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <input
          ref={ref}
          id={controlId}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(CONTROL_CLASSES, className)}
          {...props}
        />
      )}
    </Field>
  );
});

export interface SelectInputProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const SelectInput = forwardRef<HTMLSelectElement, SelectInputProps>(function SelectInput(
  { label, error, hint, required, className, options, placeholder, ...props },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <select
          ref={ref}
          id={controlId}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(CONTROL_CLASSES, 'pr-8', className)}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
});

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  error?: string;
  hint?: string;
}

export const TextArea = forwardRef<HTMLTextAreaElement, TextAreaProps>(function TextArea(
  { label, error, hint, required, className, ...props },
  ref,
) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ controlId, describedBy, invalid }) => (
        <textarea
          ref={ref}
          id={controlId}
          required={required}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          className={cn(CONTROL_CLASSES, 'min-h-20 resize-y', className)}
          {...props}
        />
      )}
    </Field>
  );
});
