import type { ChannelPostMessage, ChannelPostsResponse } from '../../types'
import { SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

export const MAX_CHANNEL_MESSAGE_PAGES = 50

/**
 * Maximum `pageSize` accepted by the CSA channel endpoint. Verified live:
 * larger values return 400 Bad Request.
 */
export const MAX_CHANNEL_PAGE_SIZE = 50

export type ChannelQueryOptions = {
  pageSize?: number
  /**
   * Opaque cursor returned as `continuationToken` by the previous CSA channel
   * response.
   *
   * The cursor is the response's `continuationToken`, verified against the live
   * CSA API with read-only requests. It is not found in the downloaded
   * web-client bundles.
   */
  continuationToken?: string
}

export type ChannelMessagePagesOptions = ChannelQueryOptions & {
  /** Maximum number of flattened messages to scan; defaults to unlimited. */
  maxMessages?: number
  /** Safety cap for network pages; defaults to 50. */
  maxPages?: number
}

export type ChannelMessagePages = {
  messages: ChannelPostMessage[]
  pages: number
}

export const fetchChannel = async (
  rest: RestClient,
  teamId: string,
  channelId: string,
  options?: ChannelQueryOptions,
): Promise<ChannelPostsResponse> => {
  const pageSize = options?.pageSize ?? 20
  const query: Record<string, string | number> = { pageSize }
  if (options?.continuationToken) {
    query.continuationToken = options.continuationToken
  }

  return rest.request<ChannelPostsResponse>(
    `https://teams.cloud.microsoft/api/csa/apac/api/v1/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
    {
      scope: SCOPES.channels,
      query,
    },
  )
}

export const flattenChannelMessages = (posts: ChannelPostsResponse): ChannelPostMessage[] => {
  const messages: ChannelPostMessage[] = []

  for (const chain of posts.replyChains) {
    if (Array.isArray(chain.messages)) {
      messages.push(...chain.messages)
      continue
    }
    if (Array.isArray(chain.replies)) {
      messages.push(...chain.replies)
      continue
    }
    if (chain.message) {
      messages.push(chain.message)
    }
  }

  return messages
}

export const fetchChannelMessages = async (
  rest: RestClient,
  teamId: string,
  channelId: string,
  options?: ChannelQueryOptions,
): Promise<ChannelPostMessage[]> => {
  const posts = await fetchChannel(rest, teamId, channelId, options)
  return flattenChannelMessages(posts)
}

/**
 * Fetch channel reply chains across pages, following `hasMore` and the
 * `continuationToken` returned by each response.
 *
 * The cursor is the response's `continuationToken`, verified against the live
 * CSA API with read-only requests. It is not found in the downloaded
 * web-client bundles.
 */
export const fetchChannelMessagePages = async (
  rest: RestClient,
  teamId: string,
  channelId: string,
  options?: ChannelMessagePagesOptions,
): Promise<ChannelMessagePages> => {
  const maxMessages = options?.maxMessages ?? Number.POSITIVE_INFINITY
  const maxPages = options?.maxPages ?? MAX_CHANNEL_MESSAGE_PAGES
  if (maxPages < 1) throw new Error('Channel message page limit must be positive')
  const pageSize =
    options?.pageSize === undefined ? undefined : Math.min(options.pageSize, MAX_CHANNEL_PAGE_SIZE)

  const messages: ChannelPostMessage[] = []
  const seenMessageIds = new Set<string>()
  const seenCursors = new Set<string>()
  let cursor = options?.continuationToken
  if (cursor) seenCursors.add(cursor)
  let pages = 0

  while (true) {
    if (pages >= maxPages) {
      throw new Error(`Channel message pagination exceeded ${maxPages} pages`)
    }
    const posts = await fetchChannel(rest, teamId, channelId, {
      pageSize,
      continuationToken: cursor,
    })
    pages += 1
    appendMessages(messages, flattenChannelMessages(posts), maxMessages, seenMessageIds)

    if (messages.length >= maxMessages || !posts.hasMore) break
    const nextCursor = posts.continuationToken
    if (!nextCursor) break
    if (seenCursors.has(nextCursor)) {
      throw new Error('Repeated channel message pagination cursor')
    }
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }

  return { messages, pages }
}

function appendMessages(
  target: ChannelPostMessage[],
  incoming: ChannelPostMessage[],
  maxMessages: number,
  seenMessageIds: Set<string>,
): void {
  for (const message of incoming) {
    if (target.length >= maxMessages) return
    const id = typeof message.id === 'string' ? message.id : undefined
    if (id !== undefined && seenMessageIds.has(id)) continue
    if (id !== undefined) seenMessageIds.add(id)
    target.push(message)
  }
}
