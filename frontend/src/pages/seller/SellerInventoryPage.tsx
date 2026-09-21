import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, RefreshCw, Truck } from 'lucide-react'
import { inventoryService } from '@/services/inventory.service'
import { productService } from '@/services/product.service'
import { extractErrorMessage } from '@/services/api'
import { formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Dialog } from '@/components/ui/Dialog'
import { EmptyState } from '@/components/ui/EmptyState'
import { Pagination } from '@/components/ui/Pagination'
import { Skeleton } from '@/components/ui/Skeleton'
import { toast } from 'react-hot-toast'

export function SellerInventoryPage() {
  const [page, setPage] = useState(1)
  const [adjustProductId, setAdjustProductId] = useState('')
  const [adjustQty, setAdjustQty] = useState(0)
  const [adjustReason, setAdjustReason] = useState('')
  const queryClient = useQueryClient()

  /*
   * Fetch products belonging to the authenticated seller. Includes both
   * newly created products (PENDING/DRAFT) and admin-approved products (ACTIVE).
   */
  const { data: products, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['my-products'],
    queryFn: () => productService.getMyProducts(),
  })

  const inventoryProducts = useMemo(() => {
    return (products ?? []).filter(p => p.status !== 'INACTIVE')
  }, [products])

  const itemsPerPage = 20
  const totalPages = Math.ceil(inventoryProducts.length / itemsPerPage) || 1
  const paginatedProducts = useMemo(() => {
    const start = (page - 1) * itemsPerPage
    return inventoryProducts.slice(start, start + itemsPerPage)
  }, [inventoryProducts, page, itemsPerPage])

  const adjust = useMutation({
    mutationFn: () => inventoryService.adjustStock(adjustProductId, { quantity: adjustQty, reason: adjustReason }),
    /*
     * A stock adjustment changes the product's stock everywhere it is
     * shown (seller product list, catalog) and can move the dashboard's
     * "Low Stock" counter, so all of those caches are refreshed from the
     * API — never patched locally.
     */
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-products'] })
      queryClient.invalidateQueries({ queryKey: ['inventory'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['product'] })
      queryClient.invalidateQueries({ queryKey: ['seller-dashboard'] })
      setAdjustProductId('')
      toast.success('Stock adjusted')
    },
    onError: (e: any) => toast.error(e.response?.data?.message || 'Error'),
  })

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Inventory</h1>

      {isLoading ? (
        <div className="border rounded-lg p-6 space-y-3">
          {Array(4).fill(0).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <div className="p-3 rounded-full bg-[var(--destructive-subtle)] text-[var(--destructive)] mb-4">
            <AlertCircle size={28} strokeWidth={1.75} />
          </div>
          <h3 className="text-lg font-medium mb-1">Could not load inventory</h3>
          <p className="text-sm text-[var(--muted)] max-w-sm mb-4">{extractErrorMessage(error)}</p>
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={`mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Try again
          </Button>
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[600px]">
              <thead className="bg-zinc-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-left p-3 font-medium">Type</th>
                  <th className="text-left p-3 font-medium">Quantity</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="p-3 font-medium text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedProducts.map(p => (
                  <tr key={p.id} className="border-b last:border-b-0 hover:bg-zinc-50/50 transition-colors">
                    <td className="p-3 font-medium text-[var(--fg)]">
                      <div className="flex items-center gap-3">
                        {p.images?.[0]?.url ? (
                          <img
                            src={p.images[0].url}
                            alt={p.name}
                            className="w-9 h-9 rounded object-cover border shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded bg-zinc-100 flex items-center justify-center text-xs font-semibold text-[var(--muted)] shrink-0">
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="font-medium text-[var(--fg)] block truncate">{p.name}</span>
                          {p.sku && <span className="text-xs text-[var(--muted)]">SKU: {p.sku}</span>}
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <span className="px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-700">
                        {typeof p.category === 'object' ? p.category?.name || 'Standard' : p.category || 'Standard'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span className={`font-semibold ${p.stock > 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                        {p.stock}
                      </span>
                    </td>
                    <td className="p-3">
                      {p.status === 'ACTIVE' ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-green-50 text-green-700 border border-green-200 font-medium">
                          Approved
                        </span>
                      ) : p.status === 'PENDING' ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                          Pending Approval
                        </span>
                      ) : p.status === 'DRAFT' ? (
                        <span className="px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-700 border border-zinc-200 font-medium">
                          Draft
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs bg-zinc-100 text-zinc-600 font-medium">
                          {p.status}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-[var(--muted)]">{formatDate(p.updatedAt || p.createdAt)}</td>
                    <td className="p-3 text-center">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setAdjustProductId(p.id)
                          setAdjustQty(0)
                          setAdjustReason('')
                        }}
                      >
                        Adjust
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {inventoryProducts.length === 0 && (
            <div className="p-8">
              <EmptyState
                icon={<Truck size={44} strokeWidth={1.5} />}
                title="No products found in inventory"
                description="Your products and inventory will automatically appear here."
              />
            </div>
          )}

          {totalPages > 1 && (
            <div className="p-4 border-t">
              <Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} />
            </div>
          )}
        </div>
      )}

      <Dialog open={!!adjustProductId} onClose={() => setAdjustProductId('')} title="Adjust Stock">
        <div className="space-y-3">
          <Input label="Quantity (+ to add, - to subtract)" type="number" value={adjustQty} onChange={e => setAdjustQty(Number(e.target.value))} />
          <Input label="Reason" value={adjustReason} onChange={e => setAdjustReason(e.target.value)} />
          <Button className="w-full" onClick={() => adjust.mutate()} disabled={!adjustReason || adjustQty === 0}>Apply</Button>
        </div>
      </Dialog>
    </div>
  )
}
