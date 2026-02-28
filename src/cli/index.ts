#!/usr/bin/env node
import { TeamsClient } from '../client'
import { TokenManager } from '../auth/TokenManager'
import { createContext, printError, printHelp, printResult } from './output'
import { parseArgs } from './args'
import { executeCommand } from './commands'
import {
  resolveProfile,
  resolveProfilePath,
  resolveRefreshTokenForStore,
  saveRefreshToken,
  getProfileLabel,
} from './profile'


await runCli(process.argv.slice(2))

async function runCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv)
  const context = createContext({
    jsonOutput: args.jsonOutput,
    noColor: args.noColor,
  })

  if (args.showHelp || args.command === 'help') {
    printHelp(context)
    return
  }

  if (!args.hasCommand) {
    printHelp(context)
    process.exitCode = 1
    return
  }

  if (args.command === 'set-refresh-token') {
    try {
      const profilePath = resolveProfilePath(args)
      const token = resolveRefreshTokenForStore(args)
      await saveRefreshToken(profilePath, token)
      printResult(
        context,
        {
          command: 'set-refresh-token',
          data: {
            profile: getProfileLabel(args),
            profilePath,
          },
        },
        getProfileLabel(args),
      )
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      printError(context, message)
    }
  }

  try {
    const { token, profilePath, profileLabel } = await resolveProfile(args)
    const tokenManager = new TokenManager(token)
    const client = new TeamsClient(tokenManager)
    const result = await executeCommand(args, client, context)
    if (result.command === 'help' && typeof result.data === 'string') {
      printHelp(context, result.data)
      return
    }
    await saveRefreshToken(profilePath, tokenManager.getRefreshToken())
    printResult(context, result, profileLabel)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    printError(context, message)
  }
}
