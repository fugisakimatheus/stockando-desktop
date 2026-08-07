import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Save, Settings2 } from 'lucide-react'

function SettingsPage(): React.JSX.Element {
  return (
    <PageShell
      title="Configurações"
      description="Ajustes gerais da empresa e do ambiente do sistema."
      actions={
        <Button variant="outline" className="gap-2">
          <Save className="size-4" />
          Salvar
        </Button>
      }
    >
      <PageSection>
        <Card className="border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-primary/1">
          <CardHeader>
            <div className="flex size-10 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
              <Settings2 className="size-4" />
            </div>
            <CardTitle>Preferências</CardTitle>
            <CardDescription>Área para configurações operacionais e de empresa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ['Empresa', 'Dados principais e identidade da operação'],
              ['Usuários', 'Perfis e permissões de acesso'],
              ['Ambiente', 'Preferências visuais e operação local']
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </PageSection>
    </PageShell>
  )
}

export { SettingsPage }
