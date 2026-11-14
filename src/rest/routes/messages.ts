import type {
  ChatThreadMember,
  ChatThread,
  ChatThreadProperties,
  CreateChatOptions,
  CreateChatResult,
  MessageMention,
  MessageType,
  SendMessageOptions,
  SendMessageResult,
  TeamsExport,
} from '../../types'
import { CHATSVC_BASE, SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

type JsonObject = Record<string, unknown>

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const asArray = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : [])

const MENTION_TYPE = 'http://schema.skype.com/Mention'

/**
 * The web client generates numeric ids from two crypto uint32s, truncated to
 * 19 characters. Callers may supply their own id to make requests idempotent.
 */
export const generateClientMessageId = (): string => {
  const random = new Uint32Array(2)
  globalThis.crypto.getRandomValues(random)
  return `${random[0] ?? 0}${random[1] ?? 0}`.slice(0, 19)
}

export const escapeHtml = (content: string): string =>
  content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const messageTypeOf = (options: SendMessageOptions): MessageType =>
  options.messageType ?? options.messagetype ?? 'RichText/Html'

const formatContent = (content: string, options: SendMessageOptions): string => {
  if (messageTypeOf(options) === 'Text' || options.html === true || options.rawHtml === true) {
    return content
  }
  return `<p>${escapeHtml(content).replace(/\r\n|\r|\n/g, '<br>')}</p>`
}

const renderMentions = (mentions: MessageMention[]): JsonObject[] =>
  mentions.map((mention, index) => ({
    '@type': MENTION_TYPE,
    itemid: mention.itemId ?? mention.itemid ?? `${index}`,
    ...(mention.appId ? { appId: mention.appId } : {}),
    mri: mention.mri,
    mentionType: mention.mentionType ?? 'person',
    displayName: mention.displayName,
  }))

export const buildMessageBody = (content: string, options: SendMessageOptions = {}): JsonObject => {
  const clientMessageId = options.clientMessageId?.trim() || generateClientMessageId()
  const displayName = options.imDisplayName ?? options.displayName
  const mentions = options.mentions?.length ? renderMentions(options.mentions) : undefined
  const body: JsonObject = {
    messagetype: messageTypeOf(options),
    contenttype: 'text',
    content: formatContent(content, options),
  }
  if (displayName) body.imdisplayname = displayName
  body.clientmessageid = clientMessageId
  body.properties = {
    importance: options.importance ?? '',
    ...(options.subject ? { subject: options.subject } : {}),
    ...(mentions ? { mentions: JSON.stringify(mentions) } : {}),
  }
  if (options.replyChainId) body.replyChainId = options.replyChainId
  return body
}

export const messageUrl = (conversationId: string, rootMessageId?: string): string => {
  const target = rootMessageId ? `${conversationId};messageid=${rootMessageId}` : conversationId
  return `${CHATSVC_BASE}v1/users/ME/conversations/${encodeURIComponent(target)}/messages`
}

const lastLocationSegment = (location: string | null, label: string): string => {
  if (!location) throw new Error(`${label} response has no Location header`)
  const path = location.split('?')[0]?.split('#')[0] ?? ''
  const segment = path.split('/').filter(Boolean).pop()
  if (!segment) throw new Error(`${label} Location header has no id`)
  return decodeURIComponent(segment)
}

export const sendConversationMessage = async (
  rest: RestClient,
  conversationId: string,
  content: string,
  options?: SendMessageOptions,
): Promise<SendMessageResult> => {
  const body = buildMessageBody(content, options)
  const clientMessageId =
    typeof body.clientmessageid === 'string' ? body.clientmessageid : generateClientMessageId()

  const response = await rest.requestResponse(messageUrl(conversationId), {
    scope: SCOPES.chats,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

  const id = lastLocationSegment(response.headers.get('location'), 'Message')
  let payload: unknown
  const text = await response.text()
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      throw new Error('Message response was not valid JSON')
    }
  }
  const arrival = isObject(payload)
    ? (payload.OriginalArrivalTime ?? payload.originalarrivaltime)
    : undefined
  const originalArrivalTime =
    typeof arrival === 'string' || typeof arrival === 'number' ? arrival : undefined

  return {
    id,
    clientMessageId,
    ...(originalArrivalTime !== undefined ? { originalArrivalTime } : {}),
    conversationId,
  }
}

export const postChannelMessage = (
  rest: RestClient,
  channelId: string,
  content: string,
  options?: SendMessageOptions,
): Promise<SendMessageResult> => sendConversationMessage(rest, channelId, content, options)

