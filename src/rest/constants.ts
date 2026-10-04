export const TEAMS_WORKER_REFERRER =
  'https://teams.cloud.microsoft/v2/worker/precompiled-web-worker-8e61d59c0abedf86.js'

export const SCOPES = {
  graph: 'https://graph.microsoft.com/.default openid profile offline_access',
  notes: 'https://www.onenote.com/.default openid profile offline_access',
  chats: 'https://ic3.teams.office.com/.default openid profile offline_access',
  channels: 'https://chatsvcagg.teams.microsoft.com/.default openid profile offline_access',
  users: 'https://api.spaces.skype.com/.default openid profile offline_access',
} as const
