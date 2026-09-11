import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { invalidateSellerData } from './sellerData'

/*
 * Unit coverage for the shared seller-data invalidation helper: every
 * mutation that moves money, stock or counts must refresh ALL derived
 * caches (dashboard, analytics, orders, returns, customers, settlement),
 * never just the list the mutation was triggered from.
 */

type InvalidateSpy = { mock: { calls: unknown[][] } }

const invalidatedRootKeys = (spy: InvalidateSpy): string[] =>
  spy.mock.calls.map(
    (call: unknown[]) =>
      ((call[0] as { queryKey?: string[] } | undefined)?.queryKey?.[0] ?? '') as string,
  )

describe('invalidateSellerData', () => {
  it('invalidates every seller-facing derived cache', () => {
    const queryClient = new QueryClient()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateSellerData(queryClient)

    const keys = invalidatedRootKeys(spy)
    expect(keys).toEqual(
      expect.arrayContaining([
        'seller-dashboard',
        'orders',
        'order',
        'tracking',
        'invoice',
        'seller-returns',
        'returns',
        'return',
        'sales',
        'revenue',
        'top-products',
        'category-performance',
        'customers',
        'customer-orders',
        'seller-settlement',
        'coupons',
      ]),
    )
  })

  it('leaves product/stock caches untouched unless inventory moved', () => {
    const queryClient = new QueryClient()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateSellerData(queryClient)

    const keys = invalidatedRootKeys(spy)
    for (const stockKey of ['my-products', 'products', 'product', 'inventory']) {
      expect(keys).not.toContain(stockKey)
    }
  })

  it('also invalidates product/stock caches when inventory moved', () => {
    const queryClient = new QueryClient()
    const spy = vi.spyOn(queryClient, 'invalidateQueries')

    invalidateSellerData(queryClient, { inventory: true })

    const keys = invalidatedRootKeys(spy)
    expect(keys).toEqual(
      expect.arrayContaining(['my-products', 'products', 'product', 'inventory']),
    )
    // The derived seller data is still refreshed in the same pass.
    expect(keys).toContain('seller-dashboard')
  })
})
