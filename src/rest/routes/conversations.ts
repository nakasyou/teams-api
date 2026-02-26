import type { ConversationMessagesOptions, ConversationMessagesResponse } from '../../types'
import { SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

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

  const normalizedConversationId = encodeURIComponent(conversationId)
  return rest.request<ConversationMessagesResponse>(
    `https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/${normalizedConversationId}/messages`,
    {
      scope: SCOPES.chats,
      query,
    },
  )
}
