import type { ChannelPostMessage, ChannelPostsResponse } from '../../types'
import { SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

export const MAX_CHANNEL_MESSAGE_PAGES = 50

export type ChannelQueryOptions = {
  pageSize?: number
  /**
   * Cursor for older reply chains.
   *
   * The downloaded Teams web client bundles contain `hasMore` and
   * `lastModifiedTimeOfLastReturnedReplyChain` response handling in the CSA
   * reply-chain types, but the bundles available in
   * /workspace/teams-api-issue3-analysis/js/pretty/ do not include the CSA
   * request builder or this query parameter. The parameter name below mirrors
   * the response field and has not been verified against the web client JS.
   */
  lastModifiedTimeOfLastReturnedReplyChain?: string
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
  if (options?.lastModifiedTimeOfLastReturnedReplyChain) {
    query.lastModifiedTimeOfLastReturnedReplyChain =
      options.lastModifiedTimeOfLastReturnedReplyChain
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
 * Fetch channel reply chains across pages, following `hasMore` with the
 * `lastModifiedTimeOfLastReturnedReplyChain` cursor.
 *
 * See `ChannelQueryOptions` for the evidence gap: the web client JS available
 * locally does not show the CSA next-page query parameter, so the request
 * cursor name is inferred from the response shape.
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

  const messages: ChannelPostMessage[] = []
  const seenMessageIds = new Set<string>()
  const seenCursors = new Set<string>()
  let cursor = options?.lastModifiedTimeOfLastReturnedReplyChain
  if (cursor) seenCursors.add(cursor)
  let pages = 0

  while (true) {
    if (pages >= maxPages) {
      throw new Error(`Channel message pagination exceeded ${maxPages} pages`)
    }
    const posts = await fetchChannel(rest, teamId, channelId, {
      pageSize: options?.pageSize,
      lastModifiedTimeOfLastReturnedReplyChain: cursor,
    })
    pages += 1
    appendMessages(messages, flattenChannelMessages(posts), maxMessages, seenMessageIds)

    if (messages.length >= maxMessages || !posts.hasMore) break
    const nextCursor = posts.lastModifiedTimeOfLastReturnedReplyChain
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
