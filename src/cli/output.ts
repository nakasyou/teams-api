import type { CliCommandResult, RenderContext } from './types'
import { ANSI_CODES, SPINNER_FRAMES } from './constants'
import type { Channel, Team, TeamsExport } from '../types'

type Color = keyof typeof ANSI_CODES

export function createContext(options: { jsonOutput: boolean; noColor: boolean }): RenderContext {
  const interactive = process.stdout.isTTY === true && process.stderr.isTTY === true
  return {
    machine: options.jsonOutput || !interactive,
    color: interactive && !options.noColor && !options.jsonOutput,
  }
}

export async function withSpinner<T>(
  context: RenderContext,
  label: string,
  task: () => Promise<T>,
): Promise<T> {
  if (context.machine) {
    return task()
  }

  let frame = 0
  const timer = setInterval(() => {
    process.stdout.write(`\r${SPINNER_FRAMES[frame]} ${label}`)
    frame = (frame + 1) % SPINNER_FRAMES.length
  }, 80)

  try {
    const result = await task()
    clearInterval(timer)
    process.stdout.write(`\r${ANSI_CODES.green}✓${ANSI_CODES.reset} ${label}\n`)
    return result
  } catch (error) {
    clearInterval(timer)
    process.stdout.write(`\r${ANSI_CODES.red}x${ANSI_CODES.reset} ${label}\n`)
    throw error
  }
}

export function printHelp(context: RenderContext, command?: string, compact = false): void {
  const colorize = (color: Color, text: string) =>
    context.color ? `${ANSI_CODES[color]}${text}${ANSI_CODES.reset}` : text

  if (command === 'messages') {
    console.log('Usage:')
    console.log('  teams messages <conversationId> [--limit <n>]')
    console.log('  Fetch messages in a conversation')
    return
  }

  if (command === 'notifications') {
    console.log('Usage:')
    console.log('  teams notifications [--limit <n>]')
    console.log('  Fetch latest notifications')
    return
  }

  if (command === 'channel' || command === 'channel-messages') {
    console.log('Usage:')
    console.log('  teams channel messages <channelId> [--limit <n>]')
    console.log('  Fetch messages in a team channel using channel id')
    return
  }

  if (command === 'me') {
    console.log('Usage:')
    console.log('  teams me')
    console.log('  Show current user snapshot')
    return
  }

  if (command === 'login') {
    console.log('Usage:')
    console.log('  teams login --ests-auth-persistent=<token> [options] (recommended)')
    console.log('  teams login --refresh-token=<token> [options] (deprecated)')
    console.log('  Save refresh token to the selected profile')
    return
  }

  if (command === 'list') {
    console.log('Usage:')
    console.log('  teams list')
    console.log('  List all teams for the current user')
    return
  }

  if (command === 'teams') {
    console.log('Usage:')
    console.log('  teams list')
    console.log('  teams channels <teamId>')
    console.log('  Commands:')
    console.log('    list    List all teams for the current user')
    console.log('    channels <teamId>    List channels in a team')
    return
  }

  if (command === 'channels') {
    console.log('Usage:')
    console.log('  teams channels <teamId>')
    console.log('  List channels in the team')
    return
  }

  console.log(`${colorize('bold', 'teams cli')} - a small Teams helper for human + LLM workflows`)
  if (!compact) {
    console.log('Usage:')
    console.log('  teams [options] <command> [arguments]')
    console.log()
    console.log('Global options:')
    console.log('  --profile=<name>         Use ~/.teams-cli/<name>.json (default: default)')
    console.log('  --profile-json=<path>    Use custom profile json path')
    console.log('  --ests-auth-persistent=<token>  Preferred: generate token from session cookie')
    console.log('  --refresh-token=<token>          Deprecated: use --ests-auth-persistent instead')
    console.log(
      '  --json                   Output machine-readable JSON only (default in automation)',
    )
    console.log('  --no-color               Disable ANSI colors')
    console.log('  --help, -h               Show this help')
    console.log()
    console.log('Commands:')
    console.log('  notifications [--limit N]           Fetch latest notifications')
    console.log('  messages <conversationId> [--limit N]   Fetch conversation messages')
    console.log('  channel messages <channelId> [--limit N] Fetch channel messages')
    console.log('  teams list                          List all teams for the current user')
    console.log('  teams channels <teamId>             List channels in a team')
    console.log('  me                                  Fetch current user snapshot')
    console.log('  login --ests-auth-persistent=<token> Save session token to selected profile')
  }
}

