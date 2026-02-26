import { TeamsClient } from '../client'
import type { CliCommandResult, ParsedArgs, RenderContext } from './types'
import { parseLimitArgs } from './args'
import { withSpinner } from './output'
import type { Channel, Team, TeamsExport } from '../types'

export async function executeCommand(
  args: ParsedArgs,
  client: TeamsClient,
  context: RenderContext,
): Promise<CliCommandResult> {
  const animationContext = context

  switch (args.command) {
    case 'notifications': {
      if (args.commandArgs.includes('--help') || args.commandArgs.includes('-h')) {
        return {
          command: 'help',
          data: 'notifications',
        }
      }
      const parsed = parseLimitArgs(args.commandArgs, 'notifications')
      if (parsed.rest.length > 0) {
        throw new Error(
          'notifications accepts only --limit option; no positional arguments are supported',
        )
      }
      const payload = await withSpinner(animationContext, 'Fetching notifications...', () =>
        client.teams.notifications.fetchMessages({ pageSize: parsed.limit }),
      )
      return { command: 'notifications', data: payload }
    }
    case 'messages': {
      if (args.commandArgs.includes('--help') || args.commandArgs.includes('-h')) {
        return {
          command: 'help',
          data: 'messages',
        }
      }
      const parsed = parseLimitArgs(args.commandArgs, 'messages')
      const [conversationId] = parsed.rest
      if (!conversationId) {
        throw new Error('Usage: teams messages <conversationId> [--limit <n>]')
      }
      const payload = await withSpinner(
        animationContext,
        `Fetching conversation ${conversationId}...`,
        () =>
          client.teams.conversations.fetchMessages(conversationId, {
            pageSize: parsed.limit,
          }),
      )
      return { command: 'messages', data: payload }
    }
    case 'channel': {
      const [subCommand, ...subCommandArgs] = args.commandArgs
      if (!subCommand || subCommand === '--help' || subCommand === '-h') {
        return {
          command: 'help',
          data: 'channel',
        }
      }
      if (subCommand === 'messages') {
        if (subCommandArgs.includes('--help') || subCommandArgs.includes('-h')) {
          return {
            command: 'help',
            data: 'channel',
          }
        }
        const parsed = parseLimitArgs(subCommandArgs, 'channel messages')
        const [channelId] = parsed.rest
        if (!channelId) {
          throw new Error('Usage: teams channel messages <channelId> [--limit <n>]')
        }
        const payload = await withSpinner(
          animationContext,
          `Fetching messages for channel=${channelId}...`,
          async () => {
            const me = await client.teams.users.me.fetch()
            const teamIds = resolveTeamIdFromMe(me, channelId)
            if (teamIds.length === 0) {
              throw new Error(`Channel not found: ${channelId}`)
            }
            if (teamIds.length > 1) {
              throw new Error(`Ambiguous channel: ${channelId} exists in multiple teams`)
            }
            return client.teams.channels.fetchMessages(teamIds[0], channelId, {
              pageSize: parsed.limit,
            })
          },
        )
        return { command: 'channel-messages', data: payload }
      }
      throw new Error(`Unknown channel subcommand: ${subCommand}`)
    }
    case 'me': {
      if (args.commandArgs.includes('--help') || args.commandArgs.includes('-h')) {
        return {
          command: 'help',
          data: 'me',
        }
      }
      if (args.commandArgs.length > 0) {
        throw new Error('me does not accept positional arguments')
      }
      const payload = await withSpinner(animationContext, 'Fetching current user...', () =>
        client.teams.users.me.fetch(),
      )
      return { command: 'me', data: payload }
    }
    case 'teams': {
      const [subCommand, ...subArgs] = args.commandArgs
      if (subCommand === '--help' || subCommand === '-h') {
        return {
          command: 'help',
          data: 'teams',
        }
      }
      if (!subCommand) {
        return {
          command: 'help',
          data: 'teams',
        }
      }
      if (subCommand === 'list') {
        if (subArgs.includes('--help') || subArgs.includes('-h')) {
          return {
            command: 'help',
            data: 'list',
          }
        }
        if (subArgs.length > 0) {
          throw new Error('teams teams list does not accept positional arguments')
        }
        const payload = await withSpinner(animationContext, 'Fetching teams list...', () =>
          client.teams.users.me.fetch(),
        )
        return { command: 'list', data: payload.teams as Team[] }
      }
      if (subCommand === 'channels') {
        if (subArgs.includes('--help') || subArgs.includes('-h')) {
          return {
            command: 'help',
            data: 'channels',
          }
        }
        const [teamId] = subArgs
        if (!teamId) {
          throw new Error('Usage: teams teams channels <teamId>')
        }
        if (subArgs.length > 1) {
          throw new Error('teams teams channels does not accept positional arguments')
        }
        const payload = await withSpinner(animationContext, 'Fetching team channels...', () =>
          client.teams.users.me.fetch(),
        )
        const teams = Array.isArray(payload.teams) ? payload.teams : []
        const target = teams.find((team) => team.id === teamId)
        if (!target) {
          throw new Error(`Team not found: ${teamId}`)
        }
        const channels = Array.isArray(target.channels) ? target.channels : []
        return {
          command: 'channels',
          data: {
            teamId,
            teamName: target.displayName ?? 'Unknown team',
            channels: channels as Channel[],
          },
        }
      }
      throw new Error(`Unknown teams subcommand: ${subCommand}`)
    }
    case 'set-refresh-token':
      throw new Error('set-refresh-token is a profile-only command')
    case 'help':
      return { command: 'help', data: undefined }
  }
}

function resolveTeamIdFromMe(me: TeamsExport, channelId: string): string[] {
  const teams = Array.isArray(me?.teams) ? me.teams : []
  const teamIds: string[] = []

  for (const team of teams) {
    const channels = Array.isArray(team?.channels) ? team.channels : []
    const hasChannel = channels.some((channel) => channel?.id === channelId)
    if (hasChannel && typeof team?.id === 'string') {
      teamIds.push(team.id)
    }
  }

  return teamIds
}
