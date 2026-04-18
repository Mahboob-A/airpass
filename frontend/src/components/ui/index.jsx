import { forwardRef } from 'react';
import { cn } from '../../lib/utils';

export const Button = forwardRef(({ className, variant = 'primary', size = 'default', ...props }, ref) => {
    const variants = {
        primary: 'bg-primary text-white hover:bg-primary/90 shadow-[0_0_15px_rgba(14,165,233,0.3)]',
        secondary: 'bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700',
        ghost: 'bg-transparent text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50',
        danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20',
    };

    const sizes = {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-sm',
        lg: 'h-12 px-8 text-lg',
        icon: 'h-10 w-10 shrink-0',
    };

    return (
        <button
            ref={ref}
            className={cn(
                'inline-flex items-center justify-center rounded-md font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]',
                variants[variant],
                sizes[size],
                className
            )}
            {...props}
        />
    );
});
Button.displayName = 'Button';

export const Input = forwardRef(({ className, ...props }, ref) => {
    return (
        <input
            ref={ref}
            className={cn(
                'flex h-10 w-full rounded-md border border-zinc-800 bg-zinc-900/50 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-zinc-950 disabled:cursor-not-allowed disabled:opacity-50 transition-all shadow-inner',
                className
            )}
            {...props}
        />
    );
});
Input.displayName = 'Input';

export const Card = forwardRef(({ className, ...props }, ref) => {
    return (
        <div
            ref={ref}
            className={cn(
                'rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-6 backdrop-blur-xl shadow-xl',
                className
            )}
            {...props}
        />
    );
});
Card.displayName = 'Card';
