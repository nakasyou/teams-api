import { access } from 'node:fs/promises'
import { parse as parsePath, resolve as resolvePath } from 'node:path'
import { TeamsClient } from '../client'
import type { CliCommandResult, ParsedArgs, RenderContext } from './types'
import { parseLimitArgs, parseMessageFilesArgs } from './args'
import { withSpinner } from './output'
import type { Channel, DriveItem, MessageFileAttachment, Team, TeamsExport } from '../types'
import { executeContentCommand, safeJoin, safeLabel, saveResponse } from './content'
import { attachmentReference, parseMessageFiles, redactDriveItem } from '../rest/routes/attachments'
import { summarizeAttachmentError } from '../rest/routes/files'

export async function executeCommand(
  args: ParsedArgs,
  client: TeamsClient,
  context: RenderContext,
): Promise<CliCommandResult> {
  const animationContext = context

  switch (args.command) {
    case 'files':
    case 'notebooks':
    case 'class-notebook':
      return executeContentCommand(args, client)
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
      const [subCommand, ...subCommandArgs] = args.commandArgs
      if (subCommand === 'files') {
        return executeMessageFiles('messages', subCommandArgs, client, animationContext)
      }
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
      if (subCommand === 'files') {
        return executeMessageFiles('channel', subCommandArgs, client, animationContext)
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
            const [teamId] = teamIds
            if (!teamId) {
              throw new Error(`Channel not found: ${channelId}`)
            }
            return client.teams.channels.fetchMessages(teamId, channelId, {
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
    case 'mcp':
      throw new Error('mcp starts a server and cannot execute as an API command')
    case 'login':
      throw new Error('login is a profile-only command')
    case 'list':
    case 'channels':
    case 'channel-messages':
    case 'messages-files':
    case 'channel-files':
      throw new Error(`Unexpected top-level command: ${args.command}`)
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

type MessageFileRow = {
  messageId: string
  index: number
  name: string
  type?: string
  host?: string
  driveId?: string
  itemId?: string
  size?: number
  blocksDownload?: boolean
  item?: DriveItem
  download?: { path: string; bytes: number }
  error?: string
}

type MessageWithFiles = {
  id?: string | null
  properties?: { files?: unknown } | null
}

async function executeMessageFiles(
  kind: 'messages' | 'channel',
  filesArgs: string[],
  client: TeamsClient,
  context: RenderContext,
): Promise<CliCommandResult> {
  const command: 'messages-files' | 'channel-files' =
    kind === 'messages' ? 'messages-files' : 'channel-files'
  if (filesArgs.includes('--help') || filesArgs.includes('-h')) {
    return { command: 'help', data: command }
  }

  const commandLabel = kind === 'messages' ? 'messages files' : 'channel files'
  const parsed = parseMessageFilesArgs(filesArgs, commandLabel)
  const [targetId, ...extra] = parsed.rest
  if (!targetId) {
    throw new Error(
      `Usage: teams ${commandLabel} <${kind === 'messages' ? 'conversationId' : 'channelId'}> [--message <messageId>] [--limit N] [--no-resolve] [--download <directory>]`,
    )
  }
  if (extra.length > 0) {
    throw new Error(`teams ${commandLabel} accepts one ID argument`)
  }

  const directory = parsed.download ? resolvePath(parsed.download) : undefined
  return withSpinner(
    context,
    directory ? 'Fetching and downloading attached files...' : 'Fetching attached files...',
    async () => {
      const messages: MessageWithFiles[] =
        kind === 'messages'
          ? (await client.teams.conversations.fetchMessages(targetId, { pageSize: parsed.limit }))
              .messages
          : await fetchChannelFileMessages(client, targetId, parsed.limit)

      const rows: MessageFileRow[] = []
      for (const message of messages) {
        const messageId = typeof message.id === 'string' ? message.id : ''
        if (parsed.messageId !== undefined && messageId !== parsed.messageId) continue
        for (const [index, attachment] of parseMessageFiles(message.properties).entries()) {
          const row: MessageFileRow = {
            messageId,
            index,
            name: attachment.fileName,
            type: attachment.fileType ?? attachment.type,
            host: attachmentHost(attachment),
          }
          let resolved = false
          if (parsed.resolve) {
            try {
              const item = await client.teams.files.resolveAttachment(attachment)
              row.driveId = item.parentReference?.driveId
              row.itemId = item.id
              row.size = item.size
              row.blocksDownload = item.currentUserRole?.blocksDownload
              row.item = redactDriveItem(item)
              resolved = true
            } catch (error) {
              row.error = summarizeAttachmentError(error)
            }
          }
          if (directory && (!parsed.resolve || resolved)) {
            try {
              const path = await uniqueDownloadPath(directory, attachment.fileName)
              row.download = await saveResponse(
                await client.teams.files.downloadAttachment(attachment),
                path,
              )
            } catch (error) {
              const message = summarizeAttachmentError(error)
              row.error = row.error ? `${row.error}; ${message}` : message
            }
          }
          rows.push(row)
        }
      }
      return { command, data: rows }
    },
  )
}

async function uniqueDownloadPath(directory: string, fileName: string): Promise<string> {
  const label = safeLabel(fileName)
  const { name, ext } = parsePath(label)
  let candidate = safeJoin(directory, label)
  let suffix = 0
  while (await fileExists(candidate)) {
    suffix += 1
    candidate = safeJoin(directory, `${name} (${suffix})${ext}`)
  }
  return candidate
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === 'ENOENT'
    ) {
      return false
    }
    throw error
  }
}

async function fetchChannelFileMessages(
  client: TeamsClient,
  channelId: string,
  limit: number,
): Promise<MessageWithFiles[]> {
  const me = await client.teams.users.me.fetch()
  const teamIds = resolveTeamIdFromMe(me, channelId)
  if (teamIds.length === 0) throw new Error(`Channel not found: ${channelId}`)
  if (teamIds.length > 1)
    throw new Error(`Ambiguous channel: ${channelId} exists in multiple teams`)
  const [teamId] = teamIds
  if (!teamId) throw new Error(`Channel not found: ${channelId}`)
  return client.teams.channels.fetchMessages(teamId, channelId, { pageSize: limit })
}

function attachmentHost(attachment: MessageFileAttachment): string | undefined {
  const reference = attachmentReference(attachment)
  if (!reference || 'driveId' in reference) return undefined
  try {
    return new URL('url' in reference ? reference.url : reference.siteUrl).hostname
  } catch {
    return undefined
  }
}
