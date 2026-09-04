// electron/main/aiProvider.ts
// Warstwa dostępu do modeli LLM: OpenRouter (chmura) albo serwer lokalny (OpenAI-compatible:
// Unsloth Studio, Ollama, LM Studio, llama.cpp, vLLM).
//
// WAŻNE: Ten plik NIE może importować modułów Node.js/Electron (app, database, fs…),
// ponieważ jest ładowany dynamicznie także przez dev-api-plugin.ts (Vite) — tak samo jak bonds.ts.

export type AIProvider = 'openrouter' | 'local'
export type AIRole = 'worker' | 'manager' | 'world' | 'chat' | 'advisor'

export const AI_ROLES: AIRole[] = ['worker', 'manager', 'world', 'chat', 'advisor']

export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1'
const APP_REFERER = 'https://finance-portfolio-tracker'

/** Domyślne modele OpenRoutera — zachowanie sprzed wprowadzenia providerów. */
export const DEFAULT_OPENROUTER_MODELS: Record<AIRole, string> = {
  worker:  'google/gemini-3-flash-preview',
  manager: 'google/gemini-3.1-pro-preview',
  world:   'google/gemini-3-flash-preview',
  chat:    'google/gemini-3-flash-preview',
  advisor: 'google/gemini-3.1-pro-preview',
}

/** Limity OpenRoutera — identyczne z wartościami sprzed refaktoru. */
const DEFAULT_OPENROUTER_MAX_TOKENS: Record<AIRole, number> = {
  worker: 15000, manager: 8000, world: 6000, chat: 8000, advisor: 8000,
}

// Modele lokalne generują dodatkowo tokeny rozumowania (reasoning_content), które zużywają
// TEN SAM budżet co właściwa odpowiedź. Zmierzone na serwerze użytkownika: przy limicie 600
// tokenów model wygenerował 535, z czego ~4/5 poszło na rozumowanie. Dlatego limity lokalne
// są WYŻSZE niż dla OpenRoutera — zbyt niski limit kończy się pustą odpowiedzią.
const DEFAULT_LOCAL_MAX_TOKENS: Record<AIRole, number> = {
  worker: 20000, manager: 12000, world: 10000, chat: 12000, advisor: 12000,
}

/** Bezczynność strumienia — czas BEZ ANI JEDNEGO tokenu, nie czas całego żądania. */
export const DEFAULT_IDLE_TIMEOUT_MS = 120_000
/** Bezpiecznik przeciw zawieszeniu procesu. Generowanie na dużym modelu może trwać godzinę. */
const HARD_TIMEOUT_MS = 4 * 60 * 60 * 1000

export interface AIConfig {
  provider: AIProvider
  baseUrl: string
  apiKey: string
  models: Record<AIRole, string>
  maxTokens: Record<AIRole, number>
  idleTimeoutMs: number
  hardTimeoutMs: number
}

export interface StreamProgress {
  contentTokens: number
  reasoningTokens: number
  tokensPerSec: number | null
  elapsedMs: number
  /** 'reasoning' = model myśli (pusty content), 'writing' = leci właściwa odpowiedź */
  phase: 'waiting' | 'reasoning' | 'writing'
}

export interface RemoteModel {
  id: string
  displayName: string
  quant: string | null
  loaded: boolean
  task: string | null
}

export interface ChatRole {
  role: 'system' | 'user' | 'assistant'
  content: string
}

// ─── Konfiguracja z tabeli settings ───────────────────────────────────────────

function normalizeBaseUrl(raw: string): string {
  let url = (raw ?? '').trim().replace(/\/+$/, '')
  if (!url) return ''
  // Użytkownik często wkleja sam host:port (np. http://192.168.30.241:8888)
  if (!/\/v\d+($|\/)/.test(url)) url += '/v1'
  return url
}

function num(value: string | undefined, fallback: number): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

export function buildAIConfig(settings: Record<string, string>): AIConfig {
  const provider: AIProvider = settings.ai_provider === 'local' ? 'local' : 'openrouter'

  if (provider === 'openrouter') {
    return {
      provider,
      baseUrl: OPENROUTER_BASE_URL,
      apiKey: settings.openrouter_api_key ?? '',
      models: { ...DEFAULT_OPENROUTER_MODELS },
      maxTokens: { ...DEFAULT_OPENROUTER_MAX_TOKENS },
      idleTimeoutMs: DEFAULT_IDLE_TIMEOUT_MS,
      hardTimeoutMs: HARD_TIMEOUT_MS,
    }
  }

  const model = (settings.local_ai_model ?? '').trim()
  const managerModel = (settings.local_ai_model_manager ?? '').trim() || model
  const workerTokens = num(settings.local_ai_max_tokens_worker, DEFAULT_LOCAL_MAX_TOKENS.worker)
  const chatTokens = num(settings.local_ai_max_tokens_chat, DEFAULT_LOCAL_MAX_TOKENS.chat)

  return {
    provider,
    baseUrl: normalizeBaseUrl(settings.local_ai_url ?? ''),
    apiKey: settings.local_ai_key ?? '',
    models: {
      worker: model, manager: managerModel, world: model, chat: model, advisor: managerModel,
    },
    maxTokens: {
      worker: workerTokens,
      manager: chatTokens,
      world: chatTokens,
      chat: chatTokens,
      advisor: chatTokens,
    },
    idleTimeoutMs: num(settings.local_ai_idle_timeout_s, DEFAULT_IDLE_TIMEOUT_MS / 1000) * 1000,
    hardTimeoutMs: HARD_TIMEOUT_MS,
  }
}

