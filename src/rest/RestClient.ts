import type { ScopeTokenProvider } from '../auth/TokenManager'
import { TEAMS_WORKER_REFERRER } from './constants'

type QueryPrimitive = string | number | boolean
export type QueryParams = Record<string, QueryPrimitive | undefined>

export type RestRequestOptions = {
  scope: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: URLSearchParams | QueryParams
  headers?: Record<string, string>
  body?: string | URLSearchParams
  referrer?: string
}

const appendQuery = (url: string, query?: URLSearchParams | QueryParams): string => {
  if (!query) {
    return url
  }

  const searchParams =
    query instanceof URLSearchParams
      ? query
      : new URLSearchParams(
          Object.entries(query).flatMap<[string, string]>(([key, value]) => {
            if (typeof value === 'undefined') {
              return []
            }
            return [[key, String(value)]]
          }),
        )

  const queryString = searchParams.toString()
  if (!queryString) {
    return url
  }

  return `${url}${url.includes('?') ? '&' : '?'}${queryString}`
}

export class RestClient {
  readonly #tokenProvider: ScopeTokenProvider
  readonly #referrer: string

  constructor(tokenProvider: ScopeTokenProvider, referrer = TEAMS_WORKER_REFERRER) {
    this.#tokenProvider = tokenProvider
    this.#referrer = referrer
  }

  async request<T>(url: string, options: RestRequestOptions): Promise<T> {
    const token = await this.#tokenProvider.getTokenFromScope(options.scope)
    const headers = new Headers(options.headers)
    headers.set('authorization', `Bearer ${token}`)

    const method = options.method ?? 'GET'
    const res = await fetch(appendQuery(url, options.query), {
      method,
      headers,
      referrer: options.referrer ?? this.#referrer,
      body: options.body,
    })

    if (!res.ok) {
      throw new Error(`Failed request ${method} ${url}: ${res.status} ${res.statusText}`)
    }

    return (await res.json()) as T
  }
}
