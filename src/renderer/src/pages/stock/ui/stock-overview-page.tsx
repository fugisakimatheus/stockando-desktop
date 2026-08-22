import { useProductStock, useWarehouseOverview, useReconcile } from '@pages/stock/hooks/use-stock'
import type { Pagination, ReconciliationResult } from '@shared/api'
import { useWarehouses } from '@shared/hooks/use-warehouses'
import { Badge } from '@shared/ui/badge'
import { Button } from '@shared/ui/button'
import { EmptyState } from '@shared/ui/empty-state'
import { Input } from '@shared/ui/input'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shared/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@shared/ui/tabs'
import { ChevronLeft, ChevronRight, CheckCircle2, Package, RefreshCw, Warehouse, XCircle } from 'lucide-react'
import { useState } from 'react'

const COMPANY_ID = 1
const PAGE_SIZE = 20

function StockOverviewPage(): React.JSX.Element {
  return (
    <PageShell title="Estoque" description="Visão geral de saldos por armazém ou por produto.">
      <Tabs defaultSelectedKey="by-warehouse">
        <TabsList>
          <TabsTrigger id="by-warehouse">
            <Warehouse className="size-4" />
            Por armazém
          </TabsTrigger>
          <TabsTrigger id="by-product">
            <Package className="size-4" />
            Por produto
          </TabsTrigger>
          <TabsTrigger id="reconciliation">
            <RefreshCw className="size-4" />
            Reconciliação
          </TabsTrigger>
        </TabsList>

        <TabsContent id="by-warehouse">
          <WarehouseView />
        </TabsContent>

        <TabsContent id="by-product">
          <ProductView />
        </TabsContent>

        <TabsContent id="reconciliation">
          <ReconciliationView />
        </TabsContent>
      </Tabs>
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// Warehouse View — select a warehouse, show paginated stock at that location
// ---------------------------------------------------------------------------

function WarehouseView(): React.JSX.Element {
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [pagination, setPagination] = useState<Pagination>({ limit: PAGE_SIZE, offset: 0 })

  const { data: warehouses, isLoading: loadingWarehouses } = useWarehouses(COMPANY_ID)

  const { data: stockData, isLoading: loadingStock } = useWarehouseOverview(
    COMPANY_ID,
    selectedWarehouseId ?? 0,
    pagination
  )

  const totalPages = stockData ? Math.ceil(stockData.total / pagination.limit) : 0
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1

  function goToPage(page: number): void {
    setPagination((prev) => ({ ...prev, offset: (page - 1) * prev.limit }))
  }

  return (
    <PageSection title="Saldo por armazém" description="Selecione um armazém para visualizar o estoque.">
      <div className="mb-4">
        <Select
          aria-label="Selecionar armazém"
          placeholder="Escolha um armazém"
          selectedKey={selectedWarehouseId !== null ? String(selectedWarehouseId) : null}
          onSelectionChange={(key) => {
            setSelectedWarehouseId(key ? Number(key) : null)
            setPagination({ limit: PAGE_SIZE, offset: 0 })
          }}
        >
          <SelectTrigger className="w-72">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {loadingWarehouses ? (
              <SelectItem id="loading" textValue="Carregando...">
                Carregando...
              </SelectItem>
            ) : (
              (warehouses ?? []).map((wh) => (
                <SelectItem key={wh.id} id={String(wh.id)} textValue={`${wh.name} (${wh.code})`}>
                  {wh.name} <span className="text-muted-foreground">({wh.code})</span>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {selectedWarehouseId === null ? (
        <EmptyState
          icon={<Warehouse className="size-10" />}
          title="Nenhum armazém selecionado"
          description="Selecione um armazém acima para ver os produtos em estoque."
        />
      ) : loadingStock ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Carregando estoque...
        </div>
      ) : !stockData || stockData.data.length === 0 ? (
        <EmptyState
          icon={<Package className="size-10" />}
          title="Nenhum produto neste armazém"
          description="Ainda não há registros de estoque para este armazém."
        />
      ) : (
        <>
          <Table aria-label="Estoque do armazém">
            <TableHeader>
              <TableHead isRowHeader>Produto</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Quantidade</TableHead>
              <TableHead>Reservado</TableHead>
              <TableHead>Disponível</TableHead>
            </TableHeader>
            <TableBody items={stockData.data}>
              {(item) => (
                <TableRow id={item.productId}>
                  <TableCell className="font-medium">{item.productName}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{item.productSku}</Badge>
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>{item.reservedQuantity}</TableCell>
                  <TableCell className="font-semibold">{item.quantity - item.reservedQuantity}</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {stockData.total} produto{stockData.total !== 1 ? 's' : ''} encontrado
                {stockData.total !== 1 ? 's' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={currentPage <= 1}
                  onPress={() => goToPage(currentPage - 1)}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <span className="text-sm text-muted-foreground">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  isDisabled={currentPage >= totalPages}
                  onPress={() => goToPage(currentPage + 1)}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </PageSection>
  )
}

// ---------------------------------------------------------------------------
// Product View — input a product ID, show stock per warehouse
// ---------------------------------------------------------------------------

function ProductView(): React.JSX.Element {
  const [productIdInput, setProductIdInput] = useState('')
  const [activeProductId, setActiveProductId] = useState<number | null>(null)

  const { data: balances, isLoading } = useProductStock(COMPANY_ID, activeProductId ?? 0)

  function handleSearch(): void {
    const parsed = Number(productIdInput)
    if (!Number.isNaN(parsed) && parsed > 0) {
      setActiveProductId(parsed)
    }
  }

  return (
    <PageSection
      title="Saldo por produto"
      description="Informe o ID de um produto para visualizar o estoque em cada armazém."
    >
      <div className="mb-4 flex items-center gap-2">
        <Input
          aria-label="ID do produto"
          placeholder="ID do produto"
          value={productIdInput}
          onChange={(e) => setProductIdInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSearch()
          }}
          className="w-48"
        />
        <Button variant="outline" onPress={handleSearch}>
          Buscar
        </Button>
      </div>

      {activeProductId === null ? (
        <EmptyState
          icon={<Package className="size-10" />}
          title="Nenhum produto selecionado"
          description="Informe o ID de um produto acima para consultar seus saldos."
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">Carregando saldos...</div>
      ) : !balances || balances.length === 0 ? (
        <EmptyState
          icon={<Warehouse className="size-10" />}
          title="Nenhum saldo encontrado"
          description="Este produto não possui estoque registrado em nenhum armazém."
        />
      ) : (
        <Table aria-label="Saldos do produto por armazém">
          <TableHeader>
            <TableHead isRowHeader>Armazém</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Quantidade</TableHead>
            <TableHead>Reservado</TableHead>
            <TableHead>Disponível</TableHead>
          </TableHeader>
          <TableBody items={balances}>
            {(balance) => (
              <TableRow id={balance.warehouseId}>
                <TableCell className="font-medium">{balance.warehouseName}</TableCell>
                <TableCell>
                  <Badge variant="outline">{balance.warehouseCode}</Badge>
                </TableCell>
                <TableCell>{balance.quantity}</TableCell>
                <TableCell>{balance.reservedQuantity}</TableCell>
                <TableCell className="font-semibold">{balance.quantity - balance.reservedQuantity}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      )}
    </PageSection>
  )
}

// ---------------------------------------------------------------------------
// Reconciliation View — run reconciliation for a product/warehouse pair
// ---------------------------------------------------------------------------

function ReconciliationView(): React.JSX.Element {
  const [productIdInput, setProductIdInput] = useState('')
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null)
  const [result, setResult] = useState<ReconciliationResult | null>(null)

  const { data: warehouses, isLoading: loadingWarehouses } = useWarehouses(COMPANY_ID)
  const reconcileMutation = useReconcile(COMPANY_ID)

  function handleReconcile(): void {
    const productId = Number(productIdInput)
    if (Number.isNaN(productId) || productId <= 0 || selectedWarehouseId === null) return

    reconcileMutation.mutate(
      { productId, warehouseId: selectedWarehouseId },
      {
        onSuccess: (data) => {
          setResult(data)
        }
      }
    )
  }

  const canRun = Number(productIdInput) > 0 && selectedWarehouseId !== null && !reconcileMutation.isPending

  return (
    <PageSection
      title="Reconciliação de estoque"
      description="Compare o saldo calculado (soma de movimentações) com o saldo materializado para detectar discrepâncias."
    >
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="reconcile-product-id">
            ID do produto
          </label>
          <Input
            id="reconcile-product-id"
            aria-label="ID do produto para reconciliação"
            placeholder="Ex: 1"
            value={productIdInput}
            onChange={(e) => setProductIdInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canRun) handleReconcile()
            }}
            className="w-40"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">Armazém</label>
          <Select
            aria-label="Selecionar armazém para reconciliação"
            placeholder="Escolha um armazém"
            selectedKey={selectedWarehouseId !== null ? String(selectedWarehouseId) : null}
            onSelectionChange={(key) => setSelectedWarehouseId(key ? Number(key) : null)}
          >
            <SelectTrigger className="w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {loadingWarehouses ? (
                <SelectItem id="loading" textValue="Carregando...">
                  Carregando...
                </SelectItem>
              ) : (
                (warehouses ?? []).map((wh) => (
                  <SelectItem key={wh.id} id={String(wh.id)} textValue={`${wh.name} (${wh.code})`}>
                    {wh.name} <span className="text-muted-foreground">({wh.code})</span>
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <Button variant="default" onPress={handleReconcile} isDisabled={!canRun}>
          <RefreshCw className="size-4" />
          Reconciliar
        </Button>
      </div>

      {reconcileMutation.isPending && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Executando reconciliação...
        </div>
      )}

      {reconcileMutation.isError && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Erro ao executar reconciliação. Verifique se o produto e armazém são válidos.
        </div>
      )}

      {result && !reconcileMutation.isPending && <ReconciliationResultCard result={result} />}
    </PageSection>
  )
}

// ---------------------------------------------------------------------------
// Reconciliation Result Card
// ---------------------------------------------------------------------------

function ReconciliationResultCard({ result }: { result: ReconciliationResult }): React.JSX.Element {
  return (
    <div className="rounded-xl border border-border/70 bg-gradient-to-br from-card/80 to-card/60 p-6 shadow-sm backdrop-blur-sm dark:border-white/10">
      <div className="mb-4 flex items-center gap-3">
        {result.isConsistent ? (
          <>
            <CheckCircle2 className="size-6 text-emerald-500" />
            <h3 className="text-base font-medium text-foreground">Estoque consistente</h3>
          </>
        ) : (
          <>
            <XCircle className="size-6 text-destructive" />
            <h3 className="text-base font-medium text-foreground">Discrepância detectada</h3>
          </>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border/50 bg-background/50 p-4 dark:border-white/5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Saldo calculado</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{result.computedBalance}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Soma das movimentações</p>
        </div>

        <div className="rounded-lg border border-border/50 bg-background/50 p-4 dark:border-white/5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Saldo materializado</p>
          <p className="mt-1 text-2xl font-semibold text-foreground">{result.materializedBalance}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Registro de estoque</p>
        </div>

        <div className="rounded-lg border border-border/50 bg-background/50 p-4 dark:border-white/5">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Discrepância</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              result.discrepancy === 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'
            }`}
          >
            {result.discrepancy > 0 ? '+' : ''}
            {result.discrepancy}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Calculado − materializado</p>
        </div>
      </div>

      {!result.isConsistent && (
        <div className="mt-4 rounded-lg border border-amber-200/60 bg-amber-50/50 p-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-950/30 dark:text-amber-200">
          Há uma diferença entre o saldo esperado e o registrado. Considere criar um ajuste de estoque para corrigir a
          discrepância.
        </div>
      )}
    </div>
  )
}

export { StockOverviewPage }
