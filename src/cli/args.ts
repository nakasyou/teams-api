import { parseArgs as parseNodeArgs } from 'node:util'
import type { CommandName, ParsedArgs } from './types'
import { DEFAULT_MESSAGE_LIMIT, DEFAULT_PROFILE_NAME } from './constants'

export type LimitOptions = {
  limit: number
  rest: string[]
}

const GLOBAL_OPTION_CONFIG = {
  help: { type: 'boolean', short: 'h' },
  json: { type: 'boolean' },
  'no-color': { type: 'boolean' },
  profile: { type: 'string' },
  'profile-json': { type: 'string' },
  'refresh-token': { type: 'string' },
  'ests-auth-persistent': { type: 'string' },
  'ests-auth': { type: 'string' },
} as const

const LIMIT_OPTION_CONFIG = {
  limit: { type: 'string' },
} as const

export function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    command: 'notifications',
    hasCommand: false,
    commandArgs: [],
    profileName: DEFAULT_PROFILE_NAME,
    profileJsonPath: undefined,
    estsAuthPersistent: undefined,
    estsAuth: undefined,
    refreshToken: undefined,
    jsonOutput: false,
    noColor: false,
    showHelp: false,
  }

  const tokenized = parseNodeArgs({
    args: argv,
    options: GLOBAL_OPTION_CONFIG,
    allowPositionals: true,
    strict: false,
    tokens: true,
  })

  let commandIndex = -1
  for (const token of tokenized.tokens) {
    if (token.kind === 'positional') {
      commandIndex = token.index
      break
    }

    if (token.kind === 'option-terminator') {
      throw new Error(`Unknown option: ${rawToken(argv, token.index, '--')}`)
    }

    const input = rawToken(argv, token.index, token.rawName)
    if (token.name === 'help') {
      parsed.showHelp = true
      continue
    }
    if (token.name === 'json') {
      parsed.jsonOutput = true
      continue
    }
    if (token.name === 'no-color') {
      parsed.noColor = true
      continue
    }
    if (token.name === 'profile') {
      if (typeof token.value !== 'string' || token.value.length === 0) {
        throw new Error('Missing --profile value')
      }
      parsed.profileName = token.value
      continue
    }
    if (token.name === 'profile-json') {
      if (typeof token.value !== 'string' || token.value.length === 0) {
        throw new Error('Missing --profile-json path')
      }
      parsed.profileJsonPath = token.value
      continue
    }
    if (token.name === 'refresh-token') {
      if (typeof token.value !== 'string' || token.value.length === 0) {
        throw new Error('Missing --refresh-token value')
      }
      parsed.refreshToken = token.value
      continue
    }
    if (token.name === 'ests-auth-persistent') {
      if (typeof token.value !== 'string' || token.value.length === 0) {
        throw new Error('Missing --ests-auth-persistent value')
      }
      parsed.estsAuthPersistent = token.value
      continue
    }
    if (token.name === 'ests-auth') {
      if (typeof token.value !== 'string' || token.value.length === 0) {
        throw new Error('Missing --ests-auth value')
      }
      parsed.estsAuth = token.value
      continue
    }

    throw new Error(`Unknown option: ${input}`)
  }

  const commandArg = commandIndex >= 0 ? argv[commandIndex] : undefined
  if (!commandArg) {
    parsed.hasCommand = false
    parsed.commandArgs = []
    return parsed
  }

  if (commandArg.startsWith('-')) {
    throw new Error(`Unknown command or option: ${commandArg}`)
  }

  parsed.command = parseCommand(commandArg)
  parsed.hasCommand = true
  parsed.commandArgs = argv.slice(commandIndex + 1)
  if (parsed.command === 'login') {
    const { values } = parseNodeArgs({
      args: parsed.commandArgs,
      options: {
        'tenant-id': { type: 'string' },
        'ests-auth-persistent': { type: 'string' },
        'ests-auth': { type: 'string' },
        'refresh-token': { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    if (values['tenant-id'] !== undefined) {
      if (!values['tenant-id'].trim()) throw new Error('Missing --tenant-id value')
      parsed.tenantId = values['tenant-id']
    }
    parsed.estsAuthPersistent = values['ests-auth-persistent'] ?? parsed.estsAuthPersistent
    parsed.estsAuth = values['ests-auth'] ?? parsed.estsAuth
    parsed.refreshToken = values['refresh-token'] ?? parsed.refreshToken
    parsed.showHelp = values.help ?? parsed.showHelp
    parsed.commandArgs = []
  }
  return parsed
}

function parseCommand(input: string): CommandName {
  if (
    input === 'notifications' ||
    input === 'mcp' ||
    input === 'files' ||
    input === 'notebooks' ||
    input === 'class-notebook' ||
    input === 'messages' ||
    input === 'channel' ||
    input === 'send' ||
    input === 'post' ||
    input === 'reply' ||
    input === 'dm' ||
    input === 'me' ||
    input === 'teams' ||
    input === 'login' ||
    input === 'help'
  ) {
    return input
  }
  throw new Error(`Unknown command: ${input}`)
}

export type MessageFilesOptions = {
  limit: number
  messageId?: string
  resolve: boolean
  download?: string
  rest: string[]
}

const MESSAGE_FILES_OPTION_CONFIG = {
  limit: { type: 'string' },
  message: { type: 'string' },
  'no-resolve': { type: 'boolean' },
  download: { type: 'string' },
} as const

export function parseMessageFilesArgs(args: string[], command: string): MessageFilesOptions {
  const tokenized = parseNodeArgs({
    args,
    options: MESSAGE_FILES_OPTION_CONFIG,
    allowPositionals: true,
    strict: false,
    tokens: true,
  })

  const rest: string[] = []
  let limit = DEFAULT_MESSAGE_LIMIT
  let messageId: string | undefined
  let resolve = true
  let download: string | undefined

  for (const token of tokenized.tokens) {
    if (token.kind === 'positional') {
      rest.push(token.value)
      continue
    }
    if (token.kind === 'option-terminator') {
      throw new Error(`Unknown option: ${rawToken(args, token.index, '--')}`)
    }

    if (token.name === 'limit') {
      const value = stringOption(token.value, token.inlineValue, '--limit', command)
      const parsed = Number.parseInt(value, 10)
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`--limit requires a positive integer for command: teams ${command}`)
      }
      limit = parsed
      continue
    }
    if (token.name === 'message') {
      messageId = stringOption(token.value, token.inlineValue, '--message', command)
      continue
    }
    if (token.name === 'no-resolve') {
      resolve = false
      continue
    }
    if (token.name === 'download') {
      download = stringOption(token.value, token.inlineValue, '--download', command)
      continue
    }

    throw new Error(`Unknown option: ${rawToken(args, token.index, token.rawName)}`)
  }

  return { limit, messageId, resolve, download, rest }
}

function stringOption(
  value: string | boolean | undefined,
  inlineValue: boolean | undefined,
  option: string,
  command: string,
): string {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    (inlineValue === false && value.startsWith('--'))
  ) {
    throw new Error(`${option} requires a value for command: teams ${command}`)
  }
  return value
}

export function parseLimitArgs(args: string[], command: string): LimitOptions {
  const tokenized = parseNodeArgs({
    args,
    options: LIMIT_OPTION_CONFIG,
    allowPositionals: true,
    strict: false,
    tokens: true,
  })

  const rest: string[] = []
  let limit = DEFAULT_MESSAGE_LIMIT

  for (const token of tokenized.tokens) {
    if (token.kind === 'positional') {
      rest.push(token.value)
      continue
    }

    if (token.kind === 'option-terminator') {
      throw new Error(`Unknown option: ${rawToken(args, token.index, '--')}`)
    }

    if (token.name === 'limit') {
      const value = token.value
      if (
        typeof value !== 'string' ||
        value.length === 0 ||
        (token.inlineValue === false && value.startsWith('--'))
      ) {
        throw new Error(`--limit requires a number for command: teams ${command}`)
      }
      const parsed = Number.parseInt(value, 10)
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`--limit requires a positive integer for command: teams ${command}`)
      }
      limit = parsed
      continue
    }

    throw new Error(`Unknown option: ${rawToken(args, token.index, token.rawName)}`)
  }

  return { limit, rest }
}

function rawToken(argv: string[], index: number, fallback: string): string {
  return argv[index] ?? fallback
}
