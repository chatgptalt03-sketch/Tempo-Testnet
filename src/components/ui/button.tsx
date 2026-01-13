import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'outline' | 'ghost' | 'link';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  tone?: 'purple' | 'blue' | 'green' | 'red';
};

type ButtonClassOptions = Pick<Props, 'variant' | 'size' | 'tone'> & {
  className?: string;
};

export function buttonClassName({ className, variant = 'default', size = 'md', tone = 'purple' }: ButtonClassOptions) {
  const solid = {
    // App primary (requested): #66D121
    purple: 'bg-[#66D121] hover:bg-[#5BB81D]',
    blue: 'bg-[#66D121] hover:bg-[#5BB81D]',
    green: 'bg-[#66D121] hover:bg-[#5BB81D]',
    red: 'bg-red-600 hover:bg-red-700',
  }[tone];

  const ring = {
    purple: 'focus-visible:ring-[#66D121]',
    blue: 'focus-visible:ring-[#66D121]',
    green: 'focus-visible:ring-[#66D121]',
    red: 'focus-visible:ring-red-500',
  }[tone];

  const base =
    'relative isolate inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-semibold ' +
    'transition-[transform,opacity,box-shadow,background-color,border-color] ' +
    'disabled:cursor-not-allowed disabled:opacity-50 ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ' +
    ring;

  const sizes =
    (size === 'sm' && 'h-9 px-4 text-sm') ||
    (size === 'md' && 'h-11 px-5 text-sm') ||
    (size === 'lg' && 'h-12 px-6 text-base') ||
    (size === 'icon' && 'h-10 w-10 p-0');

  if (variant === 'link') {
    return cn(
      'inline-flex items-center gap-1 rounded-md text-sm font-semibold text-[#2F6E0C] underline-offset-4 hover:underline dark:text-[#66D121]',
      className,
    );
  }

  if (variant === 'ghost') {
    return cn(
      base,
      sizes,
      'rounded-lg bg-transparent text-gray-700 hover:bg-gray-100 active:scale-[0.99] dark:text-gray-200 dark:hover:bg-gray-800',
      className,
    );
  }

  // Premium-ish look (inspired by the demo's PremiumButton) using Tailwind only.
  const premiumFrame =
    'before:pointer-events-none before:absolute before:-inset-1 before:rounded-full ' +
    'before:bg-black/10 before:opacity-40 before:blur-[0.5px] dark:before:bg-white/10 dark:before:opacity-30';

  if (variant === 'outline') {
    return cn(
      base,
      sizes,
      premiumFrame,
      'border border-gray-200 bg-white text-gray-900 shadow-[0_1px_0_rgba(0,0,0,0.08),0_10px_24px_rgba(0,0,0,0.10)] ' +
        'hover:border-[#66D121] hover:shadow-[0_1px_0_rgba(0,0,0,0.08),0_14px_30px_rgba(0,0,0,0.16)] active:scale-[0.99] ' +
        'dark:border-gray-800 dark:bg-gray-900 dark:text-gray-100 dark:hover:border-[#66D121]',
      className,
    );
  }

  // default
  return cn(
    base,
    sizes,
    premiumFrame,
    `${solid} text-white shadow-[0_1px_0_rgba(0,0,0,0.25),0_14px_34px_rgba(0,0,0,0.30)] ` +
      'hover:shadow-[0_1px_0_rgba(0,0,0,0.25),0_18px_44px_rgba(0,0,0,0.40)] active:scale-[0.99] ' +
      'ring-1 ring-black/10',
    className,
  );
}

export function Button({ className, variant = 'default', size = 'md', tone = 'green', ...props }: Props) {
  return (
    <button
      className={buttonClassName({ className, variant, size, tone })}
      {...props}
    />
  );
}
