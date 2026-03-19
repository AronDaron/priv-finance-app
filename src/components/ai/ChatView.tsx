import { useState, useRef, useEffect, useCallback } from 'react'
import { MarkdownRenderer } from './MarkdownRenderer'
import { chatPortfolio, type ChatMessage } from '../../lib/api'

const GREETING = 'Witaj! Mam wgląd w Twój portfel, historię transakcji, aktualne dane rynkowe i wyniki makroekonomiczne. O co chcesz zapytać?'

const SUGGESTIONS = [
  'Dlaczego mój portfel dzisiaj spada?',
  'Które spółki mają najgorsze momentum w ostatnim miesiącu?',
  'Oceń dywersyfikację mojego portfela',
  'Jaką ekspozycję walutową mam w portfelu?',
]

export default function ChatView() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const newMessages: ChatMessage[] = [...messages, { role: 'user', content: trimmed }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)

    try {
      const response = await chatPortfolio(newMessages)
      setMessages(prev => [...prev, { role: 'assistant', content: response }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Błąd podczas komunikacji z AI.')
    } finally {
      setLoading(false)
    }
  }, [messages, loading])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  const handleNewSession = () => {
    setMessages([])
    setError(null)
    setInput('')
    textareaRef.current?.focus()
  }

  const isEmpty = messages.length === 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="glass-card mx-4 mt-4 mb-3 rounded-xl overflow-hidden">
        <div style={{ height: 3, background: 'linear-gradient(90deg, #6366f1, #818cf8)', boxShadow: '0 0 8px rgba(99,102,241,0.4)' }} />
        <div className="px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-white font-semibold text-sm">AI Agent</h2>
              <p className="text-gray-500 text-xs">Konwersacyjny asystent portfela • pełny kontekst danych</p>
            </div>
          </div>
          {!isEmpty && (
            <button
              onClick={handleNewSession}
              className="text-xs text-gray-400 hover:text-white hover:bg-white/10 px-3 py-1.5 rounded-lg transition-all"
            >
              Nowa sesja
            </button>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-4">
        {/* Greeting */}
        <div className="flex gap-3">
          <div className="w-7 h-7 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
            <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <div className="glass-card rounded-xl rounded-tl-sm px-4 py-3 max-w-[80%]">
            <p className="text-gray-300 text-sm">{GREETING}</p>
            {isEmpty && (
              <div className="mt-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(s)}
                    className="text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 border border-gray-700/50 hover:border-gray-600 px-3 py-1.5 rounded-full transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Conversation */}
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
              msg.role === 'user' ? 'bg-finance-green/20' : 'bg-indigo-500/30'
            }`}>
              {msg.role === 'user' ? (
                <svg className="w-3.5 h-3.5 text-finance-green" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              )}
            </div>
            <div className={`rounded-xl px-4 py-3 max-w-[80%] ${
              msg.role === 'user'
                ? 'bg-finance-green/15 border border-finance-green/20 rounded-tr-sm'
                : 'glass-card rounded-tl-sm'
            }`}>
              {msg.role === 'user' ? (
                <p className="text-gray-200 text-sm whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <MarkdownRenderer content={msg.content} />
              )}
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className="flex gap-3">
            <div className="w-7 h-7 rounded-full bg-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-indigo-400 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <div className="glass-card rounded-xl rounded-tl-sm px-4 py-3">
              <div className="flex gap-1.5 items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="text-xs text-gray-500 ml-1">Analizuję dane portfela...</span>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass-card border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="px-4 pb-4 pt-2">
        <div className="glass-card rounded-xl border border-gray-700/50 focus-within:border-indigo-500/40 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Zadaj pytanie o swój portfel... (Enter aby wysłać, Shift+Enter nowa linia)"
            rows={2}
            disabled={loading}
            className="w-full bg-transparent text-gray-200 text-sm placeholder-gray-600 px-4 pt-3 pb-1 resize-none outline-none disabled:opacity-50"
          />
          <div className="flex items-center justify-between px-4 pb-3 pt-1">
            <span className="text-xs text-gray-600">
              {messages.length > 0 ? `${Math.ceil(messages.length / 2)} tur konwersacji` : 'Kontekst: portfel + transakcje + ceny 2y + makro'}
            </span>
            <button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 hover:text-indigo-200 text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Wyślij
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-700 text-center mt-2">
          Archiwum newsów buduje się automatycznie gdy przeglądasz zakładkę Wiadomości
        </p>
      </div>
    </div>
  )
}
