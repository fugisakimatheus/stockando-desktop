import { CreateCompanyDialog } from '@pages/companies'
import { Button } from '@shared/ui/button'
import { Building2, Plus } from 'lucide-react'

function NoCompaniesScreen() {
  return (
    <div className="flex min-h-svh items-center justify-center bg-background p-6">
      <div className="flex max-w-md flex-col items-center gap-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 to-primary/5 shadow-[0_8px_24px_rgba(59,130,246,0.08)]">
          <Building2 className="size-8 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-semibold text-foreground">Bem-vindo ao Stockando</h1>
          <p className="text-sm text-muted-foreground">
            Crie sua primeira empresa para começar a gerenciar seu estoque e operações.
          </p>
        </div>

        <CreateCompanyDialog>
          <Button size="lg" className="gap-2">
            <Plus className="size-4" data-icon="inline-start" />
            <span>Criar empresa</span>
          </Button>
        </CreateCompanyDialog>
      </div>
    </div>
  )
}

export { NoCompaniesScreen }
