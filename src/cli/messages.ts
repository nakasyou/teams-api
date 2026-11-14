import { readFile } from 'node:fs/promises'
import { parseArgs as parseNodeArgs } from 'node:util'
import type { TeamsClient } from '../client'
import type { MessageImportance, SendMessageOptions } from '../types'
import type { CliCommandResult, ParsedArgs } from './types'

const messageCommands = ['send', 'post', 'reply', 'dm'] as const
type MessageCommand = (typeof messageCommands)[number]

export const messageHelp: Record<MessageCommand, readonly string[]> = {
  send: [
    'Usage:',
    '  teams send <conversationId> <text> [options]',
    '  teams send <conversationId> --input <file> [options]',
    '  Send a message to a DM, group chat, or channel conversation.',
    'Options:',
    '  --input <file>              Read the message body from a UTF-8 file',
    '  --html                      Treat the body as raw HTML (default: escape and wrap in <p>)',
    '  --text                      Send with messagetype "Text" instead of RichText/Html',
    '  --subject <title>           Set properties.subject (channel post title)',
    '  --importance <level>        standard (default), high, or urgent',
    '  --client-message-id <id>    Override the generated numeric client message id',
    '  --display-name <name>       Set imdisplayname',
  ],
  post: [
    'Usage:',
    '  teams post <teamId> <channelId> <text> [--subject <title>] [options]',
    '  teams post <teamId> <channelId> --input <file> [--subject <title>] [options]',
    '  Create a top-level channel post. The channel ID itself is the conversation ID.',
    '  teamId is accepted for consistency with other channel commands and is not sent.',
    'Options:',
    '  --subject <title>           Post title (properties.subject)',
    '  --input <file>              Read the post body from a UTF-8 file',
    '  --html                      Treat the body as raw HTML',
    '  --text                      Send with messagetype "Text"',
    '  --importance <level>        standard, high, or urgent',
    '  --client-message-id <id>    Override the generated client message id',
    '  --display-name <name>       Set imdisplayname',
  ],
  reply: [
    'Usage:',
    '  teams reply <teamId> <channelId> <rootMessageId> <text> [options]',
    '  teams reply <teamId> <channelId> <rootMessageId> --input <file> [options]',
    '  Reply to a channel post. Uses the encoded <channelId>;messageid=<rootMessageId> conversation id.',
    '  teamId is accepted for consistency with other channel commands and is not sent.',
    'Options:',
    '  --input <file>              Read the reply body from a UTF-8 file',
    '  --html                      Treat the body as raw HTML',
    '  --text                      Send with messagetype "Text"',
    '  --subject <title>           Set properties.subject',
    '  --importance <level>        standard, high, or urgent',
    '  --client-message-id <id>    Override the generated client message id',
    '  --display-name <name>       Set imdisplayname',
  ],
  dm: [
    'Usage:',
    '  teams dm <userMri> <text> [options]',
    '  teams dm <userMri> --input <file> [options]',
    '  Send a direct message. Reuses an existing 1:1 chat when found, otherwise creates one.',
    '  A self DM requires an existing dedicated self chat; it is never created or sent to someone else.',
    'Options:',
    '  --self-mri <mri>            Your own MRI (takes precedence over snapshot-derived values)',
    '  --topic <name>              Topic for a newly created chat',
    '  --new-chat                  Always create a new chat instead of reusing one (not valid for self DMs)',
    '  --input <file>              Read the message body from a UTF-8 file',
    '  --html                      Treat the body as raw HTML',
    '  --text                      Send with messagetype "Text"',
    '  --importance <level>        standard, high, or urgent',
    '  --client-message-id <id>    Override the generated client message id',
    '  --display-name <name>       Set imdisplayname',
  ],
}

const optionConfig = {
  input: { type: 'string' },
  html: { type: 'boolean' },
  text: { type: 'boolean' },
  subject: { type: 'string' },
  importance: { type: 'string' },
  'client-message-id': { type: 'string' },
  'display-name': { type: 'string' },
  'self-mri': { type: 'string' },
  topic: { type: 'string' },
  'new-chat': { type: 'boolean' },
} as const

