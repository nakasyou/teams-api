import type { CommandName, ParsedArgs } from './types'
import { DEFAULT_MESSAGE_LIMIT, DEFAULT_PROFILE_NAME } from './constants'

export type LimitOptions = {
  limit: number
  rest: string[]
}

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

  let index = 0
  while (index < argv.length) {
    const token = argv[index]
    if (!token.startsWith('-')) {
      break
    }

    if (token === '--help' || token === '-h') {
      parsed.showHelp = true
      index += 1
      continue
    }

    if (token === '--json') {
      parsed.jsonOutput = true
      index += 1
      continue
    }

    if (token === '--no-color') {
      parsed.noColor = true
      index += 1
      continue
    }

    if (token === '--profile' || token.startsWith('--profile=')) {
      const value = token === '--profile' ? argv[index + 1] : token.slice('--profile='.length)
      if (!value) {
        throw new Error('Missing --profile value')
      }
      parsed.profileName = value
      index += token === '--profile' ? 2 : 1
      continue
    }

    if (token === '--profile-json' || token.startsWith('--profile-json=')) {
      const value =
        token === '--profile-json' ? argv[index + 1] : token.slice('--profile-json='.length)
      if (!value) {
        throw new Error('Missing --profile-json path')
      }
      parsed.profileJsonPath = value
      index += token === '--profile-json' ? 2 : 1
      continue
    }

    if (token === '--refresh-token' || token.startsWith('--refresh-token=')) {
      const value =
        token === '--refresh-token' ? argv[index + 1] : token.slice('--refresh-token='.length)
      if (!value) {
        throw new Error('Missing --refresh-token value')
      }
      parsed.refreshToken = value
      index += token === '--refresh-token' ? 2 : 1
      continue
    }

    if (token === '--ests-auth-persistent' || token.startsWith('--ests-auth-persistent=')) {
      const value =
        token === '--ests-auth-persistent'
          ? argv[index + 1]
          : token.slice('--ests-auth-persistent='.length)
      if (!value) {
        throw new Error('Missing --ests-auth-persistent value')
      }
      parsed.estsAuthPersistent = value
      index += token === '--ests-auth-persistent' ? 2 : 1
      continue
    }

    throw new Error(`Unknown option: ${token}`)
  }

  const commandArg = argv[index]
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
  parsed.commandArgs = argv.slice(index + 1)
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
  const rest: string[] = []
  let limit = DEFAULT_MESSAGE_LIMIT

  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    if (token === '--limit') {
      const value = args[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error(`--limit requires a number for command: teams ${command}`)
      }
      const parsed = Number.parseInt(value, 10)
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`--limit requires a positive integer for command: teams ${command}`)
      }
      limit = parsed
      index += 1
      continue
    }
    if (token.startsWith('--limit=')) {
      const value = token.slice('--limit='.length)
      const parsed = Number.parseInt(value, 10)
      if (Number.isNaN(parsed) || parsed <= 0) {
        throw new Error(`--limit requires a positive integer for command: teams ${command}`)
      }
      limit = parsed
      continue
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown option: ${token}`)
    }
    rest.push(token)
  }

  return { limit, rest }
}