/** Rzuca czytelnym błędem, gdy konfiguracja jest niekompletna. */
export function assertAIConfig(cfg: AIConfig): void {
  if (cfg.provider === 'openrouter') {
    if (!cfg.apiKey) throw new Error('Brak klucza API OpenRouter. Skonfiguruj go w Ustawieniach.')
    return
  }
  if (!cfg.baseUrl) throw new Error('Brak adresu serwera lokalnego. Ustaw go w Ustawieniach → Silnik AI.')
  if (!cfg.models.worker) throw new Error('Nie wybrano modelu serwera lokalnego. Ustaw go w Ustawieniach → Silnik AI.')
}

// ─── Nota prawna (dopisywana w kodzie, nie promptem) ──────────────────────────

const DISCLAIMER_ANALYSIS =
  '---\n⚠️ *Powyższa analiza została wygenerowana przez model AI i ma charakter wyłącznie informacyjny. ' +
  'Nie stanowi porady inwestycyjnej ani rekomendacji w rozumieniu przepisów prawa. ' +
  'Decyzje inwestycyjne podejmuj na własną odpowiedzialność — w razie wątpliwości skonsultuj się ' +
  'z licencjonowanym doradcą finansowym. Wyniki historyczne nie są gwarancją przyszłych wyników.*'

const DISCLAIMER_CHAT =
  '---\n⚠️ *Informacje generowane przez AI mają charakter wyłącznie informacyjny i nie stanowią porady ' +
  'inwestycyjnej ani rekomendacji w rozumieniu przepisów prawa. Decyzje inwestycyjne podejmuj na własną ' +
  'odpowiedzialność — w razie wątpliwości skonsultuj się z licencjonowanym doradcą finansowym.*'

/**
 * Gwarantuje obecność noty prawnej niezależnie od tego, czy model posłuchał promptu.
 * Modele lokalne pomijają ją znacznie częściej niż komercyjne.
 */
export function ensureDisclaimer(text: string, variant: 'analysis' | 'chat' = 'analysis'): string {
  if (/porady inwestycyjnej|porad[ęy] inwestycyjn/i.test(text)) return text
  return text.trimEnd() + '\n\n' + (variant === 'chat' ? DISCLAIMER_CHAT : DISCLAIMER_ANALYSIS)
}

/**
 * Usuwa bloki rozumowania wypuszczane wewnątrz content (Qwen, gpt-oss).
 * Rozumowanie w osobnym polu reasoning_content jest odrzucane już przy parsowaniu strumienia.
 */
function stripInlineReasoning(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, '')
    .replace(/^[\s\S]*?<\/think>/i, (m) => (/<think>/i.test(m) ? m : ''))
    .trim()
}

// ─── Lista modeli serwera lokalnego ───────────────────────────────────────────

