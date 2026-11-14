import type { ScopeTokenProvider } from '../auth/TokenManager'
import { RestClient } from '../rest'
import { TeamsFilesAPI } from '../rest/routes/files'
import { TeamsNotebooksAPI, TeamsClassNotebooksAPI } from '../rest/routes/notebooks'
import {
  fetchChannel,
  fetchChannelMessages,
  type ChannelQueryOptions,
} from '../rest/routes/channels'
import { fetchConversationMessages } from '../rest/routes/conversations'
import {
  createChat,
  findCurrentUserMri,
  findOneToOneChat,
  postChannelMessage,
  replyToChannelMessage,
  sendConversationMessage,
} from '../rest/routes/messages'
import {
  fetchCurrentUser,
  fetchPinnedChannels,
  fetchShortProfile,
  type FetchShortProfileOptions,
} from '../rest/routes/users'
import type {
  ChannelPostMessage,
  ChannelPostsResponse,
  ChatThreadMemberInput,
  ChatThreadProperties,
  ConversationMessagesOptions,
  ConversationMessagesResponse,
  CreateChatOptions,
  CreateChatResult,
  PinnedChannelsResponse,
  SendDirectMessageOptions,
  SendDirectMessageResult,
  SendMessageOptions,
  SendMessageResult,
  ShortProfileUser,
  TeamsExport,
} from '../types'

export type { ChannelQueryOptions, FetchShortProfileOptions }

