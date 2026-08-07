import { Button } from '@shared/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@shared/ui/card'
import { PageShell, PageSection } from '@shared/ui/page-shell'
import { SidebarTrigger } from '@shared/ui/sidebar'
import { ArrowRight, Boxes, TrendingUp, Warehouse } from 'lucide-react'

function HomePage(): React.JSX.Element {
  return (
    <PageShell
      title="Dashboard"
      description="Visão geral inicial do sistema e próximos passos do fluxo operacional."
      actions={
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <Button variant="outline">Nova ação</Button>
        </div>
      }
    >
      <div className="grid gap-4 xl:grid-cols-[1.3fr_0.9fr]">
        <PageSection className="overflow-hidden bg-gradient-to-br from-primary/8 via-primary/5 to-primary/2 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-background/70 px-3 py-1 text-xs font-medium tracking-[0.24em] text-primary uppercase">
                <TrendingUp className="size-3.5" />
                Visão do dia
              </div>
              <div className="space-y-2">
                <h2 className="text-2xl font-semibold tracking-tight text-foreground">
                  Seu negócio está pronto para crescer.
                </h2>
                <p className="max-w-xl text-sm text-muted-foreground">
                  Centralize produtos, categorias e operações de forma simples, com uma interface pensada para
                  produtividade.
                </p>
              </div>
            </div>
            <Button className="w-fit">
              Explorar fluxo
              <ArrowRight className="size-4" />
            </Button>
          </div>
        </PageSection>

        <Card className="border-0 bg-transparent shadow-none ring-0">
          <CardHeader>
            <CardTitle>Próximos passos</CardTitle>
            <CardDescription>Itens prioritários para evolução do MVP.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              ['Produtos e categorias', 'Organização da base comercial'],
              ['Fluxo de estoque', 'Movimentação e controle básico'],
              ['Configurações da empresa', 'Ajustes iniciais do ambiente']
            ].map(([title, description]) => (
              <div key={title} className="rounded-2xl border border-border/70 bg-background/70 p-3">
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{description}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          {
            title: 'Produtos',
            description: 'Base comercial pronta para crescer com o catálogo.',
            icon: Boxes,
            accent: 'from-primary/8 to-primary/3'
          },
          {
            title: 'Estoque',
            description: 'Controle operacional com foco em rastreio simples.',
            icon: Warehouse,
            accent: 'from-primary/6 to-primary/2'
          },
          {
            title: 'Operações',
            description: 'Fluxos orgânicos para apoiar o dia a dia.',
            icon: TrendingUp,
            accent: 'from-primary/6 to-primary/2'
          }
        ].map(({ title, description, icon: Icon, accent }) => (
          <Card key={title} className={`border-border/70 bg-gradient-to-br ${accent}`}>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-2xl bg-background/80 text-foreground shadow-sm">
                <Icon className="size-4" />
              </div>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </PageShell>
  )
}

export { HomePage }
