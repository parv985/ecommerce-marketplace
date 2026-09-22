import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

/*
 * Seller two-factor login on the page the app routes /login to.
 *
 * Guards two things at once:
 *  1. the verification-code input is controlled from its first render -
 *     React used to reuse the login form's DOM node for it and logged
 *     "A component is changing an uncontrolled input to be controlled";
 *  2. the 2FA step posts { loginToken, code } to /auth/2fa/verify and
 *     completes the session on success.
 */

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/services/auth.service', () => ({
  authApi: {
    login: vi.fn(),
    verify2FA: vi.fn(),
    register: vi.fn(),
    registerSeller: vi.fn(),
    getMe: vi.fn(),
  },
}))

import AuthPage from './AuthPage'
import { authApi } from '@/services/auth.service'

const mockLogin = authApi.login as unknown as ReturnType<
  typeof vi.fn
>
const mockVerify = authApi.verify2FA as unknown as ReturnType<
  typeof vi.fn
>
const mockGetMe = authApi.getMe as unknown as ReturnType<
  typeof vi.fn
>

const seller = {
  id: 'u1',
  name: 'Two FA Seller',
  email: 'seller@test.com',
  role: 'SELLER' as const,
}

const renderPage = (initialEntries?: any) =>
  render(
    <MemoryRouter initialEntries={initialEntries}>
      <AuthPage />
    </MemoryRouter>
  )

const submitCredentials = async () => {
  fireEvent.change(
    screen.getByPlaceholderText('you@example.com'),
    { target: { value: 'seller@test.com' } }
  )
  fireEvent.change(
    screen.getByPlaceholderText('••••••••'),
    { target: { value: 'Password123!' } }
  )
  fireEvent.click(
    screen.getByRole('button', { name: /sign in/i })
  )

  await screen.findByText('Two-Factor Verification')
}

const codeInput = () =>
  screen.getByPlaceholderText(
    '123456 or ABCD-EFGH-IJKL-NPQR'
  )

describe('AuthPage two-factor step', () => {
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    sessionStorage.clear()
    mockNavigate.mockReset()
    mockLogin.mockReset()
    mockVerify.mockReset()
    mockGetMe.mockReset()
    mockGetMe.mockResolvedValue(seller)
    consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {})
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it('renders the verification code input as controlled from the first render', async () => {
    mockLogin.mockResolvedValue({
      data: {
        twoFactorRequired: true,
        loginToken: 'login-token',
      },
    })

    renderPage()
    await submitCredentials()

    expect(codeInput()).toHaveValue('')

    fireEvent.change(codeInput(), {
      target: { value: '123456' },
    })

    expect(codeInput()).toHaveValue('123456')

    const warnings = consoleError.mock.calls
      .flat()
      .map((arg: unknown) => String(arg))
      .join(' ')

    expect(warnings).not.toContain(
      'changing an uncontrolled input to be controlled'
    )
  })

  it('completes the two-step login with a valid code and redirects seller to dashboard', async () => {
    mockLogin.mockResolvedValue({
      data: {
        twoFactorRequired: true,
        loginToken: 'login-token',
      },
    })
    mockVerify.mockResolvedValue({
      data: {
        accessToken: 'access-token',
        user: seller,
      },
    })

    renderPage()
    await submitCredentials()

    fireEvent.change(codeInput(), {
      target: { value: '123456' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /verify/i })
    )

    await waitFor(() =>
      expect(mockVerify).toHaveBeenCalledWith(
        'login-token',
        '123456'
      )
    )

    await waitFor(() =>
      expect(
        sessionStorage.getItem('user')
      ).toContain('seller@test.com')
    )

    expect(mockNavigate).toHaveBeenCalledWith('/seller/dashboard', { replace: true })
  })

  it('redirects approved seller to /seller/dashboard even when previous location was /seller/pending', async () => {
    mockLogin.mockResolvedValue({
      data: {
        twoFactorRequired: true,
        loginToken: 'login-token',
      },
    })
    mockVerify.mockResolvedValue({
      data: {
        accessToken: 'access-token',
        user: seller,
      },
    })

    renderPage([{ pathname: '/login', state: { from: { pathname: '/seller/pending' } } }])
    await submitCredentials()

    fireEvent.change(codeInput(), {
      target: { value: '123456' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: /verify/i })
    )

    await waitFor(() =>
      expect(mockVerify).toHaveBeenCalledWith(
        'login-token',
        '123456'
      )
    )

    expect(mockNavigate).toHaveBeenCalledWith('/seller/dashboard', { replace: true })
  })
})
