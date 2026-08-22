import { CompanyId } from '@shared/lib'
import type { CompanyId as CompanyIdType } from '@shared/lib/branded-types'

import { useActiveCompany } from './use-active-company'

/**
 * Convenience hook that returns the current active company ID as a branded type.
 *
 * Throws at render-time if no company is active — this is intentional.
 * All pages gated behind `BootstrapGate` are guaranteed to have a company,
 * so this throw signals a programming error (page rendered outside the gate).
 *
 * Returns `CompanyId` (a branded number) to prevent accidentally passing
 * a product ID or customer ID where a company ID is expected.
 *
 * @example
 * ```ts
 * function ProductsPage() {
 *   const companyId = useCompanyId()
 *   const productsQuery = useProducts(companyId, filters)
 *   // ...
 * }
 * ```
 */
function useCompanyId(): CompanyIdType {
  const { company } = useActiveCompany()

  if (!company) {
    throw new Error('useCompanyId: no active company. This hook must be used inside a page gated by BootstrapGate.')
  }

  return CompanyId(company.id)
}

export { useCompanyId }
