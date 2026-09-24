import { useState, useRef, useCallback } from 'react'
import { toast } from 'react-hot-toast'

declare global {
  interface Window {
    Razorpay: any
  }
}

interface RazorpayOptions {
  key: string
  amount: number
  currency: string
  name: string
  description: string
  order_id: string
  handler: (response: any) => void
  prefill?: {
    name?: string
    email?: string
    contact?: string
  }
  theme?: {
    color?: string
  }
  modal?: {
    ondismiss?: () => void
  }
}

interface UseRazorpayReturn {
  openRazorpay: (options: RazorpayOptions) => Promise<void>
  isLoading: boolean
  loadRazorpayScript: () => Promise<void>
}

export function useRazorpay(): UseRazorpayReturn {
  const [isLoading, setIsLoading] = useState(false)
  const razorpayOptionsRef = useRef<RazorpayOptions | null>(null)
  const scriptLoadedRef = useRef(false)

  const loadRazorpayScript = useCallback((): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (window.Razorpay) {
        scriptLoadedRef.current = true
        resolve()
        return
      }

      if (document.getElementById('razorpay-script')) {
        // Script tag exists, wait for it to load
        const checkLoaded = setInterval(() => {
          if (window.Razorpay) {
            clearInterval(checkLoaded)
            scriptLoadedRef.current = true
            resolve()
          }
        }, 100)
        return
      }

      const script = document.createElement('script')
      script.id = 'razorpay-script'
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => {
        scriptLoadedRef.current = true
        resolve()
      }
      script.onerror = () => {
        toast.error('Failed to load Razorpay checkout. Please try again.')
        reject(new Error('Failed to load Razorpay script'))
      }
      document.body.appendChild(script)
    })
  }, [])

  const openRazorpay = useCallback(async (options: RazorpayOptions) => {
    if (!window.Razorpay) {
      await loadRazorpayScript()
    }

    if (!window.Razorpay) {
      toast.error('Razorpay failed to load')
      return
    }

    setIsLoading(true)
    razorpayOptionsRef.current = options

    try {
      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', (response: any) => {
        toast.error(response.error?.description || 'Payment failed')
        setIsLoading(false)
      })
      rzp.open()
    } catch (e: any) {
      console.error('Error opening Razorpay checkout:', e)
      toast.error('Failed to open Razorpay checkout')
      setIsLoading(false)
    }
  }, [loadRazorpayScript])

  return { openRazorpay, isLoading, loadRazorpayScript }
}