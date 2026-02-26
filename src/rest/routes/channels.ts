import type { ChannelPostMessage, ChannelPostsResponse } from '../../types'
import { SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

export type ChannelQueryOptions = {
  pageSize?: number
}

export const fetchChannel = async (
  rest: RestClient,
  teamId: string,
  channelId: string,
  options?: ChannelQueryOptions,
): Promise<ChannelPostsResponse> => {
  const pageSize = options?.pageSize ?? 20

  return rest.request<ChannelPostsResponse>(
    `https://teams.cloud.microsoft/api/csa/apac/api/v1/teams/${encodeURIComponent(teamId)}/channels/${encodeURIComponent(channelId)}`,
    {
      scope: SCOPES.channels,
      query: {
        pageSize,
      },
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
