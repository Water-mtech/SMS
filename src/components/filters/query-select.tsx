'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';

import { SelectInput } from '@/components/ui/field';

interface QuerySelectProps {
  label: string;
  /** Search-param key this select drives. */
  param: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  /** Params to clear when this one changes, e.g. class when the section changes. */
  resets?: string[];
  className?: string;
}

/**
 * A select that writes its value into the URL. Keeping scope in the query string
 * means every screen is linkable, shareable, and survives a refresh.
 */
export function QuerySelect({
  label,
  param,
  value,
  options,
  placeholder,
  resets = [],
  className,
}: QuerySelectProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function onChange(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) params.set(param, next);
    else params.delete(param);
    for (const key of resets) params.delete(key);

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  }

  return (
    <SelectInput
      label={label}
      value={value}
      options={options}
      placeholder={placeholder}
      disabled={pending}
      onChange={(event) => onChange(event.target.value)}
      className={className}
    />
  );
}
