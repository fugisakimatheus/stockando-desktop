import { useProductDetail } from '@pages/products/hooks/use-products'
import { useProductStock } from '@pages/stock/hooks/use-stock'
import type { StockBalance } from '@pages/stock/hooks/use-stock'
import { Badge } from '@shared/ui/badge'
import { ErrorState } from '@shared/ui/error-state'
import { LoadingState } from '@shared/ui/loading-state'
import { PageSection, PageShell } from '@shared/ui/page-shell'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@shared/ui/table'
import { Warehouse } from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPANY_ID = 1

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

// ---------------------------------------------------------------------------
// ProductDetailPage
// ---------------------------------------------------------------------------

function ProductDetailPage({ productId }: { productId: number }): React.JSX.Element {
  const productQuery = useProductDetail(COMPANY_ID, productId)
  const stockQuery = useProductStock(COMPANY_ID, productId)

  if (productQuery.isLoading) {
    return (
      <PageShell>
        <LoadingState message="Carregando produto..." />
      </PageShell>
    )
  }

  if (productQuery.isError) {
    return (
      <PageShell>
        <ErrorState
          title="Erro ao carregar produto"
          description="Não foi possível buscar os detalhes do produto. Tente novamente."
          onRetry={() => productQuery.refetch()}
        />
      </PageShell>
    )
  }

  const product = productQuery.data
  if (!product) {
    return (
      <PageShell>
        <ErrorState title="Produto não encontrado" description="O produto solicitado não foi encontrado." />
      </PageShell>
    )
  }

  const balances = stockQuery.data ?? []

  return (
    <PageShell title={product.name} description={`SKU: ${product.sku}`}>
      {/* Product Details */}
      <PageSection title="Informações do produto">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <DetailField label="SKU" value={product.sku} />
          <DetailField label="Nome" value={product.name} />
          <DetailField label="Descrição" value={product.description ?? '—'} />
          <DetailField label="Código de barras" value={product.barcode ?? '—'} />
          <DetailField label="Preço de custo" value={formatCurrency(product.costPrice)} />
          <DetailField label="Preço de venda" value={formatCurrency(product.salePrice)} />
          <DetailField label="Categoria" value={product.categoryName ?? '—'} />
          <DetailField
            label="Unidade"
            value={product.unitSymbol ? `${product.unitName} (${product.unitSymbol})` : '—'}
          />
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Controla estoque</p>
            <Badge variant={product.trackInventory ? 'secondary' : 'outline'}>
              {product.trackInventory ? 'Sim' : 'Não'}
            </Badge>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Status</p>
            <Badge variant={product.status === 'active' ? 'secondary' : 'outline'}>
              {product.status === 'active' ? 'Ativo' : 'Inativo'}
            </Badge>
          </div>
        </div>
      </PageSection>

      {/* Stock Balances */}
      {product.trackInventory && (
        <PageSection title="Estoque por armazém">
          {stockQuery.isLoading && <LoadingState message="Carregando estoque..." />}

          {stockQuery.isError && (
            <ErrorState
              title="Erro ao carregar estoque"
              description="Não foi possível buscar os saldos de estoque."
              onRetry={() => stockQuery.refetch()}
            />
          )}

          {stockQuery.isSuccess && balances.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Warehouse className="size-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">Nenhum saldo de estoque registrado para este produto.</p>
            </div>
          )}

          {stockQuery.isSuccess && balances.length > 0 && (
            <Table aria-label="Estoque por armazém">
              <TableHeader>
                <TableHead isRowHeader>Armazém</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Quantidade</TableHead>
                <TableHead>Reservado</TableHead>
                <TableHead>Disponível</TableHead>
              </TableHeader>
              <TableBody>
                {balances.map((balance: StockBalance) => (
                  <TableRow key={balance.warehouseId}>
                    <TableCell className="font-medium">{balance.warehouseName}</TableCell>
                    <TableCell>
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{balance.warehouseCode}</code>
                    </TableCell>
                    <TableCell>{balance.quantity}</TableCell>
                    <TableCell>{balance.reservedQuantity}</TableCell>
                    <TableCell className="font-medium">{balance.quantity - balance.reservedQuantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PageSection>
      )}
    </PageShell>
  )
}

// ---------------------------------------------------------------------------
// DetailField
// ---------------------------------------------------------------------------

function DetailField({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground">{value}</p>
    </div>
  )
}

export { ProductDetailPage }
