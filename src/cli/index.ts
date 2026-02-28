#!/usr/bin/env node
import { TeamsClient } from '../client'
import { TokenManager } from '../auth/TokenManager'
import { loginFromEstsAuthPersistent } from '../auth/estsAuth'
import { createContext, printError, printHelp, printResult } from './output'
import { parseArgs } from './args'
import { executeCommand } from './commands'
import {
  resolveProfile,
  resolveProfilePath,
  resolveRefreshTokenForStore,
  saveProfile,
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

  if (args.command === 'login') {
    try {
      const profilePath = resolveProfilePath(args)
      const tokenState = await resolveRefreshTokenForStore(args)
      await saveProfile(profilePath, tokenState)
      printResult(
        context,
        {
          command: 'login',
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
    const { token, profilePath, profileLabel, refreshTokenExpiresIn, ESTSAUTHPERSISTENT } =
      await resolveProfile(args)
    const tokenManager = new TokenManager(
      token,
      refreshTokenExpiresIn,
      ESTSAUTHPERSISTENT
        ? async () => {
            const tokenRes = await loginFromEstsAuthPersistent(ESTSAUTHPERSISTENT)
            return {
              refresh_token: tokenRes.refresh_token,
              refresh_token_expires_in: tokenRes.refresh_token_expires_in,
            }
          }
        : undefined,
    )
    const client = new TeamsClient(tokenManager)
    const result = await executeCommand(args, client, context)
    if (result.command === 'help' && typeof result.data === 'string') {
      printHelp(context, result.data)
      return
    }
    const profileState = {
      refreshToken: tokenManager.getRefreshToken(),
      refreshTokenExpiresIn: tokenManager.getRefreshTokenExpiresIn(),
      ESTSAUTHPERSISTENT,
    }
    await saveProfile(profilePath, profileState)
    printResult(context, result, profileLabel)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    printError(context, message)
  }
}
