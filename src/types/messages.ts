export type MessageType = 'RichText/Html' | 'Text'

export type MessageImportance = '' | 'high' | 'urgent'

export type MessageMention = {
  itemId?: string
  itemid?: string
  mri: string
  displayName: string
  mentionType?: string
  appId?: string
}

export type SendMessageOptions = {
  /**
   * Wire `messagetype`. Defaults to `RichText/Html`. Use `Text` to send the
   * content verbatim without HTML wrapping.
   */
  messageType?: MessageType
  /** Alias for `messageType`, matching the wire field name. */
  messagetype?: MessageType
  /** Treat `content` as raw HTML instead of escaping and wrapping it in `<p>`. */
  html?: boolean
  /** Alias for `html`. */
  rawHtml?: boolean
  importance?: MessageImportance
  /** Channel post title (wire `properties.subject`). */
  subject?: string
  mentions?: MessageMention[]
  /** Caller-supplied client message id. Omit to generate a numeric id. */
  clientMessageId?: string
  displayName?: string
  /** Alias for `displayName`; sent as the wire `imdisplayname` field. */
  imDisplayName?: string
  /** Set on replies; also added automatically by `channels.reply`. */
  replyChainId?: string
}

export type SendMessageResult = {
  id: string
  clientMessageId: string
  originalArrivalTime?: string | number
  conversationId: string
}

export type ChatThreadMemberRole = 'Admin' | 'User' | 'Guest'

export type ChatThreadMemberInput = {
  id: string
  role?: ChatThreadMemberRole
  secondaryId?: string
}

export type ChatThreadMember = {
  id: string
  role: ChatThreadMemberRole
  secondaryId?: string
}

export type ChatThreadProperties = {
  threadType: string
  chatFilesIndexId: number
  fixedRoster: boolean
  uniquerosterthread: boolean
  topic?: string
  [key: string]: unknown
}

export type CreateChatOptions = {
  /** Your own MRI, e.g. `8:orgid:<guid>`. Added as the Admin member. */
  selfMri: string
  /** Other members as MRIs or member objects. Your own MRI is de-duplicated. */
  members: Array<string | ChatThreadMemberInput>
  topic?: string
  properties?: Partial<ChatThreadProperties>
}

export type CreateChatResult = {
  threadId: string
  status: number
  response?: unknown
}

export type SendDirectMessageOptions = SendMessageOptions & {
  /**
   * Your own MRI. When omitted, it is derived from the current-user snapshot
   * when possible; otherwise the call throws.
   */
  selfMri?: string
  topic?: string
  /**
   * Reuse an existing 1:1 chat when it appears in the current-user snapshot.
   * Defaults to true. Set false to always create a new thread.
   */
  reuseExisting?: boolean
}

export type SendDirectMessageResult = SendMessageResult & {
  threadId: string
  createdChat: boolean
}
