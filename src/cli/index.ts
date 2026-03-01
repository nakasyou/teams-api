#!/usr/bin/env node
import { TeamsClient } from '../client'
import { TokenManager } from '../auth/TokenManager'
import { loginFromEstsAuthPersistent } from '../auth/estsAuth'
import { createContext, printError, printHelp, printResult } from './output'
import { parseArgs } from './args'
import { executeCommand } from './commands'
import { promptEstsAuthPersistentToken } from './prompt'
import type { ParsedArgs, RenderContext } from './types'
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
      const loginArgs = await withPromptedLoginToken(args, context)
      const profilePath = resolveProfilePath(loginArgs)
      const tokenState = await resolveRefreshTokenForStore(loginArgs)
      await saveProfile(profilePath, tokenState)
      printResult(
        context,
        {
          command: 'login',
          data: {
            profile: getProfileLabel(loginArgs),
            profilePath,
          },
        },
        getProfileLabel(loginArgs),
      )
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      printError(context, message)
      return
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

async function withPromptedLoginToken(
  args: ParsedArgs,
  context: RenderContext,
): Promise<ParsedArgs> {
  if (args.command !== 'login' || args.commandArgs.length > 0) {
    return args
  }

  if (
    hasToken(args.estsAuthPersistent) ||
    hasToken(args.refreshToken) ||
    hasToken(process.env.ESTSAUTHPERSISTENT) ||
    hasToken(process.env.REFRESH_TOKEN)
  ) {
    return args
  }

  const canPrompt =
    process.stdin.isTTY === true && process.stdout.isTTY === true && context.machine === false
  if (!canPrompt) {
    return args
  }

  const estsAuthPersistent = await promptEstsAuthPersistentToken()
  return {
    ...args,
    estsAuthPersistent,
  }
}

function hasToken(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0
}
