export { TokenManager } from './auth/TokenManager'
export type { ScopeTokenProvider } from './auth/TokenManager'
export {
  TeamsClient,
  type ChannelQueryOptions,
  type FetchShortProfileOptions,
  type TeamsChannelsAPI,
  type TeamsChatsAPI,
  type TeamsClientTeamsAPI,
  type TeamsConversationsAPI,
  type TeamsNotificationsAPI,
  type TeamsUsersAPI,
  type TeamsUsersMeAPI,
} from './client'
export * from './types'
export { TeamsFilesAPI } from './rest/routes/files'
export {
  parseMessageFiles,
  attachmentReference,
  attachmentReferences,
  redactDriveItem,
} from './rest/routes/attachments'
export { TeamsNotebooksAPI, TeamsClassNotebooksAPI } from './rest/routes/notebooks'

export { DEFAULT_TENANT_ID, resolveTenantId } from './auth/tenant'