export async function listRemoteModels(
  baseUrl: string,
  apiKey: string
): Promise<{ ok: boolean; models: RemoteModel[]; error?: string }> {
  const url = normalizeBaseUrl(baseUrl)
  if (!url) return { ok: false, models: [], error: 'Podaj adres serwera lokalnego.' }

  try {
    const headers: Record<string, string> = { 'Accept': 'application/json' }
    if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 15_000)
    let res: Response
    try {
      res = await fetch(url + '/models', { headers, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }

    if (res.status === 401 || res.status === 403) {
      return { ok: false, models: [], error: 'Nieprawidłowy klucz API serwera lokalnego.' }
    }
    if (!res.ok) {
      return { ok: false, models: [], error: 'Serwer odpowiedział błędem ' + res.status + ' ' + res.statusText }
    }

    const data = await res.json() as { data?: Array<Record<string, unknown>> }
    const models: RemoteModel[] = (data.data ?? [])
      .filter(m => typeof m.id === 'string')
      .map(m => ({
        id: m.id as string,
        displayName: (m.display_name as string) ?? (m.id as string),
        // Kwantyzacja jest tylko informacją dla użytkownika — nie wchodzi do nazwy modelu
        quant: (m.quant as string) ?? null,
        loaded: m.loaded === true,
        task: (m.task as string) ?? null,
      }))
      // Modele generujące obrazy (np. Z-Image) nie nadają się do analizy finansowej
      .filter(m => m.task !== 'text-to-image' && m.task !== 'text-to-video')
      // Załadowane na górę — wybór niezaładowanego oznacza długie pierwsze zapytanie
      .sort((a, b) => (a.loaded === b.loaded ? a.displayName.localeCompare(b.displayName) : a.loaded ? -1 : 1))

    if (models.length === 0) {
      return { ok: false, models: [], error: 'Serwer nie zwrócił żadnego modelu tekstowego.' }
    }
    return { ok: true, models }
  } catch (err) {
    return { ok: false, models: [], error: describeNetworkError(err, url) }
  }
}

function describeNetworkError(err: unknown, url: string): string {
  const msg = err instanceof Error ? (err.message + ' ' + String((err as { cause?: unknown }).cause ?? '')) : String(err)
  if (/abort/i.test(msg)) return 'Serwer nie odpowiedział w wyznaczonym czasie (' + url + ').'
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT/i.test(msg)) {
    return 'Nie mogę połączyć się z ' + url + '. Sprawdź, czy serwer działa i czy zapora przepuszcza połączenie.'
  }
  return 'Błąd połączenia z ' + url + ': ' + msg
}

// ─── Główne wywołanie modelu ──────────────────────────────────────────────────

export interface CallOptions {
  signal?: AbortSignal
  onProgress?: (p: StreamProgress) => void
}

export async function callChatCompletion(
  messages: ChatRole[],
  role: AIRole,
  cfg: AIConfig,
  opts: CallOptions = {}
): Promise<string> {
  assertAIConfig(cfg)
  return cfg.provider === 'local'
    ? callStreaming(messages, role, cfg, opts)
    : callBlocking(messages, role, cfg, opts)
}

function buildHeaders(cfg: AIConfig): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (cfg.apiKey) headers['Authorization'] = 'Bearer ' + cfg.apiKey
  if (cfg.provider === 'openrouter') headers['HTTP-Referer'] = APP_REFERER
  return headers
}

function throwForStatus(status: number, statusText: string, provider: AIProvider): void {
  const where = provider === 'local' ? 'serwera lokalnego' : 'OpenRouter'
  if (status === 401 || status === 403) throw new Error('Nieprawidłowy klucz API ' + where + '.')
  if (status === 404) throw new Error('Nie znaleziono modelu lub endpointu na ' + where + ' (404).')
  if (status === 429) throw new Error('Przekroczono limit zapytań. Spróbuj za chwilę.')
  if (status >= 500) throw new Error('Błąd serwera (' + where + '): ' + status + '. Spróbuj ponownie.')
  throw new Error('Błąd ' + where + ': ' + status + ' ' + statusText)
}

/** Ścieżka OpenRoutera — zachowanie identyczne jak przed wprowadzeniem providerów. */
async function callBlocking(
  messages: ChatRole[],
  role: AIRole,
  cfg: AIConfig,
  opts: CallOptions
): Promise<string> {
  const temperature = role === 'chat' ? 0.5 : 0.3
  let res: Response
  try {
    res = await fetch(cfg.baseUrl + '/chat/completions', {
      method: 'POST',
      headers: buildHeaders(cfg),
      signal: opts.signal,
      body: JSON.stringify({
        model: cfg.models[role],
        messages,
        max_tokens: cfg.maxTokens[role],
        temperature,
      }),
    })
  } catch (err) {
    throw new Error(describeNetworkError(err, cfg.baseUrl))
  }

  if (!res.ok) throwForStatus(res.status, res.statusText, cfg.provider)

  const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Brak treści w odpowiedzi modelu.')
  return content
}

/**
 * Ścieżka serwera lokalnego — strumień SSE.
 *
 * Strumień jest tu mechanizmem wykrywania, czy serwer żyje, a nie ozdobnikiem UX:
 * generowanie raportu na modelu 31B potrafi trwać kilkanaście minut, więc timeout liczony
 * od startu żądania uderzałby zawsze. Zamiast tego liczymy czas BEZCZYNNOŚCI — resetowany
 * przy każdym chunku. Model może pracować godzinę; przerywamy dopiero gdy przez idleTimeoutMs
 * nie przyjdzie ani jeden token.
 */
