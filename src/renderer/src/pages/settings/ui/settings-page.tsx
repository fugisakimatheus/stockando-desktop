import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { PageSection, PageShell } from '@shared/ui/page-shell'

function SettingsPage(): React.JSX.Element {
  return (
    <PageShell
      title="Configurações"
      description="Ajustes gerais da empresa e do ambiente do sistema."
      actions={<Button variant="outline">Salvar</Button>}
    >
      <PageSection>
        <Card className="border-0 bg-transparent shadow-none ring-0">
          <CardHeader>
            <CardTitle>Preferências</CardTitle>
            <CardDescription>Área para configurações operacionais e de empresa.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">O padrão visual das páginas está consolidado.</p>
          </CardContent>
        </Card>
      </PageSection>
    </PageShell>
  )
}

export { SettingsPage }