export const replyToChannelMessage = async (
  rest: RestClient,
  channelId: string,
  rootMessageId: string,
  content: string,
  options?: SendMessageOptions,
): Promise<SendMessageResult> => {
  if (!rootMessageId.trim()) throw new Error('A root message id is required for a reply')
  // The whole composite id is encoded, producing `%3Bmessageid%3D` on the wire.
  const result = await sendConversationMessage(
    rest,
    `${channelId};messageid=${rootMessageId}`,
    content,
    {
      ...options,
      replyChainId: options?.replyChainId ?? rootMessageId,
    },
  )
  return { ...result, conversationId: channelId }
}

export const createChat = async (
  rest: RestClient,
  options: CreateChatOptions,
): Promise<CreateChatResult> => {
  if (!options.selfMri.trim()) throw new Error('A self MRI is required to create a chat')
  if (!Array.isArray(options.members)) throw new Error('Chat members are required')

  const members: ChatThreadMember[] = [{ id: options.selfMri, role: 'Admin' }]
  const seen = new Set([options.selfMri])
  for (const input of options.members) {
    const member: ChatThreadMember =
      typeof input === 'string'
        ? { id: input, role: 'User' }
        : {
            id: input.id,
            role: input.role ?? 'User',
            ...(input.secondaryId ? { secondaryId: input.secondaryId } : {}),
          }
    if (!member.id.trim()) throw new Error('A chat member id must not be empty')
    if (seen.has(member.id)) continue
    seen.add(member.id)
    members.push(member)
  }

  const properties: Partial<ChatThreadProperties> & Record<string, unknown> = {
    threadType: 'chat',
    chatFilesIndexId: 2,
    fixedRoster: true,
    uniquerosterthread: true,
    ...(options.topic ? { topic: options.topic } : {}),
    ...options.properties,
  }

  const response = await rest.requestResponse(`${CHATSVC_BASE}v1/threads`, {
    scope: SCOPES.chats,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ members, properties }),
  })
  const threadId = lastLocationSegment(response.headers.get('location'), 'Create chat')

  let payload: unknown
  const text = await response.text()
  if (text.trim()) {
    try {
      payload = JSON.parse(text) as unknown
    } catch {
      throw new Error('Create chat response was not valid JSON')
    }
  }

  return {
    threadId,
    status: response.status,
    ...(payload !== undefined ? { response: payload } : {}),
  }
}

/** Find an existing 1:1 chat with `userMri` in a current-user snapshot. */
export const findOneToOneChat = (me: TeamsExport, userMri: string): ChatThread | undefined => {
  const chats = asArray<ChatThread>(me.chats)
  return chats.find((chat) => {
    if (chat.isOneOnOne !== true) return false
    const members = asArray<{ mri?: string }>(chat.members)
    return members.some((member) => member.mri === userMri)
  })
}

const readMri = (value: unknown): string | undefined => {
  if (!isObject(value)) return undefined
  for (const key of ['mri', 'userMri'] as const) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  return undefined
}

/**
 * Best-effort resolution of the signed-in user's MRI from the current-user
 * snapshot. The web client does not expose a stable self field, so callers can
 * (and for password-less/live accounts should) pass `selfMri` explicitly.
 */
export const findCurrentUserMri = (me: TeamsExport): string | undefined => {
  const root = me as unknown as JsonObject
  for (const key of ['mri', 'userMri', 'currentUserMri'] as const) {
    const candidate = root[key]
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim()
  }
  for (const key of ['user', 'me', 'currentUser'] as const) {
    const mri = readMri(root[key])
    if (mri) return mri
  }

  const users = asArray<JsonObject>(me.users)
  for (const user of users) {
    if (user.isMe === true || user.currentUser === true || user.self === true) {
      const mri = readMri(user)
      if (mri) return mri
    }
  }

  // The signed-in user is normally present in every chat's roster. Only trust
  // the intersection when it identifies exactly one member.
  const rosterSets: Set<string>[] = []
  for (const chat of asArray<ChatThread>(me.chats)) {
    const mris = asArray<{ mri?: string }>(chat.members)
      .map((member) => member.mri)
      .filter((mri): mri is string => typeof mri === 'string' && mri.length > 0)
    if (mris.length) rosterSets.push(new Set(mris))
  }
  let intersection: Set<string> | undefined
  for (const roster of rosterSets) {
    if (!intersection) {
      intersection = new Set(roster)
      continue
    }
    for (const mri of intersection) {
      if (!roster.has(mri)) intersection.delete(mri)
    }
  }
  if (intersection?.size === 1) return intersection.values().next().value
  return undefined
}
