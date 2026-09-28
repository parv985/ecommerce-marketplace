import { useState, useRef, useEffect, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Sparkles,
  X,
  Send,
  Loader2,
  Package,
  RotateCcw,
  LogIn,
  ExternalLink,
  ChevronDown,
  ShoppingBag,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { aiService } from '@/services/ai.service'
import type { AIChatMessage, AIChatResult, Product, AIChatOrderSummary } from '@/types/api'
import { extractErrorMessage } from '@/services/api'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/utils'

interface ExtendedChatMessage extends AIChatMessage {
  id: string
  timestamp: Date
  products?: Product[]
  orders?: AIChatOrderSummary[]
  isError?: boolean
}

const STARTER_PROMPTS = [
  'I need a laptop for programming under ₹60,000',
  'Where is my order?',
  'What is the return policy?',
  'Can I cancel my order?',
  'Show me running shoes under ₹3,000',
]

export function NexCartAIChat() {
  const [isOpen, setIsOpen] = useState(false)
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [messages, setMessages] = useState<ExtendedChatMessage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()
  const isBuyer = isAuthenticated && user?.role === 'BUYER'

  // Scroll to bottom whenever messages update or panel opens
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, isOpen, isLoading])

  // Focus input when opened
  useEffect(() => {
    if (isOpen && isBuyer) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen, isBuyer])

  // Initialize welcome message once
  useEffect(() => {
    if (messages.length === 0) {
      const greeting = user?.name ? `Hi ${user.name.split(' ')[0]}!` : 'Hello!'
      setMessages([
        {
          id: 'welcome-1',
          role: 'assistant',
          content: `${greeting} I'm your **NexCart AI Assistant**. You can ask me to find products matching your budget & specs, check your order status, learn about shipping & returns, or ask product details!`,
          timestamp: new Date(),
        },
      ])
    }
  }, [user?.name, messages.length])

  const handleSend = async (messageToSend?: string) => {
    const text = (messageToSend || input).trim()
    if (!text || isLoading) return

    if (!isBuyer) return

    const userMsgId = `user-${Date.now()}`
    const newMessages: ExtendedChatMessage[] = [
      ...messages,
      {
        id: userMsgId,
        role: 'user',
        content: text,
        timestamp: new Date(),
      },
    ]

    setMessages(newMessages)
    setInput('')
    setIsLoading(true)

    // Prepare history payload for API (last 6 turns, user & assistant text)
    const historyPayload: AIChatMessage[] = newMessages
      .filter((m) => !m.isError && m.id !== 'welcome-1')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      const response: AIChatResult = await aiService.chat(text, historyPayload)

      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: response.message,
          products: response.products,
          orders: response.orders,
          timestamp: new Date(),
        },
      ])
    } catch (error) {
      const errText = extractErrorMessage(error)
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          role: 'assistant',
          content: `Sorry, I encountered an issue: ${errText}. Please try again.`,
          isError: true,
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault()
    handleSend()
  }

  const handleResetChat = () => {
    const greeting = user?.name ? `Hi ${user.name.split(' ')[0]}!` : 'Hello!'
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        role: 'assistant',
        content: `${greeting} Conversation reset. How can I help you today with NexCart shopping, orders, or policies?`,
        timestamp: new Date(),
      },
    ])
  }

  return (
    <>
      {/* Floating Trigger Button */}
      <button
        type="button"
        id="nexcart-ai-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-label="Open NexCart AI Assistant"
        className={cn(
          'fixed bottom-6 right-6 z-40 flex items-center gap-2 px-4 py-3 rounded-full font-semibold shadow-xl transition-all duration-300 group',
          isOpen
            ? 'bg-neutral-900 text-white scale-95 ring-2 ring-neutral-700'
            : 'bg-gradient-to-r from-amber-600 via-orange-500 to-amber-700 text-white hover:shadow-2xl hover:scale-105 active:scale-95'
        )}
      >
        <Sparkles size={18} className="animate-pulse" />
        <span className="text-sm tracking-wide">NexCart AI</span>
        {isOpen ? (
          <ChevronDown size={16} className="text-neutral-400 group-hover:text-white transition-colors" />
        ) : (
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-200 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
          </span>
        )}
      </button>

      {/* Floating Chat Panel */}
      {isOpen && (
        <div
          id="nexcart-ai-panel"
          className="fixed bottom-20 right-4 sm:right-6 z-50 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[580px] max-h-[calc(100vh-6.5rem)] bg-white rounded-2xl shadow-2xl border border-[var(--border)] flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-5 duration-200"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 text-white px-4 py-3 flex items-center justify-between border-b border-neutral-700 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-amber-500 to-orange-400 flex items-center justify-center text-white shadow-sm">
                <Sparkles size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-sm leading-none">NexCart AI</h3>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/30">
                    Assistant
                  </span>
                </div>
                <p className="text-[11px] text-neutral-400 flex items-center gap-1.5 mt-0.5">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                  Grounded with Catalog & Orders
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {isBuyer && messages.length > 1 && (
                <button
                  type="button"
                  onClick={handleResetChat}
                  title="Reset conversation"
                  aria-label="Reset conversation"
                  className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
                >
                  <RotateCcw size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title="Close chat"
                aria-label="Close chat"
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Chat Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-neutral-50/70">
            {!isBuyer ? (
              /* Unauthenticated / Unauthorized Prompt Card */
              <div className="my-auto py-8 px-4 flex flex-col items-center text-center">
                <div className="h-16 w-16 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-600 mb-4 shadow-sm">
                  <LogIn size={30} />
                </div>
                <h4 className="text-base font-bold text-neutral-900 mb-1.5">
                  Please log in to use NexCart AI Assistant.
                </h4>
                <p className="text-xs text-neutral-600 max-w-xs mb-5 leading-relaxed">
                  Sign in with your buyer account to search products with natural language, track your orders in real-time, and get instant customer support.
                </p>
                <Button
                  onClick={() => {
                    setIsOpen(false)
                    navigate('/login')
                  }}
                  className="bg-amber-600 hover:bg-amber-700 text-white font-medium px-6 py-2 shadow-md w-full max-w-xs flex items-center justify-center gap-2"
                >
                  <LogIn size={16} />
                  Sign In to Continue
                </Button>
                <p className="text-[11px] text-neutral-400 mt-4">
                  New to NexCart?{' '}
                  <Link
                    to="/login"
                    onClick={() => setIsOpen(false)}
                    className="text-amber-700 underline font-medium hover:text-amber-800"
                  >
                    Create an account
                  </Link>
                </p>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col',
                      msg.role === 'user' ? 'items-end' : 'items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs sm:text-sm shadow-sm leading-relaxed whitespace-pre-wrap',
                        msg.role === 'user'
                          ? 'bg-amber-600 text-white rounded-br-xs'
                          : msg.isError
                          ? 'bg-rose-50 text-rose-800 border border-rose-200 rounded-bl-xs'
                          : 'bg-white text-neutral-800 border border-[var(--border)] rounded-bl-xs'
                      )}
                    >
                      {msg.content}
                    </div>

                    {/* Grounded Product Cards Carousel / Grid */}
                    {msg.products && msg.products.length > 0 && (
                      <div className="w-full mt-2.5 space-y-2">
                        <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                          <ShoppingBag size={12} className="text-amber-600" />
                          Recommended Products ({msg.products.length})
                        </p>
                        <div className="grid grid-cols-1 gap-2">
                          {msg.products.map((p) => {
                            const mainImg = p.images?.[0]?.url || ''
                            return (
                              <Link
                                key={p.id}
                                to={`/products/${p.id}`}
                                onClick={() => setIsOpen(false)}
                                className="flex items-center gap-3 p-2 bg-white rounded-xl border border-neutral-200 hover:border-amber-400 hover:shadow-md transition-all group"
                              >
                                {mainImg ? (
                                  <img
                                    src={mainImg}
                                    alt={p.name}
                                    className="h-12 w-12 rounded-lg object-cover bg-neutral-100 shrink-0"
                                  />
                                ) : (
                                  <div className="h-12 w-12 rounded-lg bg-neutral-100 flex items-center justify-center text-neutral-400 shrink-0">
                                    <ShoppingBag size={18} />
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <h5 className="text-xs font-semibold text-neutral-900 truncate group-hover:text-amber-700">
                                    {p.name}
                                  </h5>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-xs font-bold text-neutral-900">
                                      ₹{p.price.toLocaleString('en-IN')}
                                    </span>
                                    {p.category?.name && (
                                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-neutral-100 text-neutral-600 truncate max-w-[100px]">
                                        {p.category.name}
                                      </span>
                                    )}
                                    {p.stock > 0 ? (
                                      <span className="text-[10px] text-emerald-600 font-medium">In stock</span>
                                    ) : (
                                      <span className="text-[10px] text-rose-500 font-medium">Out of stock</span>
                                    )}
                                  </div>
                                </div>
                                <ExternalLink size={14} className="text-neutral-400 group-hover:text-amber-600 mr-1 shrink-0" />
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* Grounded Orders List */}
                    {msg.orders && msg.orders.length > 0 && (
                      <div className="w-full mt-2.5 space-y-2">
                        <p className="text-[11px] font-semibold text-neutral-500 uppercase tracking-wider flex items-center gap-1">
                          <Package size={12} className="text-amber-600" />
                          Your Recent Orders ({msg.orders.length})
                        </p>
                        <div className="space-y-1.5">
                          {msg.orders.map((ord) => (
                            <Link
                              key={ord.orderNumber}
                              to={`/orders/${ord.orderNumber}`}
                              onClick={() => setIsOpen(false)}
                              className="block p-2.5 bg-white rounded-xl border border-neutral-200 hover:border-amber-400 hover:shadow-sm transition-all"
                            >
                              <div className="flex items-center justify-between text-xs mb-1">
                                <span className="font-bold text-neutral-900">
                                  {ord.orderNumber}
                                </span>
                                <Badge
                                  variant="secondary"
                                  className={cn(
                                    'text-[10px] font-semibold uppercase',
                                    ord.status === 'DELIVERED' && 'bg-emerald-100 text-emerald-800',
                                    ['PENDING', 'CONFIRMED'].includes(ord.status) && 'bg-amber-100 text-amber-800',
                                    ord.status === 'SHIPPED' && 'bg-blue-100 text-blue-800',
                                    ord.status === 'CANCELLED' && 'bg-rose-100 text-rose-800'
                                  )}
                                >
                                  {ord.status}
                                </Badge>
                              </div>
                              <div className="flex items-center justify-between text-[11px] text-neutral-500">
                                <span>{ord.itemCount} item(s)</span>
                                <span className="font-semibold text-neutral-900">
                                  ₹{ord.total.toLocaleString('en-IN')}
                                </span>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}

                    <span className="text-[10px] text-neutral-400 mt-1 px-1">
                      {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}

                {/* Loading / Typing State */}
                {isLoading && (
                  <div className="flex items-center gap-2 text-neutral-500 text-xs bg-white px-3 py-2 rounded-2xl border border-[var(--border)] w-fit shadow-xs">
                    <Loader2 size={14} className="animate-spin text-amber-600" />
                    <span>NexCart AI is finding the best answer…</span>
                  </div>
                )}

                {/* Starter Prompts when conversation is fresh */}
                {messages.length <= 2 && !isLoading && (
                  <div className="pt-2">
                    <p className="text-[11px] font-semibold text-neutral-400 mb-2 uppercase tracking-wider">
                      Suggested questions:
                    </p>
                    <div className="flex flex-col gap-1.5">
                      {STARTER_PROMPTS.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => handleSend(prompt)}
                          className="text-left text-xs px-3 py-2 rounded-lg bg-white border border-neutral-200 text-neutral-700 hover:border-amber-400 hover:bg-amber-50/50 hover:text-amber-900 transition-all shadow-2xs"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input Footer */}
          <div className="p-3 bg-white border-t border-[var(--border)] shrink-0">
            <form onSubmit={handleFormSubmit} className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                disabled={!isBuyer || isLoading}
                placeholder={
                  !isBuyer
                    ? 'Please log in to use NexCart AI Assistant'
                    : 'Ask about products, orders, returns…'
                }
                className="flex-1 text-xs sm:text-sm px-3.5 py-2.5 bg-neutral-100/80 rounded-xl border border-neutral-200 focus:outline-none focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20 disabled:bg-neutral-100 disabled:cursor-not-allowed transition-all"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!isBuyer || !input.trim() || isLoading}
                className="bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-10 px-3 shrink-0 disabled:opacity-50"
              >
                {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </Button>
            </form>
            <p className="text-[10px] text-neutral-400 text-center mt-2">
              NexCart AI provides answers grounded in our MongoDB catalog & policies.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
