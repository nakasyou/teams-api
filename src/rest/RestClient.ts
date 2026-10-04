import type { ScopeTokenProvider } from '../auth/TokenManager'
import { TEAMS_WORKER_REFERRER } from './constants'

type QueryPrimitive = string | number | boolean
export type QueryParams = Record<string, QueryPrimitive | undefined>

export type RestRequestOptions = {
  scope: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: URLSearchParams | QueryParams
  headers?: Record<string, string>
  body?: string | URLSearchParams | Blob | FormData
  referrer?: string
  redirect?: 'error' | 'follow' | 'manual'
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
    const res = await this.requestResponse(url, options)
    if (res.status === 204) {
      return undefined as T
    }
    return (await res.json()) as T
  }

  async requestResponse(url: string, options: RestRequestOptions): Promise<Response> {
    const token = await this.#tokenProvider.getTokenFromScope(options.scope)
    const headers = new Headers(options.headers)
    headers.set('authorization', `Bearer ${token}`)

    const method = options.method ?? 'GET'
    const res = await fetch(appendQuery(url, options.query), {
      method,
      headers,
      referrer: options.referrer ?? this.#referrer,
      body: options.body,
      redirect: options.redirect ?? 'error',
    })

    if (!res.ok) {
      if (options.redirect === 'manual' && [301, 302, 303, 307, 308].includes(res.status)) {
        return res
      }
      throw new Error(
        `Failed request ${method} ${new URL(url).pathname}: ${res.status} ${res.statusText}`,
      )
    }

    return res
  }
}
