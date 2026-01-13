import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'w-full rounded-md border px-3 py-2 text-sm outline-none',
        'focus:ring-2 focus:ring-black',
        className,
      )}
      {...props}
    />
  );
}
