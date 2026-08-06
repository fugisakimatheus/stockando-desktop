import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { PageSection, PageShell } from '@shared/ui/page-shell'

function CategoriesPage(): React.JSX.Element {
  return (
    <PageShell
      title="Categorias"
      description="Organize os produtos por categorias e subcategorias."
      actions={<Button variant="outline">Nova categoria</Button>}
    >
      <PageSection>
        <Card className="border-0 bg-transparent shadow-none ring-0">
          <CardHeader>
            <CardTitle>Estrutura de categorias</CardTitle>
            <CardDescription>Espaço para lista e manutenção das categorias do catálogo.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">A interface já segue o layout base das demais páginas.</p>
          </CardContent>
        </Card>
      </PageSection>
    </PageShell>
  )
}

export { CategoriesPage }
