export type CommandName =
  | 'notifications'
  | 'messages'
  | 'channel'
  | 'channel-messages'
  | 'me'
  | 'list'
  | 'teams'
  | 'channels'
  | 'login'
  | 'help'

export type ParsedArgs = {
  command: CommandName
  hasCommand: boolean
  commandArgs: string[]
  profileName: string
  profileJsonPath: string | undefined
  estsAuthPersistent: string | undefined
  refreshToken: string | undefined
  jsonOutput: boolean
  noColor: boolean
  showHelp: boolean
}

export type RenderContext = {
  machine: boolean
  color: boolean
}

export type CliCommandResult = {
  command: CommandName
  data: unknown
}

export type ResolvedProfile = {
  token: string
  profilePath: string
  profileLabel: string
  refreshToken?: string
  refreshTokenExpiresIn?: number
  refreshTokenUpdatedAt?: number
  ESTSAUTHPERSISTENT?: string
}
