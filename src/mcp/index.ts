#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { startTeamsMcpServer } from './start'

try {
  const { values } = parseArgs({
    options: {
      help: { type: 'boolean', short: 'h' },
      profile: { type: 'string' },
      'profile-json': { type: 'string' },
    },
  })
  if (values.help) {
    console.log(
      'Usage: teams-mcp [--profile <name>] [--profile-json <path>]\nStart a stdio MCP server with one teams tool that runs CLI subcommands.',
    )
  } else {
    const baseArgs: string[] = []
    if (values.profile) baseArgs.push('--profile', values.profile)
    if (values['profile-json']) baseArgs.push('--profile-json', values['profile-json'])
    const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'mjs'
    const cliPath = fileURLToPath(new URL(`../cli/index.${extension}`, import.meta.url))
    await startTeamsMcpServer(cliPath, baseArgs)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
}
