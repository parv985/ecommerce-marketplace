import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

/*
 * Seller profile / edit-profile with the shared State/City comboboxes:
 *   - server values prefill both comboboxes when the form opens;
 *   - a pristine form still reports "No changes to update." and never
 *     hits the API (the diff-based PATCH contract);
 *   - changing the state clears an invalid city and blocks the submit;
 *   - only the changed location pair is PATCHed;
 *   - picking a city first auto-resolves its state.
 */

const getProfile = vi.hoisted(() => vi.fn())
const updateProfile = vi.hoisted(() => vi.fn())
const toastDefault = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@/services/seller.service', () => ({
  sellerService: {
    getProfile: () => getProfile(),
    updateProfile: (data: unknown) => updateProfile(data),
    uploadDocument: vi.fn(),
    deleteDocument: vi.fn(),
    getCount: vi.fn(),
  },
}))

vi.mock('@/components/ui/ProfileAvatar', () => ({
  ProfileAvatar: () => <div data-testid="avatar" />,
}))

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(toastDefault, {
    success: toastSuccess,
    error: toastError,
  })
  return { toast, default: toast }
})

import { SellerProfilePage } from './SellerProfilePage'
import type { SellerProfile } from '@/types/api'

const PROFILE: SellerProfile = {
  id: 'seller-1',
  userId: 'user-1',
  businessName: 'Test Traders',
  gstin: '27AAPFU0939F1ZV',
  pan: 'AAPFU0939F',
  phone: null,
  bankAccountHolderName: 'Test Seller',
  bankAccountNumber: '123456789012',
  ifscCode: 'HDFC0001234',
  address: {
    addressLine1: '10 Lake View',
    addressLine2: '',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380001',
  },
  documents: [],
  status: 'APPROVED',
  statusReason: null,
  createdAt: '2026-01-01T00:00:00.000Z',
}

const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  })

const renderPage = () =>
  render(
    <QueryClientProvider client={makeQueryClient()}>
      <MemoryRouter>
        <SellerProfilePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )

const combobox = async (name: 'State' | 'City'): Promise<HTMLInputElement> =>
  (await screen.findByRole('combobox', { name })) as HTMLInputElement

beforeEach(() => {
  vi.clearAllMocks()
  getProfile.mockResolvedValue(PROFILE)
  updateProfile.mockResolvedValue(undefined)
})

describe('SellerProfilePage State/City fields', () => {
  it('prefills both comboboxes and keeps a pristine form off the API', async () => {
    const user = userEvent.setup()
    renderPage()

    expect(await combobox('State')).toHaveValue('Gujarat')
    expect(await combobox('City')).toHaveValue('Ahmedabad')

    await user.click(screen.getByRole('button', { name: 'Update Profile' }))

    await waitFor(() =>
      expect(toastDefault).toHaveBeenCalledWith('No changes to update.'),
    )
    expect(updateProfile).not.toHaveBeenCalled()
  })

  it('clears an invalid city on state change, blocks submit, then sends only the new pair', async () => {
    const user = userEvent.setup()
    renderPage()

    // Change State Gujarat → Rajasthan: the Gujarat city is cleared.
    await user.click(await combobox('State'))
    await user.type(await combobox('State'), 'rajasthan')
    await user.click(await screen.findByRole('option', { name: 'Rajasthan' }))

    expect(
      await screen.findByText(/was cleared because it is not in Rajasthan/),
    ).toBeInTheDocument()
    expect(await combobox('City')).toHaveValue('')

    // Submitting without a city is blocked — no PATCH goes out.
    await user.click(screen.getByRole('button', { name: 'Update Profile' }))
    await screen.findByText('City is required')
    expect(updateProfile).not.toHaveBeenCalled()

    // Pick a Rajasthan city and submit: only the changed pair is sent.
    await user.click(await combobox('City'))
    await user.type(await combobox('City'), 'jaipur')
    const jaipurRow = (await screen.findAllByRole('option')).find((el) =>
      (el.textContent ?? '').startsWith('Jaipur'),
    )
    expect(jaipurRow).toBeDefined()
    await user.click(jaipurRow!)

    await user.click(screen.getByRole('button', { name: 'Update Profile' }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith({
      state: 'Rajasthan',
      city: 'Jaipur',
    })
  }, 15_000)

  it('auto-selects the state when a city is chosen before any state', async () => {
    getProfile.mockResolvedValue({
      ...PROFILE,
      address: {
        addressLine1: '10 Lake View',
        addressLine2: '',
        city: '',
        state: '',
        pincode: '380001',
      },
    })
    const user = userEvent.setup()
    renderPage()

    expect(await combobox('State')).toHaveValue('')

    await user.click(await combobox('City'))
    await user.type(await combobox('City'), 'ahmedabad')
    // The flat (no-state) list also contains "Jodhpur (Ahmedabad)".
    const ahmedabadRow = (await screen.findAllByRole('option')).find((el) =>
      (el.textContent ?? '').startsWith('Ahmedabad'),
    )
    expect(ahmedabadRow).toBeDefined()
    await user.click(ahmedabadRow!)

    expect(await combobox('State')).toHaveValue('Gujarat')
    expect(await combobox('City')).toHaveValue('Ahmedabad')

    await user.click(screen.getByRole('button', { name: 'Update Profile' }))

    await waitFor(() => expect(updateProfile).toHaveBeenCalledTimes(1))
    expect(updateProfile).toHaveBeenCalledWith({
      state: 'Gujarat',
      city: 'Ahmedabad',
    })
  }, 15_000)
})