async function callStreaming(
  messages: ChatRole[],
  role: AIRole,
  cfg: AIConfig,
  opts: CallOptions
): Promise<string> {
  const controller = new AbortController()
  const startedAt = Date.now()
  let abortReason: 'idle' | 'hard' | 'external' | null = null

  const onExternalAbort = () => { abortReason = 'external'; controller.abort() }
  if (opts.signal) {
    if (opts.signal.aborted) throw new Error('Anulowano.')
    opts.signal.addEventListener('abort', onExternalAbort, { once: true })
  }

  let idleTimer: ReturnType<typeof setTimeout> | null = null
  const resetIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { abortReason = 'idle'; controller.abort() }, cfg.idleTimeoutMs)
  }
  const hardTimer = setTimeout(() => { abortReason = 'hard'; controller.abort() }, cfg.hardTimeoutMs)

  const cleanup = () => {
    if (idleTimer) clearTimeout(idleTimer)
    clearTimeout(hardTimer)
    opts.signal?.removeEventListener('abort', onExternalAbort)
  }

  const idleSeconds = Math.round(cfg.idleTimeoutMs / 1000)

  try {
    resetIdle()

    let res: Response
    try {
      res = await fetch(cfg.baseUrl + '/chat/completions', {
        method: 'POST',
        headers: buildHeaders(cfg),
        signal: controller.signal,
        body: JSON.stringify({
          model: cfg.models[role],
          messages,
          max_tokens: cfg.maxTokens[role],
          temperature: role === 'chat' ? 0.5 : 0.3,
          stream: true,
          stream_options: { include_usage: true },
        }),
      })
    } catch (err) {
      if (abortReason === 'external') throw new Error('Anulowano.')
      if (abortReason === 'idle') throw new Error('Serwer lokalny nie odpowiedział przez ' + idleSeconds + ' s.')
      throw new Error(describeNetworkError(err, cfg.baseUrl))
    }

    if (!res.ok) throwForStatus(res.status, res.statusText, cfg.provider)
    if (!res.body) throw new Error('Serwer lokalny nie zwrócił strumienia odpowiedzi.')

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    let contentTokens = 0
    let reasoningTokens = 0
    let finishReason: string | null = null
    let reportedTokensPerSec: number | null = null
    let lastEmit = 0

    const emit = (force = false) => {
      if (!opts.onProgress) return
      const now = Date.now()
      if (!force && now - lastEmit < 400) return
      lastEmit = now
      const elapsedMs = now - startedAt
      const total = contentTokens + reasoningTokens
      opts.onProgress({
        contentTokens,
        reasoningTokens,
        tokensPerSec: reportedTokensPerSec ?? (elapsedMs > 0 ? (total / elapsedMs) * 1000 : null),
        elapsedMs,
        phase: total === 0 ? 'waiting' : contentTokens === 0 ? 'reasoning' : 'writing',
      })
    }

    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        resetIdle()
        buffer += decoder.decode(value, { stream: true })

        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) continue
          const payload = trimmed.slice(5).trim()
          if (!payload || payload === '[DONE]') continue

          let chunk: any
          try { chunk = JSON.parse(payload) } catch { continue }

          const delta = chunk?.choices?.[0]?.delta
          if (delta) {
            // Wyłącznie content trafia do raportu. reasoning_content to robocze rozumowanie
            // modelu (zwykle po angielsku) — liczymy je tylko jako postęp.
            if (typeof delta.content === 'string' && delta.content.length > 0) {
              content += delta.content
              contentTokens++
            }
            if (typeof delta.reasoning_content === 'string' && delta.reasoning_content.length > 0) {
              reasoningTokens++
            }
          }
          const fr = chunk?.choices?.[0]?.finish_reason
          if (fr) finishReason = fr

          const tps = chunk?.timings?.predicted_per_second
          if (typeof tps === 'number' && Number.isFinite(tps)) reportedTokensPerSec = tps
        }
        emit()
      }
    } catch (err) {
      if (abortReason === 'external') throw new Error('Anulowano.')
      if (abortReason === 'idle') {
        throw new Error(
          'Serwer lokalny przestał odpowiadać — przez ' + idleSeconds + ' s nie przyszedł żaden token. ' +
          'Sprawdź, czy serwer nadal działa.'
        )
      }
      if (abortReason === 'hard') throw new Error('Przekroczono maksymalny czas generowania (4 h).')
      throw new Error(describeNetworkError(err, cfg.baseUrl))
    }

    emit(true)

    const cleaned = stripInlineReasoning(content)
    if (!cleaned) {
      if (finishReason === 'length') {
        throw new Error(
          'Model zużył cały limit tokenów na rozumowanie i nie zdążył napisać odpowiedzi. ' +
          'Zwiększ limit tokenów w Ustawieniach → Silnik AI albo wybierz model bez trybu rozumowania.'
        )
      }
      throw new Error('Model nie zwrócił żadnej treści (odebrano ' + reasoningTokens + ' fragmentów rozumowania).')
    }
    return cleaned
  } finally {
    cleanup()
  }
}
