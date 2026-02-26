import type {
  FetchShortProfileResponse,
  PinnedChannelsResponse,
  ShortProfileUser,
  TeamsExport,
} from '../../types'
import { SCOPES } from '../constants'
import type { RestClient } from '../RestClient'

export type FetchShortProfileOptions = {
  isMailAddress?: boolean
  skypeTeamsInfo?: boolean
  canBeSmtpAddress?: boolean
  includeIBBarredUsers?: boolean
  includeDisabledAccounts?: boolean
}

export const fetchShortProfile = async (
  rest: RestClient,
  mriOrEmailArray: string[],
  options?: FetchShortProfileOptions,
): Promise<ShortProfileUser[]> => {
  const {
    isMailAddress = false,
    skypeTeamsInfo = true,
    canBeSmtpAddress = false,
    includeIBBarredUsers = true,
    includeDisabledAccounts = true,
  } = options ?? {}

  const query = new URLSearchParams({
    isMailAddress: `${isMailAddress}`,
    enableGuest: 'true',
    skypeTeamsInfo: `${skypeTeamsInfo}`,
    canBeSmtpAddress: `${canBeSmtpAddress}`,
    includeIBBarredUsers: `${includeIBBarredUsers}`,
    includeDisabledAccounts: `${includeDisabledAccounts}`,
  })

  const result = await rest.request<FetchShortProfileResponse>(
    'https://teams.cloud.microsoft/api/mt/apac/beta/users/fetchShortProfile',
    {
      scope: SCOPES.users,
      method: 'POST',
      query,
      headers: {
        'content-type': 'application/json;charset=UTF-8',
      },
      body: JSON.stringify(mriOrEmailArray),
    },
  )

  return result.value
}

export const fetchCurrentUser = async (rest: RestClient): Promise<TeamsExport> => {
  return rest.request<TeamsExport>(
    'https://teams.cloud.microsoft/api/csa/apac/api/v3/teams/users/me',
    {
      scope: SCOPES.channels,
      query: {
        isPrefetch: false,
        enableMembershipSummary: true,
        supportsAdditionalSystemGeneratedFolders: true,
        supportsSliceItems: true,
        enableEngageCommunities: false,
      },
    },
  )
}

export const fetchPinnedChannels = async (rest: RestClient): Promise<PinnedChannelsResponse> => {
  return rest.request<PinnedChannelsResponse>(
    'https://teams.cloud.microsoft/api/csa/apac/api/v1/teams/users/me/pinnedChannels',
    {
      scope: SCOPES.channels,
    },
  )
}
