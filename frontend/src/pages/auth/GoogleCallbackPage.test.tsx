import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import {
  MemoryRouter,
  Route,
  Routes,
} from 'react-router-dom'

import GoogleCallbackPage from './GoogleCallbackPage'
import { useAuthStore } from '@/stores/authStore'
import {
  getAccessToken,
  setAccessToken,
} from '@/services/api'
import { authApi } from '@/services/auth.service'

/*
 * Frontend half of the Google OAuth handshake.
 *
 * The backend callback redirects the browser to
 * /auth/google/callback?access_token=… — if that route did not exist the
 * SPA fell through to its catch-all "404 Page not found", which is exactly
 * the screen users saw after picking a Google account. These tests cover
 * the route existing and turning the token into a real session.
 */

vi.mock('@/services/auth.service', () => ({
  authApi: { getMe: vi.fn() },
}))

const getMe = authApi.getMe as unknown as ReturnType<
  typeof vi.fn
>

const buyer = {
  id: 'u1',
  name: 'Google Buyer',
  email: 'google.buyer@gmail.com',
  role: 'BUYER' as const,
}

const renderCallback = (url: string) =>
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route
          path="/auth/google/callback"
          element={<GoogleCallbackPage />}
        />
        <Route path="/login" element={<div>login page</div>} />
        <Route path="/" element={<div>home page</div>} />
        <Route
          path="/wishlist"
          element={<div>wishlist page</div>}
        />
        <Route
          path="/seller/dashboard"
          element={<div>seller dashboard</div>}
        />
        <Route
          path="/admin/dashboard"
          element={<div>admin dashboard</div>}
        />
      </Routes>
    </MemoryRouter>,
  )

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  // The axios layer also keeps the token in a module variable.
  setAccessToken(null)
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    accountInactive: false,
  })
  getMe.mockResolvedValue(buyer)
})

describe('GoogleCallbackPage', () => {
  it('stores the session and routes a buyer home', async () => {
    renderCallback(
      '/auth/google/callback?access_token=token-123',
    )

    expect(
      await screen.findByText('home page'),
    ).toBeInTheDocument()

    expect(getMe).toHaveBeenCalled()
    expect(getAccessToken()).toBe('token-123')

    const state = useAuthStore.getState()
    expect(state.isAuthenticated).toBe(true)
    expect(state.user?.email).toBe(buyer.email)
  })

  it('returns the user to the page they came from', async () => {
    renderCallback(
      '/auth/google/callback?access_token=token-123&to=%2Fwishlist',
    )

    expect(
      await screen.findByText('wishlist page'),
    ).toBeInTheDocument()
  })

  it('routes a seller to the seller dashboard', async () => {
    getMe.mockResolvedValue({ ...buyer, role: 'SELLER' })

    renderCallback(
      '/auth/google/callback?access_token=token-123',
    )

    expect(
      await screen.findByText('seller dashboard'),
    ).toBeInTheDocument()
  })

  it('routes an admin to the admin dashboard', async () => {
    getMe.mockResolvedValue({ ...buyer, role: 'SUPER_ADMIN' })

    renderCallback(
      '/auth/google/callback?access_token=token-123',
    )

    expect(
      await screen.findByText('admin dashboard'),
    ).toBeInTheDocument()
  })

  it('shows the backend error and goes back to login', async () => {
    renderCallback(
      '/auth/google/callback?error=INVALID_AUTH_CODE&message=Failed+to+exchange+authorization+code',
    )

    expect(
      await screen.findByText('login page', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(getMe).not.toHaveBeenCalled()
    expect(getAccessToken()).toBeNull()
  })

  it('goes back to login when no token was handed over', async () => {
    renderCallback('/auth/google/callback')

    expect(
      await screen.findByText('login page', {}, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(getAccessToken()).toBeNull()
  })

  it('clears the token and goes back to login when the profile call fails', async () => {
    getMe.mockRejectedValue(new Error('401'))

    renderCallback(
      '/auth/google/callback?access_token=token-123',
    )

    expect(
      await screen.findByText('login page', {}, { timeout: 4000 }),
    ).toBeInTheDocument()

    await waitFor(() => expect(getAccessToken()).toBeNull())
    expect(useAuthStore.getState().isAuthenticated).toBe(false)
  })
})

describe('App routing', () => {
  it('serves /auth/google/callback instead of the 404 page', async () => {
    /*
     * App renders its own BrowserRouter, so the URL is set on jsdom
     * instead of wrapping it in a MemoryRouter.
     */
    window.history.pushState(
      {},
      '',
      '/auth/google/callback?access_token=token-123',
    )

    const App = (await import('@/App')).default

    render(<App />)

    /*
     * Regression: before the route existed, this URL rendered the
     * catch-all "404 / Page not found" screen from App.tsx.
     */
    expect(
      await screen.findByText(
        /Finishing your NexCart sign-in/,
      ),
    ).toBeInTheDocument()

    expect(
      screen.queryByText('Page not found'),
    ).not.toBeInTheDocument()
  })
})
