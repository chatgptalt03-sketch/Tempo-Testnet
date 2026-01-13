import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = HTMLAttributes<HTMLSpanElement> & { variant?: 'default' | 'secondary' | 'outline' };

export function Badge({ className, variant = 'default', ...props }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-1 text-xs',
        variant === 'default' && 'bg-black text-white',
        variant === 'secondary' && 'bg-gray-100 text-black',
        variant === 'outline' && 'border',
        className,
      )}
      {...props}
    />
  );
}
