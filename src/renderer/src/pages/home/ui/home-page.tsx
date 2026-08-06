import { Button } from '@shared/ui/button'
import { PageShell, PageWidget } from '@shared/ui/page-shell'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger
} from '@shared/ui/sidebar'

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
      sidebar={
        <Sidebar variant="inset" collapsible="icon" className="border-0 bg-transparent">
          <SidebarHeader className="px-3 py-3">
            <div className="flex items-center gap-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-2 shadow-[0_4px_14px_rgba(15,23,42,0.05)] backdrop-blur-sm">
              <div className="flex size-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-sm font-semibold text-primary-foreground">
                S
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">Stockando</p>
                <p className="truncate text-xs text-muted-foreground">Painel principal</p>
              </div>
            </div>
          </SidebarHeader>
          <SidebarSeparator className="mx-3 mb-2" />
          <SidebarContent className="px-2 pb-2">
            <SidebarGroup>
              <SidebarGroupLabel className="px-2 text-[11px] tracking-[0.24em] text-muted-foreground/80 uppercase">
                Navegação
              </SidebarGroupLabel>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/" isActive tooltip="Início">
                    Início
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/products" tooltip="Produtos">
                    Produtos
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/categories" tooltip="Categorias">
                    Categorias
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton href="/settings" tooltip="Configurações">
                    Configurações
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroup>
          </SidebarContent>
        </Sidebar>
      }
    >
      <div className="grid gap-4 xl:grid-cols-2">
        <PageWidget>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Resumo rápido</h2>
            <p className="text-sm text-muted-foreground">Conteúdo inicial para o painel principal.</p>
            <p className="text-sm text-muted-foreground">A estrutura visual da página já está padronizada.</p>
          </div>
        </PageWidget>

        <PageWidget>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold tracking-tight text-foreground">Próximos passos</h2>
            <p className="text-sm text-muted-foreground">Itens prioritários para evolução do MVP.</p>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Produtos e categorias</li>
              <li>Fluxo de estoque básico</li>
              <li>Configurações da empresa</li>
            </ul>
          </div>
        </PageWidget>
      </div>
    </PageShell>
  )
}

export { HomePage }
