import { cn } from '@shared/lib/cn'
import * as React from 'react'

function Avatar({
  className,
  size = 'default',
  ...props
}: React.ComponentProps<'div'> & {
  size?: 'default' | 'sm' | 'lg'
}) {
  return (
    <div
      data-slot="avatar"
      data-size={size}
      className={cn(
        'group/avatar relative flex size-8 shrink-0 rounded-full border border-border/70 bg-gradient-to-br from-muted/70 via-background/70 to-muted/50 shadow-[0_4px_12px_rgba(15,23,42,0.05)] select-none after:absolute after:inset-0 after:rounded-full after:border after:border-border/60 after:mix-blend-darken data-[size=lg]:size-10 data-[size=sm]:size-6 dark:border-white/10 dark:from-muted/60 dark:via-background/60 dark:to-muted/40 dark:after:mix-blend-lighten',
        className
      )}
      {...props}
    />
  )
}

type ImageState = 'loading' | 'loaded' | 'error'

function AvatarImage({ className, ...props }: React.ComponentProps<'img'>) {
  const [state, setState] = React.useState<ImageState>(props.src ? 'loading' : 'error')
  return (
    <img
      data-slot="avatar-image"
      alt={props.alt || ''}
      data-state={state}
      onLoad={() => setState('loaded')}
      onError={() => setState('error')}
      className={cn('peer aspect-square size-full rounded-full object-cover data-[state=error]:hidden', className)}
      {...props}
    />
  )
}

function AvatarFallback({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-fallback"
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-muted/80 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] group-data-[size=sm]/avatar:text-xs peer-data-[state=error]:flex peer-[*]:hidden dark:bg-muted/70',
        className
      )}
      {...props}
    />
  )
}

function AvatarBadge({ className, ...props }: React.ComponentProps<'span'>) {
  return (
    <span
      data-slot="avatar-badge"
      className={cn(
        'absolute right-0 bottom-0 z-10 inline-flex items-center justify-center rounded-full bg-primary text-primary-foreground bg-blend-color ring-2 ring-background select-none',
        'group-data-[size=sm]/avatar:size-2 group-data-[size=sm]/avatar:[&>svg]:hidden',
        'group-data-[size=default]/avatar:size-2.5 group-data-[size=default]/avatar:[&>svg]:size-2',
        'group-data-[size=lg]/avatar:size-3 group-data-[size=lg]/avatar:[&>svg]:size-2',
        className
      )}
      {...props}
    />
  )
}

function AvatarGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group"
      className={cn(
        'group/avatar-group flex -space-x-2 *:data-[slot=avatar]:ring-2 *:data-[slot=avatar]:ring-background',
        className
      )}
      {...props}
    />
  )
}

function AvatarGroupCount({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="avatar-group-count"
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center rounded-full bg-muted/80 text-sm text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] ring-2 ring-background group-has-data-[size=lg]/avatar-group:size-10 group-has-data-[size=sm]/avatar-group:size-6 dark:bg-muted/70 [&>svg]:size-4 group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 group-has-data-[size=sm]/avatar-group:[&>svg]:size-3',
        className
      )}
      {...props}
    />
  )
}

export { Avatar, AvatarImage, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarBadge }
