import type { RestClient, QueryParams } from '../RestClient'
import type { ODataCollection } from '../../types/files'

export const graphRoot = 'https://graph.microsoft.com/v1.0'
export const encodeId = (id: string): string => {
  if (!id.trim()) throw new Error('An ID must not be empty')
  return encodeURIComponent(id)
}

export function validateServiceUrl(input: string, service: 'sharepoint' | 'graph' | 'notes'): URL {
  const url = new URL(input)
  const validHost =
    service === 'sharepoint'
      ? /(^|\.)sharepoint\.(com|us|de|cn)$/.test(url.hostname)
      : service === 'graph'
        ? url.hostname === 'graph.microsoft.com'
        : url.hostname === 'www.onenote.com'
  if (url.protocol !== 'https:' || !validHost || url.username || url.password || url.port) {
    throw new Error(`Expected an HTTPS ${service} URL`)
  }
  return url
}

export async function collect<T>(
  rest: RestClient,
  url: string,
  scope: string,
  query?: QueryParams,
): Promise<ODataCollection<T>> {
  const origin = new URL(url).origin
  const visited = new Set<string>()
  const value: T[] = []
  let next: string | undefined = url
  while (next) {
    const parsed = new URL(next, url)
    if (parsed.origin !== origin || parsed.username || parsed.password) {
      throw new Error('Refusing a pagination URL outside the API origin')
    }
    if (visited.has(parsed.href)) throw new Error('Repeated pagination URL')
    visited.add(parsed.href)
    const page: ODataCollection<T> = await rest.request(parsed.href, { scope, query })
    if (!Array.isArray(page.value)) throw new Error('Expected an OData collection')
    value.push(...page.value)
    next = page['@odata.nextLink']
    query = undefined
  }
  return { value }
}

export function listQuery(options?: {
  top?: number
  orderBy?: string
  select?: string
  expand?: string
  filter?: string
}): QueryParams {
  if (options?.top !== undefined && (!Number.isInteger(options.top) || options.top < 1)) {
    throw new Error('top must be a positive integer')
  }
  return {
    $top: options?.top,
    $orderby: options?.orderBy,
    $select: options?.select,
    $expand: options?.expand,
    $filter: options?.filter,
  }
}

export async function fetchDownload(url: string): Promise<Response> {
  let current = new URL(url)
  for (let redirects = 0; redirects <= 5; redirects++) {
    if (current.protocol !== 'https:' || current.username || current.password) {
      throw new Error('Expected an HTTPS download URL')
    }
    const response = await fetch(current, { redirect: 'manual' })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Download redirect has no location')
      await response.body?.cancel()
      current = new URL(location, current)
      continue
    }
    if (!response.ok) throw new Error(`Download failed: ${response.status} ${response.statusText}`)
    return response
  }
  throw new Error('Too many download redirects')
}
