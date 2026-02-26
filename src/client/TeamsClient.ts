import type { ScopeTokenProvider } from '../auth/TokenManager'
import { RestClient } from '../rest'
import {
  fetchChannel,
  fetchChannelMessages,
  type ChannelQueryOptions,
} from '../rest/routes/channels'
import { fetchConversationMessages } from '../rest/routes/conversations'
import {
  fetchCurrentUser,
  fetchPinnedChannels,
  fetchShortProfile,
  type FetchShortProfileOptions,
} from '../rest/routes/users'
import type {
  ChannelPostMessage,
  ChannelPostsResponse,
  ConversationMessagesOptions,
  ConversationMessagesResponse,
  PinnedChannelsResponse,
  ShortProfileUser,
  TeamsExport,
} from '../types'

export type { ChannelQueryOptions, FetchShortProfileOptions }

export interface TeamsConversationsAPI {
  fetchMessages(
    conversationId: string,
    options?: ConversationMessagesOptions,
  ): Promise<ConversationMessagesResponse>
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
  conversations: TeamsConversationsAPI
  notifications: TeamsNotificationsAPI
  channels: TeamsChannelsAPI
  users: TeamsUsersAPI
}

export class TeamsClient {
  readonly rest: RestClient
  readonly teams: TeamsClientTeamsAPI

  constructor(tokenProvider: ScopeTokenProvider) {
    this.rest = new RestClient(tokenProvider)

    this.teams = {
      conversations: {
        fetchMessages: (conversationId, options) =>
          this.fetchConversationMessages(conversationId, options),
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
