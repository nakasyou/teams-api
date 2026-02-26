export type CommandName =
  | 'notifications'
  | 'messages'
  | 'channel'
  | 'channel-messages'
  | 'me'
  | 'list'
  | 'teams'
  | 'channels'
  | 'set-refresh-token'
  | 'help'

export type ParsedArgs = {
  command: CommandName
  hasCommand: boolean
  commandArgs: string[]
  profileName: string
  profileJsonPath: string | undefined
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
}
