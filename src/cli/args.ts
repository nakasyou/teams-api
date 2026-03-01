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
  return parsed
}

function parseCommand(input: string): CommandName {
  if (
    input === 'notifications' ||
    input === 'messages' ||
    input === 'channel' ||
    input === 'me' ||
    input === 'teams' ||
    input === 'login' ||
    input === 'help'
  ) {
    return input
  }
  throw new Error(`Unknown command: ${input}`)
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