export interface TeamsConversationsAPI {
  fetchMessages(
    conversationId: string,
    options?: ConversationMessagesOptions,
  ): Promise<ConversationMessagesResponse>
  sendMessage(
    conversationId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>
}

export interface TeamsNotificationsAPI {
  fetchMessages(options?: ConversationMessagesOptions): Promise<ConversationMessagesResponse>
  fetchMentions(options?: ConversationMessagesOptions): Promise<ConversationMessagesResponse>
  fetchAnnotations(options?: ConversationMessagesOptions): Promise<ConversationMessagesResponse>
}

export interface TeamsChannelsAPI {
  fetch(
    teamId: string,
    channelId: string,
    options?: ChannelQueryOptions,
  ): Promise<ChannelPostsResponse>
  fetchMessages(
    teamId: string,
    channelId: string,
    options?: ChannelQueryOptions,
  ): Promise<ChannelPostMessage[]>
  /** Post a top-level channel message. `channelId` is the channel conversation id. */
  post(channelId: string, content: string, options?: SendMessageOptions): Promise<SendMessageResult>
  /** Team-scoped form kept consistent with `fetch`/`fetchMessages`. */
  post(
    teamId: string | undefined,
    channelId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>
  /** Reply to a channel root post. */
  reply(
    channelId: string,
    rootMessageId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>
  /** Team-scoped form kept consistent with `fetch`/`fetchMessages`. */
  reply(
    teamId: string | undefined,
    channelId: string,
    rootMessageId: string,
    content: string,
    options?: SendMessageOptions,
  ): Promise<SendMessageResult>
}

export interface TeamsChatsAPI {
  create(options: CreateChatOptions): Promise<CreateChatResult>
  create(
    selfMri: string,
    members: Array<string | ChatThreadMemberInput>,
    options?: { topic?: string; properties?: Partial<ChatThreadProperties> },
  ): Promise<CreateChatResult>
  sendDirectMessage(
    userMri: string,
    content: string,
    options?: SendDirectMessageOptions,
  ): Promise<SendDirectMessageResult>
}

export interface TeamsUsersMeAPI {
  fetch(): Promise<TeamsExport>
  fetchPinnedChannels(): Promise<PinnedChannelsResponse>
}

export interface TeamsUsersAPI {
  fetchShortProfile(
    mriOrEmailArray: string[],
    options?: FetchShortProfileOptions,
  ): Promise<ShortProfileUser[]>
  me: TeamsUsersMeAPI
}

export interface TeamsClientTeamsAPI {
  files: TeamsFilesAPI
  notebooks: TeamsNotebooksAPI
  classNotebooks: TeamsClassNotebooksAPI
  conversations: TeamsConversationsAPI
  notifications: TeamsNotificationsAPI
  channels: TeamsChannelsAPI
  chats: TeamsChatsAPI
  users: TeamsUsersAPI
}

export class TeamsClient {
  readonly rest: RestClient
  readonly teams: TeamsClientTeamsAPI

  constructor(tokenProvider: ScopeTokenProvider) {
    this.rest = new RestClient(tokenProvider)

    this.teams = {
      files: new TeamsFilesAPI(this.rest),
      notebooks: new TeamsNotebooksAPI(this.rest),
      classNotebooks: new TeamsClassNotebooksAPI(this.rest),
      conversations: {
        fetchMessages: (conversationId, options) =>
          this.fetchConversationMessages(conversationId, options),
        sendMessage: (conversationId, content, options) =>
          sendConversationMessage(this.rest, conversationId, content, options),
      },
      notifications: {
        fetchMessages: (options) => this.fetchConversationMessages('48:notifications', options),
        fetchMentions: (options) => this.fetchConversationMessages('48:mentions', options),
        fetchAnnotations: (options) => this.fetchConversationMessages('48:annotations', options),
      },
      channels: {
        fetch: (teamId, channelId, options) => this.fetchChannel(teamId, channelId, options),
        fetchMessages: (teamId, channelId, options) =>
          this.fetchChannelMessages(teamId, channelId, options),
        post: ((
          teamIdOrChannelId: string,
          channelIdOrContent: string,
          contentOrOptions?: string | SendMessageOptions,
          maybeOptions?: SendMessageOptions,
        ) =>
          this.postChannel(
            teamIdOrChannelId,
            channelIdOrContent,
            contentOrOptions,
            maybeOptions,
          )) as TeamsChannelsAPI['post'],
        reply: ((
          teamIdOrChannelId: string,
          channelIdOrRootId: string,
          rootIdOrContent: string,
          contentOrOptions?: string | SendMessageOptions,
          maybeOptions?: SendMessageOptions,
        ) =>
          this.replyToChannel(
            teamIdOrChannelId,
            channelIdOrRootId,
            rootIdOrContent,
            contentOrOptions,
            maybeOptions,
          )) as TeamsChannelsAPI['reply'],
      },
      chats: {
        create: ((
          selfMriOrOptions: string | CreateChatOptions,
          members?: Array<string | ChatThreadMemberInput>,
          options?: { topic?: string; properties?: Partial<ChatThreadProperties> },
        ) => this.createChatThread(selfMriOrOptions, members, options)) as TeamsChatsAPI['create'],
        sendDirectMessage: (userMri, content, options) =>
          this.sendDirectMessage(userMri, content, options),
      },
      users: {
        fetchShortProfile: (mriOrEmailArray, options) =>
          this.fetchShortProfile(mriOrEmailArray, options),
        me: {
          fetch: () => this.fetchCurrentUser(),
          fetchPinnedChannels: () => this.fetchPinnedChannels(),
        },
      },
    }
  }

  private async fetchConversationMessages(
    conversationId: string,
    options?: ConversationMessagesOptions,
  ): Promise<ConversationMessagesResponse> {
    return fetchConversationMessages(this.rest, conversationId, options)
  }

  private async fetchChannel(
    teamId: string,
    channelId: string,
    options?: ChannelQueryOptions,
  ): Promise<ChannelPostsResponse> {
    return fetchChannel(this.rest, teamId, channelId, options)
  }

  private async fetchChannelMessages(
    teamId: string,
    channelId: string,
    options?: ChannelQueryOptions,
  ): Promise<ChannelPostMessage[]> {
    return fetchChannelMessages(this.rest, teamId, channelId, options)
  }

  private postChannel(
    teamIdOrChannelId: string,
    channelIdOrContent: string,
    contentOrOptions?: string | SendMessageOptions,
    maybeOptions?: SendMessageOptions,
  ): Promise<SendMessageResult> {
    if (typeof contentOrOptions === 'string') {
      return postChannelMessage(this.rest, channelIdOrContent, contentOrOptions, maybeOptions)
    }
    return postChannelMessage(this.rest, teamIdOrChannelId, channelIdOrContent, contentOrOptions)
  }

  private replyToChannel(
    teamIdOrChannelId: string,
    channelIdOrRootId: string,
    rootIdOrContent: string,
    contentOrOptions?: string | SendMessageOptions,
    maybeOptions?: SendMessageOptions,
  ): Promise<SendMessageResult> {
    if (typeof contentOrOptions === 'string') {
      return replyToChannelMessage(
        this.rest,
        channelIdOrRootId,
        rootIdOrContent,
        contentOrOptions,
        maybeOptions,
      )
    }
    return replyToChannelMessage(
      this.rest,
      teamIdOrChannelId,
      channelIdOrRootId,
      rootIdOrContent,
      contentOrOptions,
    )
  }

  private createChatThread(
    selfMriOrOptions: string | CreateChatOptions,
    members?: Array<string | ChatThreadMemberInput>,
    options?: { topic?: string; properties?: Partial<ChatThreadProperties> },
  ): Promise<CreateChatResult> {
    if (typeof selfMriOrOptions === 'string') {
      return createChat(this.rest, {
        selfMri: selfMriOrOptions,
        members: members ?? [],
        ...(options?.topic ? { topic: options.topic } : {}),
        ...(options?.properties ? { properties: options.properties } : {}),
      })
    }
    return createChat(this.rest, selfMriOrOptions)
  }

  private async sendDirectMessage(
    userMri: string,
    content: string,
    options: SendDirectMessageOptions = {},
  ): Promise<SendDirectMessageResult> {
    if (!userMri.trim()) throw new Error('A recipient MRI is required')
    const { selfMri, topic, reuseExisting = true, ...messageOptions } = options
    const me = reuseExisting || !selfMri ? await this.fetchCurrentUser() : undefined

    if (reuseExisting && me) {
      const existing = findOneToOneChat(me, userMri)
      if (existing) {
        const result = await sendConversationMessage(
          this.rest,
          existing.id,
          content,
          messageOptions,
        )
        return { ...result, threadId: existing.id, createdChat: false }
      }
    }

    const resolvedSelfMri = selfMri?.trim() || (me ? findCurrentUserMri(me) : undefined)
    if (!resolvedSelfMri) {
      throw new Error(
        'Cannot determine your own MRI. Pass selfMri (library) or --self-mri (CLI) to create a chat.',
      )
    }
    const chat = await this.createChatThread({
      selfMri: resolvedSelfMri,
      members: [userMri],
      ...(topic ? { topic } : {}),
    })
    const result = await sendConversationMessage(this.rest, chat.threadId, content, messageOptions)
    return { ...result, threadId: chat.threadId, createdChat: true }
  }

  private async fetchShortProfile(
    mriOrEmailArray: string[],
    options?: FetchShortProfileOptions,
  ): Promise<ShortProfileUser[]> {
    return fetchShortProfile(this.rest, mriOrEmailArray, options)
  }

  private async fetchCurrentUser(): Promise<TeamsExport> {
    return fetchCurrentUser(this.rest)
  }

  private async fetchPinnedChannels(): Promise<PinnedChannelsResponse> {
    return fetchPinnedChannels(this.rest)
  }
}
