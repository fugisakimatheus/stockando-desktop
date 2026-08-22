import { useActiveCompany } from '@shared/hooks/use-active-company'
import { Button } from '@shared/ui/button'
import { PageShell, PageWidget } from '@shared/ui/page-shell'
import { SidebarTrigger } from '@shared/ui/sidebar'
import { SummaryCard } from '@shared/ui/summary-card'
import { useNavigate } from '@tanstack/react-router'
import {
  ArrowLeftRight,
  ArrowRight,
  Boxes,
  CheckCircle2,
  Circle,
  FileText,
  Package2,
  Plus,
  ShoppingCart,
  Tags,
  Users,
  Warehouse
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Quick Action Card
// ---------------------------------------------------------------------------

interface QuickActionProps {
  icon: React.ReactNode
  label: string
  description: string
  onClick: () => void
}

function QuickAction({ icon, label, description, onClick }: QuickActionProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-start gap-3 rounded-xl border border-border/70 bg-background/60 p-3 text-left transition-all hover:border-primary/20 hover:bg-primary/5 active:translate-y-px dark:border-white/8 dark:bg-white/3 dark:hover:border-primary/25 dark:hover:bg-primary/8"
    >
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary transition-colors group-hover:bg-primary/12 dark:bg-primary/12 dark:group-hover:bg-primary/18">
        <span className="[&_svg]:size-4">{icon}</span>
      </div>
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
    </button>
  )
}

// ---------------------------------------------------------------------------
// Setup Step
// ---------------------------------------------------------------------------

interface SetupStepProps {
  title: string
  description: string
  completed?: boolean
  onClick: () => void
}

function SetupStep({ title, description, completed = false, onClick }: SetupStepProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border border-border/70 bg-background/60 p-3 text-left transition-all hover:border-primary/20 hover:bg-primary/5 active:translate-y-px dark:border-white/8 dark:bg-white/3 dark:hover:border-primary/25 dark:hover:bg-primary/8"
    >
      {completed ? (
        <CheckCircle2 className="size-4.5 shrink-0 text-emerald-500 dark:text-emerald-400" />
      ) : (
        <Circle className="size-4.5 shrink-0 text-muted-foreground/50" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  )
}

// ---------------------------------------------------------------------------
// HomePage
// ---------------------------------------------------------------------------

function HomePage(): React.JSX.Element {
  const navigate = useNavigate()
  const { company } = useActiveCompany()
  const companyName = company?.name ?? 'sua empresa'

  return (
    <PageShell
      title="Início"
      description={`Visão geral e ações rápidas para ${companyName}.`}
      actions={
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <Button variant="outline" className="gap-1.5" onPress={() => navigate({ to: '/products' })}>
            <Plus className="size-4" />
            Novo produto
          </Button>
        </div>
      }
    >
      {/* Summary KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Produtos" value="—" icon={<Package2 />} onClick={() => navigate({ to: '/products' })} />
        <SummaryCard label="Categorias" value="—" icon={<Tags />} onClick={() => navigate({ to: '/categories' })} />
        <SummaryCard label="Clientes" value="—" icon={<Users />} onClick={() => navigate({ to: '/customers' })} />
        <SummaryCard
          label="Movimentações"
          value="—"
          icon={<ArrowLeftRight />}
          onClick={() => navigate({ to: '/stock-movements' })}
        />
      </div>

      {/* Main content: Quick Actions + Setup */}
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        {/* Quick Actions */}
        <PageWidget>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-foreground">Ações rápidas</h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <QuickAction
              icon={<Package2 />}
              label="Novo produto"
              description="Cadastrar produto no catálogo"
              onClick={() => navigate({ to: '/products' })}
            />
            <QuickAction
              icon={<Users />}
              label="Novo cliente"
              description="Adicionar cliente ao sistema"
              onClick={() => navigate({ to: '/customers' })}
            />
            <QuickAction
              icon={<ArrowLeftRight />}
              label="Movimentar estoque"
              description="Registrar entrada ou saída"
              onClick={() => navigate({ to: '/stock-movements' })}
            />
            <QuickAction
              icon={<ShoppingCart />}
              label="Pedido de venda"
              description="Criar novo pedido de venda"
              onClick={() => navigate({ to: '/sales-orders' })}
            />
            <QuickAction
              icon={<FileText />}
              label="Emitir NF-e"
              description="Gerar nota fiscal eletrônica"
              onClick={() => navigate({ to: '/fiscal-documents' })}
            />
            <QuickAction
              icon={<Warehouse />}
              label="Gerenciar estoque"
              description="Visualizar posição de estoque"
              onClick={() => navigate({ to: '/stock' })}
            />
          </div>
        </PageWidget>

        {/* Setup / Onboarding */}
        <PageWidget>
          <div className="mb-3 space-y-1">
            <h2 className="text-sm font-semibold text-foreground">Configuração inicial</h2>
            <p className="text-xs text-muted-foreground">Passos recomendados para começar a operar.</p>
          </div>
          <div className="space-y-2">
            <SetupStep
              title="Cadastrar categorias"
              description="Organize seus produtos por grupo"
              onClick={() => navigate({ to: '/categories' })}
            />
            <SetupStep
              title="Adicionar produtos"
              description="Monte sua base de catálogo"
              onClick={() => navigate({ to: '/products' })}
            />
            <SetupStep
              title="Configurar armazéns"
              description="Defina locais de estoque"
              onClick={() => navigate({ to: '/warehouses' })}
            />
            <SetupStep
              title="Cadastrar clientes"
              description="Adicione seus clientes ao sistema"
              onClick={() => navigate({ to: '/customers' })}
            />
            <SetupStep
              title="Ajustar configurações"
              description="Regime tributário e dados fiscais"
              onClick={() => navigate({ to: '/settings' })}
            />
          </div>
        </PageWidget>
      </div>

      {/* Feature highlight row */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            title: 'Catálogo',
            description: 'Produtos, categorias e unidades de medida centralizados.',
            icon: Boxes,
            href: '/products' as const
          },
          {
            title: 'Estoque',
            description: 'Controle de entradas, saídas e ajustes por armazém.',
            icon: Warehouse,
            href: '/stock' as const
          },
          {
            title: 'Comercial',
            description: 'Clientes, orçamentos e pedidos de venda integrados.',
            icon: ShoppingCart,
            href: '/customers' as const
          }
        ].map(({ title, description, icon: Icon, href }) => (
          <button
            key={title}
            type="button"
            onClick={() => navigate({ to: href })}
            className="group flex flex-col gap-3 rounded-2xl border border-border/70 bg-gradient-to-br from-primary/4 via-primary/2 to-transparent p-4 text-left transition-all hover:border-primary/20 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] active:translate-y-px dark:border-white/8 dark:from-primary/8 dark:via-primary/4 dark:to-transparent dark:hover:border-primary/25 dark:hover:shadow-[0_8px_24px_rgba(2,6,23,0.3)]"
          >
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary/8 text-primary transition-colors group-hover:bg-primary/12 dark:bg-primary/12 dark:group-hover:bg-primary/18">
              <Icon className="size-4.5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="text-xs text-pretty text-muted-foreground">{description}</p>
            </div>
          </button>
        ))}
      </div>
    </PageShell>
  )
}

export { HomePage }
