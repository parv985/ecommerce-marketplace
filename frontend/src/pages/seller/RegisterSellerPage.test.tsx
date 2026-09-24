import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

/*
 * Seller registration funnel (/seller/register): the address block now
 * renders shared State/City comboboxes with State BEFORE City, and the
 * submitted payload must carry the picked canonical pair.
 */

const registerMock = vi.hoisted(() => vi.fn())
const toastSuccess = vi.hoisted(() => vi.fn())
const toastError = vi.hoisted(() => vi.fn())

vi.mock('@/services/seller.service', () => ({
  sellerService: { register: (data: unknown) => registerMock(data) },
}))

vi.mock('react-hot-toast', () => {
  const toast = Object.assign(vi.fn(), {
    success: toastSuccess,
    error: toastError,
  })
  return { toast, default: toast }
})

import { RegisterSellerPage } from './RegisterSellerPage'

const fill = async (
  user: ReturnType<typeof userEvent.setup>,
  name: string,
  value: string,
) => {
  // The shared `Input` renders its label without htmlFor, so labels are
  // decorative — queries go through the RHF `name` attribute instead.
  const input = document.querySelector(
    `input[name="${name}"]`,
  ) as HTMLInputElement
  expect(input).not.toBeNull()
  await user.type(input, value)
}

const fillForm = async (user: ReturnType<typeof userEvent.setup>) => {
  const fields: Array<[string, string]> = [
    ['name', 'Test Seller'],
    ['email', 'seller.location@example.com'],
    ['password', 'Password123!'],
    ['businessName', 'Location Traders'],
    ['gstin', '27AAPFU0939F1ZV'],
    ['pan', 'AAPFU0939F'],
    ['bankAccountHolderName', 'Test Seller'],
    ['bankAccountNumber', '123456789012'],
    ['ifscCode', 'HDFC0001234'],
    ['addressLine1', '10 Lake View'],
    ['pincode', '411001'],
  ]
  for (const [name, value] of fields) {
    await fill(user, name, value)
  }
}

const renderPage = () =>
  render(
    <MemoryRouter>
      <RegisterSellerPage />
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RegisterSellerPage State/City fields', () => {
  it('renders State before City as searchable comboboxes', () => {
    renderPage()

    const state = screen.getByRole('combobox', { name: 'State' })
    const city = screen.getByRole('combobox', { name: 'City' })
    expect(state).toBeInTheDocument()
    expect(city).toBeInTheDocument()

    // State precedes City in the address block.
    expect(
      state.compareDocumentPosition(city) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('submits the selected canonical pair in the registration payload', async () => {
    registerMock.mockResolvedValue(null)
    const user = userEvent.setup()
    renderPage()
    await fillForm(user)

    // State first…
    await user.click(screen.getByRole('combobox', { name: 'State' }))
    await user.type(screen.getByRole('combobox', { name: 'State' }), 'guj')
    await user.click(await screen.findByRole('option', { name: 'Gujarat' }))

    // …then a city limited to Gujarat.
    await user.click(screen.getByRole('combobox', { name: 'City' }))
    await user.type(screen.getByRole('combobox', { name: 'City' }), 'ahmedabad')
    // The dataset also contains "Jodhpur (Ahmedabad)" — match exactly.
    const ahmedabadRow = screen
      .getAllByRole('option')
      .find((el) => (el.textContent ?? '').startsWith('Ahmedabad'))
    expect(ahmedabadRow).toBeDefined()
    await user.click(ahmedabadRow!)

    await user.click(
      screen.getByRole('button', { name: /Submit Registration/ }),
    )

    await waitFor(() => expect(registerMock).toHaveBeenCalledTimes(1))
    const payload = registerMock.mock.calls[0][0] as Record<string, string>
    expect(payload.state).toBe('Gujarat')
    expect(payload.city).toBe('Ahmedabad')
    expect(payload.pincode).toBe('411001')
    expect(payload.addressLine1).toBe('10 Lake View')
    expect(toastSuccess).toHaveBeenCalled()
  }, 15_000)

  it('blocks submission until a city is chosen for the state', async () => {
    const user = userEvent.setup()
    renderPage()
    await fillForm(user)

    await user.click(screen.getByRole('combobox', { name: 'State' }))
    await user.type(screen.getByRole('combobox', { name: 'State' }), 'goa')
    await user.click(await screen.findByRole('option', { name: 'Goa' }))

    await user.click(
      screen.getByRole('button', { name: /Submit Registration/ }),
    )

    expect(await screen.findByText('City is required')).toBeInTheDocument()
    expect(registerMock).not.toHaveBeenCalled()
  })
})
