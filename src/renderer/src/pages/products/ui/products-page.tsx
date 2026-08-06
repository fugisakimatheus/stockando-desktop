import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { PageSection, PageShell } from '@shared/ui/page-shell'

function ProductsPage(): React.JSX.Element {
  return (
    <PageShell
      title="Produtos"
      description="Cadastre e organize a base de produtos do negócio."
      actions={<Button>Novo produto</Button>}
    >
      <PageSection>
        <Card className="border-0 bg-transparent shadow-none ring-0">
          <CardHeader>
            <CardTitle>Lista de produtos</CardTitle>
            <CardDescription>Esta área será usada para listar e editar produtos no futuro.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Ainda sem dados, mas com a estrutura visual já definida.</p>
          </CardContent>
        </Card>
      </PageSection>
    </PageShell>
  )
}

export { ProductsPage }