const commonOptions = [
  'input',
  'html',
  'text',
  'importance',
  'client-message-id',
  'display-name',
] as const

export async function executeMessageCommand(
  args: ParsedArgs,
  client: TeamsClient,
): Promise<CliCommandResult> {
  if (!messageCommands.includes(args.command as MessageCommand)) {
    throw new Error('Expected a message command')
  }
  const command = args.command as MessageCommand
  if (
    !args.commandArgs.length ||
    args.commandArgs.some((arg) => arg === '--help' || arg === '-h')
  ) {
    return { command: 'help', data: command }
  }

  const parsed = parseNodeArgs({
    args: args.commandArgs,
    options: optionConfig,
    allowPositionals: true,
    strict: true,
  })
  const values = parsed.values
  const positionals = parsed.positionals
  const option = (name: keyof typeof values): string | undefined => {
    const value = values[name]
    return typeof value === 'string' ? value : undefined
  }
  const allow = (...names: string[]): void => {
    for (const key of Object.keys(values))
      if (!names.includes(key)) throw new Error(`--${key} is not supported by this command`)
  }
  const count = (min: number, max = min): void => {
    if (positionals.length < min || positionals.length > max)
      throw new Error(`Invalid arguments. Run teams ${command} --help`)
  }
  const required = (index: number): string => {
    const value = positionals[index]
    if (!value?.trim()) throw new Error(`Missing argument. Run teams ${command} --help`)
    return value
  }
  const content = async (index: number): Promise<string> => {
    const inline = positionals[index]
    const path = option('input')
    if (inline !== undefined && path !== undefined)
      throw new Error('Provide either message text or --input, not both')
    if (path !== undefined) {
      if (!path.trim()) throw new Error('--input requires a file path')
      return readFile(path, 'utf8')
    }
    if (inline === undefined) throw new Error(`Missing message text. Run teams ${command} --help`)
    return inline
  }
  const sendOptions = (): SendMessageOptions => {
    if (values.html === true && values.text === true)
      throw new Error('--html and --text cannot be used together')
    let importance: MessageImportance | undefined
    if (values.importance !== undefined) {
      if (!['standard', 'high', 'urgent'].includes(values.importance))
        throw new Error('--importance must be standard, high, or urgent')
      importance = values.importance === 'standard' ? '' : (values.importance as MessageImportance)
    }
    return {
      ...(values.html === true ? { html: true } : {}),
      ...(values.text === true ? { messageType: 'Text' as const } : {}),
      ...(option('subject') ? { subject: option('subject') } : {}),
      ...(importance !== undefined ? { importance } : {}),
      ...(option('client-message-id') ? { clientMessageId: option('client-message-id') } : {}),
      ...(option('display-name') ? { displayName: option('display-name') } : {}),
    }
  }

  switch (command) {
    case 'send': {
      allow(...commonOptions, 'subject')
      count(1, 2)
      const data = await client.teams.conversations.sendMessage(
        required(0),
        await content(1),
        sendOptions(),
      )
      return { command, data }
    }
    case 'post': {
      allow(...commonOptions, 'subject')
      count(2, 3)
      const data = await client.teams.channels.post(
        required(0),
        required(1),
        await content(2),
        sendOptions(),
      )
      return { command, data }
    }
    case 'reply': {
      allow(...commonOptions, 'subject')
      count(3, 4)
      const data = await client.teams.channels.reply(
        required(0),
        required(1),
        required(2),
        await content(3),
        sendOptions(),
      )
      return { command, data }
    }
    case 'dm': {
      allow(...commonOptions, 'self-mri', 'topic', 'new-chat')
      count(1, 2)
      const data = await client.teams.chats.sendDirectMessage(required(0), await content(1), {
        ...sendOptions(),
        ...(option('self-mri') ? { selfMri: option('self-mri') } : {}),
        ...(option('topic') ? { topic: option('topic') } : {}),
        reuseExisting: values['new-chat'] !== true,
      })
      return { command, data }
    }
  }
}