export function printError(context: RenderContext, message: string): void {
  if (context.machine) {
    console.log(JSON.stringify({ error: message }))
  } else {
    const prefix = `${ANSI_CODES.red}${ANSI_CODES.bold}error${ANSI_CODES.reset}`
    console.log(`${context.color ? prefix : 'error'}: ${message}`)
    console.log()
    printHelp(context, undefined, true)
  }
  process.exitCode = 1
}

export function printResult(
  context: RenderContext,
  result: CliCommandResult,
  profile: string,
): void {
  if (context.machine) {
    console.log(
      JSON.stringify({
        command: result.command,
        profile,
        data: result.data,
      }),
    )
    return
  }

  if (result.command === 'help') {
    return
  }

  const colorize = (color: Color, text: string) =>
    context.color ? `${ANSI_CODES[color]}${text}${ANSI_CODES.reset}` : text

  if (result.command === 'login') {
    const payload = result.data as { profilePath: string; profile: string }
    console.log(colorize('bold', 'Session credentials stored'))
    console.log(`  profile: ${colorize('cyan', payload.profile)}`)
    console.log(`  file: ${colorize('dim', payload.profilePath)}`)
    return
  }

  if (result.command === 'me') {
    const me = result.data as TeamsExport
    const teams = Array.isArray(me?.teams) ? me.teams : []
    const chats = Array.isArray(me?.chats) ? me.chats : []
    const privateFeeds = Array.isArray(me?.privateFeeds) ? me.privateFeeds : []

    console.log(colorize('bold', 'Teams profile snapshot'))
    console.log(
      `  ${colorize('cyan', 'profile:')} ${colorize(
        'yellow',
        `${teams.length} teams`,
      )} / ${colorize(
        'yellow',
        `${chats.length} chats`,
      )} / ${colorize('yellow', `${privateFeeds.length} private feeds`)}`,
    )
    return
  }

  if (result.command === 'list') {
    const teams = Array.isArray(result.data) ? (result.data as Team[]) : []
    if (teams.length === 0) {
      console.log(colorize('dim', 'Teams: no items found'))
      return
    }

    console.log(colorize('bold', `Teams (${teams.length})`))
    for (const [index, team] of teams.entries()) {
      const name = typeof team?.displayName === 'string' ? team.displayName : 'Unknown team'
      const id = typeof team?.id === 'string' ? team.id : 'unknown'
      const line = `${String(index + 1).padStart(2, '0')}. ${colorize(
        'cyan',
        name,
      )} (${colorize('dim', id)})`
      console.log(`  ${line}`)
    }
    return
  }

  if (result.command === 'channels') {
    const payload = result.data as {
      teamId: string
      teamName: string
      channels: Channel[]
    }
    const channels = Array.isArray(payload?.channels) ? payload.channels : []
    const label = `Channels (${payload?.teamName ?? 'team'})`
    if (channels.length === 0) {
      console.log(colorize('dim', `${label}: no items found`))
      return
    }

    console.log(colorize('bold', `${label} (${channels.length})`))
    for (const [index, channel] of channels.entries()) {
      const name =
        typeof channel?.displayName === 'string' ? channel.displayName : 'Unknown channel'
      const id = typeof channel?.id === 'string' ? channel.id : 'unknown'
      const line = `${String(index + 1).padStart(2, '0')}. ${colorize(
        'cyan',
        name,
      )} (${colorize('dim', id)})`
      console.log(`  ${line}`)
    }
    return
  }

  const notifications =
    result.command === 'notifications' || result.command === 'messages'
      ? (result.data as { messages?: unknown[] }).messages
      : result.command === 'channel-messages'
        ? (result.data as unknown[])
        : []

  if (result.command === 'notifications') {
    if (!Array.isArray(notifications) || notifications.length === 0) {
      console.log(colorize('dim', 'Notifications: no items found'))
      return
    }

    console.log(colorize('bold', `Notifications (${notifications.length})`))
    for (const [index, notification] of notifications.entries()) {
      const rawProperties =
        typeof notification === 'object' && notification !== null
          ? (notification as Record<string, unknown>).properties
          : undefined
      const messagePreview =
        (
          rawProperties as {
            activity?: { messagePreview?: string }
          }
        )?.activity?.messagePreview ?? ''
      const id = pickFirstString(
        notification as Record<string, unknown>,
        'id',
        'messageId',
        'messageID',
        'id1',
        'clientMessageId',
      )
      const clumpId = pickFirstString(
        notification as Record<string, unknown>,
        'clumpId',
        'clumpID',
        'converationId',
        'conversationId',
      )
      const safeMessagePreview =
        messagePreview.length > 0 ? sanitizeMessageBody(messagePreview) : 'no message preview'
      const clippedPreview =
        safeMessagePreview.length > 160
          ? `${safeMessagePreview.slice(0, 157)}...`
          : safeMessagePreview
      const safeId = id.length > 0 ? id : 'unknown-id'
      console.log(`${colorize('dim', `- msg: ${clumpId}, notify:`)} ${colorize('cyan', safeId)}`)
      console.log(`    ${colorize('dim', clippedPreview)}`)
    }
    return
  }

  const label =
    result.command === 'channel-messages'
      ? 'Channel messages'
      : result.command === 'messages'
        ? 'Conversation messages'
        : 'Notifications'

  if (!Array.isArray(notifications) || notifications.length === 0) {
    console.log(colorize('dim', `${label}: no items found`))
    return
  }

  console.log(colorize('bold', `${label} (${notifications.length})`))
  for (const [index, message] of notifications.entries()) {
    const sender = pickFirstString(
      message as Record<string, unknown>,
      'imdisplayname',
      'fromDisplayNameInToken',
      'fromDisplayName',
      'from',
    )
    const composedAt = pickFirstString(
      message as Record<string, unknown>,
      'composetime',
      'composeTime',
      'originalarrivaltime',
      'originalArrivalTime',
    )
    const content = pickFirstString(message as Record<string, unknown>, 'content', 'text')
    const safeFrom = sender ? sender : 'Unknown'
    const safeTime = toPrettyTime(composedAt) ?? 'unknown time'
    const body = sanitizeMessageBody(content)
    const clippedBody = body.length > 240 ? `${body.slice(0, 237)}...` : body
    const prefix = colorize('dim', `${String(index + 1).padStart(2, '0')}.`)
    console.log(`${prefix} ${safeFrom} [${safeTime}]`)
    console.log(`    ${colorize('dim', clippedBody)}`)
  }
}

function sanitizeMessageBody(input: string): string {
  const withoutTags = input.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]*>/g, ' ')
  return withoutTags.replace(/\s+/g, ' ').trim()
}

function toPrettyTime(input: string): string | undefined {
  if (!input) {
    return undefined
  }
  const date = Number.isNaN(Number(input)) ? new Date(input) : new Date(Number(input))
  if (Number.isNaN(date.getTime())) {
    return undefined
  }
  return date.toLocaleString()
}

function pickFirstString(value: Record<string, unknown> | undefined, ...keys: string[]): string {
  if (!value) {
    return ''
  }
  for (const key of keys) {
    const candidate = value[key]
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim()
    }
  }
  return ''
}
