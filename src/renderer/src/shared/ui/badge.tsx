import { cn } from '@shared/lib/cn'
import { cva, type VariantProps } from 'class-variance-authority'

const badgeVariants = cva(
  'group/badge inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-4xl border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!',
  {
    variants: {
      variant: {
        default:
          'bg-gradient-to-br from-primary/85 to-primary/65 text-primary-foreground shadow-[0_2px_8px_rgba(15,23,42,0.08)] [a]:hover:bg-primary/75',
        secondary:
          'border border-primary/15 bg-gradient-to-br from-primary/8 to-primary/5 text-primary shadow-[0_2px_8px_rgba(15,23,42,0.08)] [a]:hover:bg-primary/12',
        destructive:
          'bg-destructive/10 text-destructive focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40 [a]:hover:bg-destructive/20',
        outline:
          'border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 text-foreground shadow-[0_2px_8px_rgba(15,23,42,0.04)] backdrop-blur-sm dark:border-white/10 dark:from-primary/8 dark:via-primary/5 dark:to-primary/3 [a]:hover:bg-muted [a]:hover:text-muted-foreground',
        ghost: 'bg-transparent hover:bg-muted hover:text-muted-foreground dark:hover:bg-muted/50',
        link: 'text-primary underline-offset-4 hover:underline'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant = 'default',
  render,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    render?: (props: React.HTMLAttributes<HTMLElement>) => React.ReactNode
  }) {
  if (render) {
    const renderProps = {
      'data-slot': 'badge',
      'data-variant': variant,
      className: cn(badgeVariants({ variant }), className),
      ...props
    }

    return render(renderProps)
  }

  return (
    <span data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
