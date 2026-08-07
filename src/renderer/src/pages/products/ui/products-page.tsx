import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Plus, Search, Sparkles } from 'lucide-react'

function ProductsPage(): React.JSX.Element {
  return (
    <PageShell
      title="Produtos"
      description="Cadastre e organize a base de produtos do negócio."
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2">
            <Search className="size-4" />
            Buscar
          </Button>
          <Button className="gap-2">
            <Plus className="size-4" />
            Novo produto
          </Button>
        </div>
      }
    >
      <PageSection>
        <div className="rounded-[24px] border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1 p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-medium text-primary">
            <Sparkles className="size-4" />
            Gestão de catálogo
          </div>
          <EmptyState
            title="Ainda não há produtos cadastrados"
            description="Comece adicionando o primeiro item para construir o catálogo da sua operação."
            action={
              <Button className="gap-2">
                <Plus className="size-4" />
                Adicionar produto
              </Button>
            }
          />
        </div>
      </PageSection>
    </PageShell>
  )
}

export { ProductsPage }
