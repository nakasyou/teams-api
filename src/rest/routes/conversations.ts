import type {
  ConversationMessage,
  ConversationMessagesOptions,
  ConversationMessagesResponse,
} from '../../types'
import { CHATSVC_BASE, SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

export const MAX_CONVERSATION_MESSAGE_PAGES = 50

const CHATS_SERVICE_HOST = new URL(CHATSVC_BASE).host
const CHATS_SERVICE_PATH_PREFIX = '/api/chatsvc/'

export type ConversationMessagePagesOptions = ConversationMessagesOptions & {
  /** Maximum number of messages to scan; defaults to unlimited. */
  maxMessages?: number
  /** Safety cap for network pages; defaults to 50. */
  maxPages?: number
}

export const conversationMessagesUrl = (conversationId: string): string =>
  `${CHATSVC_BASE}v1/users/ME/conversations/${encodeURIComponent(conversationId)}/messages`

export const fetchConversationMessages = async (
  rest: RestClient,
  conversationId: string,
  options?: ConversationMessagesOptions,
): Promise<ConversationMessagesResponse> => {
  const {
    view = 'msnp24Equivalent|supportsMessageProperties',
    pageSize = 200,
    startTime = 1,
    syncState,
    endTime,
    draftVersion,
  } = options ?? {}

  const query = new URLSearchParams({
    view,
    pageSize: `${pageSize}`,
    startTime: `${startTime}`,
  })

  if (syncState) {
    query.set('syncState', syncState)
  }
  if (typeof endTime !== 'undefined') {
    query.set('endTime', `${endTime}`)
  }
  if (draftVersion) {
    query.set('draftVersion', draftVersion)
  }

  return rest.request<ConversationMessagesResponse>(conversationMessagesUrl(conversationId), {
    scope: SCOPES.chats,
    query,
  })
}

/**
 * Fetch conversation messages across pages by following `_metadata.backwardLink`.
 *
 * The Teams web client treats `backwardLink` as the full URL for older messages
 * (worker-c.js, and precompiled-web-worker-inner~c: it is read from
 * `response._metadata.backwardLink`). Only HTTPS GETs to the original chatsvc
 * host (or teams.cloud.microsoft) under /api/chatsvc/ are followed.
 */
export const fetchConversationMessagePages = async (
  rest: RestClient,
  conversationId: string,
  options?: ConversationMessagePagesOptions,
): Promise<ConversationMessagesResponse> => {
  const maxMessages = options?.maxMessages ?? Number.POSITIVE_INFINITY
  const maxPages = options?.maxPages ?? MAX_CONVERSATION_MESSAGE_PAGES
  if (maxPages < 1) throw new Error('Conversation message page limit must be positive')

  const initialUrl = conversationMessagesUrl(conversationId)
  const first = await fetchConversationMessages(rest, conversationId, options)
  if (!Array.isArray(first.messages)) throw new Error('Expected conversation messages')

  const messages: ConversationMessage[] = []
  const seenMessageIds = new Set<string>()
  appendMessages(messages, first.messages, maxMessages, seenMessageIds)

  let metadata = first._metadata
  let backwardLink = metadata?.backwardLink
  const seenLinks = new Set<string>([canonicalLink(initialUrl)])
  let page = 1

  while (messages.length < maxMessages && backwardLink) {
    if (page >= maxPages) {
      throw new Error(`Conversation message pagination exceeded ${maxPages} pages`)
    }

    const next = validateConversationBackwardLink(backwardLink, initialUrl).href
    if (seenLinks.has(next)) {
      throw new Error('Repeated conversation message pagination link')
    }
    seenLinks.add(next)

    const response = await rest.request<ConversationMessagesResponse>(next, {
      scope: SCOPES.chats,
      method: 'GET',
    })
    if (!Array.isArray(response.messages)) throw new Error('Expected conversation messages')
    appendMessages(messages, response.messages, maxMessages, seenMessageIds)
    metadata = response._metadata ?? metadata
    backwardLink = response._metadata?.backwardLink
    page += 1
  }

  return { ...first, messages, _metadata: metadata }
}

/**
 * Validate a chatsvc `backwardLink` before following it.
 *
 * A valid link is an absolute HTTPS URL with no credentials on either the
 * original chatsvc host or teams.cloud.microsoft and a path below /api/chatsvc/.
 */
export const validateConversationBackwardLink = (link: string, originalUrl: string): URL => {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    throw new Error('Invalid conversation message pagination link')
  }
  const original = new URL(originalUrl)
  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new Error('Conversation message pagination link must be HTTPS')
  }
  if (url.host !== original.host && url.host !== CHATS_SERVICE_HOST) {
    throw new Error('Conversation message pagination link host is not allowed')
  }
  if (!url.pathname.startsWith(CHATS_SERVICE_PATH_PREFIX)) {
    throw new Error('Conversation message pagination link path is not allowed')
  }
  return url
}

function canonicalLink(link: string): string {
  try {
    return new URL(link).href
  } catch {
    return link
  }
}

function appendMessages(
  target: ConversationMessage[],
  incoming: ConversationMessage[],
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
