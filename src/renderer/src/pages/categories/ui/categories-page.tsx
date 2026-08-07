import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { EmptyState } from '@shared/ui/empty-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { FolderTree, Plus } from 'lucide-react'

function CategoriesPage(): React.JSX.Element {
  return (
    <PageShell
      title="Categorias"
      description="Organize os produtos por categorias e subcategorias."
      actions={
        <Button variant="outline" className="gap-2">
          <Plus className="size-4" />
          Nova categoria
        </Button>
      }
    >
      <PageSection>
        <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
              <FolderTree className="size-4" />
            </div>
            <CardTitle>Estrutura de categorias</CardTitle>
            <CardDescription>Espaço para lista e manutenção das categorias do catálogo.</CardDescription>
          </CardHeader>
          <CardContent>
            <EmptyState
              title="Nenhuma categoria criada ainda"
              description="Defina a estrutura inicial para organizar o catálogo com mais clareza."
            />
          </CardContent>
        </Card>
      </PageSection>
    </PageShell>
  )
}

export { CategoriesPage }
