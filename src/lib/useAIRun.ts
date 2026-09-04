// src/lib/useAIRun.ts
// Hook obsługujący pojedyncze wywołanie AI: identyfikator żądania, postęp z main process,
// licznik czasu i anulowanie.
//
// Postęp działa tylko w Electronie (kanał IPC 'ai:progress'). W trybie dev (przeglądarka)
// zostaje sam licznik czasu — wystarcza, bo dev służy do testów, nie do długich analiz.

import { useState, useRef, useCallback, useEffect } from 'react'
import type { AIProgress } from './types'
import { newAIRequestId, cancelAIRequest, subscribeAIProgress } from './api'

export interface AIRunState {
  running: boolean
  progress: AIProgress | null
  elapsedMs: number
  canCancel: boolean
}

export function useAIRun() {
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState<AIProgress | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const requestIdRef = useRef<string | null>(null)

  // Licznik czasu — jedyne źródło informacji o postępie w trybie dev
  useEffect(() => {
    if (!running) return
    const startedAt = Date.now()
    setElapsedMs(0)
    const timer = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000)
    return () => clearInterval(timer)
  }, [running])

  // Postęp z main process — filtrowany po requestId, bo kanał jest wspólny
  useEffect(() => {
    return subscribeAIProgress(p => {
      if (!requestIdRef.current || p.requestId !== requestIdRef.current) return
      setProgress(p)
    })
  }, [])

  const run = useCallback(async <T,>(fn: (requestId: string) => Promise<T>): Promise<T> => {
    const requestId = newAIRequestId()
    requestIdRef.current = requestId
    setRunning(true)
    setProgress(null)
    try {
      return await fn(requestId)
    } finally {
      requestIdRef.current = null
      setRunning(false)
      setProgress(null)
    }
  }, [])

  const cancel = useCallback(() => {
    const id = requestIdRef.current
    if (id) void cancelAIRequest(id)
  }, [])

  return { running, progress, elapsedMs, run, cancel }
}
