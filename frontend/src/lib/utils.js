import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges Tailwind class names safely using clsx + tailwind-merge.
 * BUG-07: replaces the naive filter(Boolean).join(' ') version that
 * caused incorrect class overrides (e.g. duplicate bg-* utilities).
 */
export function cn(...inputs) {
    return twMerge(clsx(inputs));
}
