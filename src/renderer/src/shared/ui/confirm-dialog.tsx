'use client'

import { cn } from '@shared/lib/cn'
import { Button } from '@shared/ui/button'
import { Dialog, DialogClose, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@shared/ui/dialog'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  onConfirm: () => void
  variant?: 'destructive' | 'default'
  isLoading?: boolean
}

function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  onConfirm,
  variant = 'default',
  isLoading = false
}: ConfirmDialogProps) {
  return (
    <Dialog isOpen={open} onOpenChange={onOpenChange} showCloseButton={false}>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <DialogClose variant="outline" isDisabled={isLoading}>
          {cancelLabel}
        </DialogClose>
        <Button
          variant={variant === 'destructive' ? 'destructive' : 'default'}
          onPress={onConfirm}
          isLoading={isLoading}
          className={cn(
            variant === 'destructive' && 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
          )}
        >
          {confirmLabel}
        </Button>
      </DialogFooter>
    </Dialog>
  )
}

export { ConfirmDialog }
export type { ConfirmDialogProps }
