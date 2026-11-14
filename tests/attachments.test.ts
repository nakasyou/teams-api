import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TeamsClient } from '../src/client/TeamsClient'
import { parseArgs } from '../src/cli/args'
import { executeCommand } from '../src/cli/commands'
import { executeContentCommand } from '../src/cli/content'
import { printResult } from '../src/cli/output'
import { teamsToolDescription } from '../src/mcp/description'
import {
  attachmentReference,
  attachmentReferences,
  parseMessageFiles,
  redactDriveItem,
} from '../src/rest/routes/attachments'
import type { DriveItem, MessageFileAttachment } from '../src/types'

const CHANNEL_FILE_URL =
  'https://contoso.sharepoint.com/sites/team/Shared Documents/日本語 report.pdf'
const CHAT_SHARE_URL =
  'https://contoso-my.sharepoint.com/:b:/g/personal/user_contoso_com/EXAMPLE-SHARING-TOKEN'
const CHAT_FILE_URL =
  'https://contoso-my.sharepoint.com/personal/user_contoso_com/Documents/Example.pdf'

const scopes: string[] = []
const requests: { url: URL; method: string; headers: Headers }[] = []
const mocks: { mockRestore(): void }[] = []
const directories: string[] = []
const json = (data: unknown) => Response.json(data)

function client() {
  return new TeamsClient({
    async getTokenFromScope(scope) {
      scopes.push(scope)
      return 'test-token'
    },
  })
}

function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        )
        requests.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers) })
        return handler(url, init)
      },
      { preconnect: fetch.preconnect },
    ),
  )
  mocks.push(mock)
  return mock
}

async function temp() {
  const path = await mkdtemp(join(tmpdir(), 'teams-attachments-test-'))
  directories.push(path)
  return path
}

afterEach(async () => {
  for (const mock of mocks.splice(0)) mock.mockRestore()
  scopes.length = 0
  requests.length = 0
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

function channelAttachment(): MessageFileAttachment {
  return {
    itemid: '11111111-1111-4111-8111-111111111111',
    fileName: '日本語 report.pdf',
    fileType: 'pdf',
    fileInfo: {
      itemId: null,
      fileUrl: CHANNEL_FILE_URL,
      siteUrl: 'https://contoso.sharepoint.com/sites/team',
      serverRelativeUrl: '',
      shareUrl: null,
      shareId: null,
    },
    objectUrl: CHANNEL_FILE_URL,
    type: 'pdf',
    title: '日本語 report.pdf',
    sharepointIds: null,
  }
}

function chatAttachment(): MessageFileAttachment {
  return {
    itemid: '22222222-2222-4222-8222-222222222222',
    fileName: 'Example.pdf',
    fileType: 'pdf',
    fileInfo: {
      itemId: null,
      fileUrl: CHAT_FILE_URL,
      siteUrl: 'https://contoso-my.sharepoint.com/personal/user_contoso_com',
      serverRelativeUrl: '',
      shareUrl: CHAT_SHARE_URL,
      shareId: '33333333-3333-4333-8333-333333333333',
    },
    objectUrl: CHAT_FILE_URL,
    type: 'pdf',
    title: 'Example.pdf',
    sharepointIds: null,
  }
}

function driveItem(url: string, extra: Partial<DriveItem> = {}): DriveItem {
  return {
    id: '01EXAMPLEITEMID',
    name: 'Example.pdf',
    size: 942060,
    webUrl: url,
    parentReference: { driveId: 'b!drive' },
    file: { mimeType: 'application/pdf' },
    currentUserRole: { blocksDownload: false },
    ...extra,
  }
}

function shareToken(url: URL): string {
  const value = url.pathname.split('/shares/')[1]?.split('/')[0]
  if (!value?.startsWith('u!')) throw new Error(`Unexpected share path: ${url.pathname}`)
  return Buffer.from(value.slice(2), 'base64url').toString('utf8')
}

const context = { machine: true, color: false }

describe('message attachments', () => {
  test('parses string, array, empty, and malformed properties.files values', () => {
    const first = { itemid: '11111111-1111-4111-8111-111111111111', fileName: 'a.pdf' }
    const second = { itemid: '22222222-2222-4222-8222-222222222222', fileName: 'b.docx' }

    expect(parseMessageFiles(undefined)).toEqual([])
    expect(parseMessageFiles(null)).toEqual([])
    expect(parseMessageFiles({})).toEqual([])
    expect(parseMessageFiles({ files: '' })).toEqual([])
    expect(parseMessageFiles({ files: '   ' })).toEqual([])
    expect(parseMessageFiles({ files: '[]' })).toEqual([])
    expect(parseMessageFiles({ files: '{}' })).toEqual([])
    expect(parseMessageFiles({ files: '{broken' })).toEqual([])
    expect(parseMessageFiles({ files: 42 })).toEqual([])
    expect(parseMessageFiles({ files: { itemid: 'x', fileName: 'a.pdf' } })).toEqual([])
    expect(
      parseMessageFiles({ files: JSON.stringify([first, null, { itemid: 'missing-file' }]) }),
    ).toEqual([first] as MessageFileAttachment[])
    expect(
      parseMessageFiles({ files: [first, { itemid: 42, fileName: 'bad.pdf' }, second] }),
    ).toEqual([first, second] as MessageFileAttachment[])
  })

  test('orders locators by shareUrl, objectUrl, fileUrl, then site/item', () => {
    const chat = chatAttachment()
    expect(attachmentReference(chat)).toEqual({ url: CHAT_SHARE_URL })

    const channel = channelAttachment()
    expect(attachmentReference(channel)).toEqual({ url: CHANNEL_FILE_URL })

    const everything = {
      ...channel,
      fileInfo: {
        shareUrl: CHAT_SHARE_URL,
        siteUrl: 'https://contoso.sharepoint.com/sites/team',
        fileUrl: 'https://contoso.sharepoint.com/sites/team/fileUrl.pdf',
      },
      objectUrl: 'https://contoso.sharepoint.com/sites/team/objectUrl.pdf',
      itemid: '11111111-1111-4111-8111-111111111111',
    }
    expect(attachmentReferences(everything)).toEqual([
      { url: CHAT_SHARE_URL },
      { url: 'https://contoso.sharepoint.com/sites/team/objectUrl.pdf' },
      { url: 'https://contoso.sharepoint.com/sites/team/fileUrl.pdf' },
      {
        siteUrl: 'https://contoso.sharepoint.com/sites/team',
        uniqueId: '11111111-1111-4111-8111-111111111111',
      },
    ])

    const deduplicated = {
      ...channel,
      fileInfo: { ...channel.fileInfo, fileUrl: CHANNEL_FILE_URL },
      objectUrl: CHANNEL_FILE_URL,
    }
    expect(attachmentReferences(deduplicated)).toEqual([
      { url: CHANNEL_FILE_URL },
      {
        siteUrl: 'https://contoso.sharepoint.com/sites/team',
        uniqueId: '11111111-1111-4111-8111-111111111111',
      },
    ])

    const siteOnly = {
      ...channel,
      fileInfo: { siteUrl: 'https://contoso.sharepoint.com/sites/team' },
      objectUrl: undefined,
    }
    expect(attachmentReference(siteOnly)).toEqual({
      siteUrl: 'https://contoso.sharepoint.com/sites/team',
      uniqueId: '11111111-1111-4111-8111-111111111111',
    })
  })

  test('encodes share URLs with spaces and non-ASCII characters and uses the file origin scope', async () => {
    const expected = new URL(CHANNEL_FILE_URL).href
    mockFetch((url) => {
      expect(url.hostname).toBe('contoso.sharepoint.com')
      expect(shareToken(url)).toBe(expected)
      return json(driveItem(CHANNEL_FILE_URL))
    })

    const item = await client().teams.files.resolveAttachment(channelAttachment())
    expect(item.id).toBe('01EXAMPLEITEMID')
    expect(scopes).toEqual([
      'https://contoso.sharepoint.com/.default openid profile offline_access',
    ])
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
    expect(requests[0]?.headers.get('authorization')).toBe('Bearer test-token')
  })

  test('requests a scope for each file origin, including personal chat sites', async () => {
    mockFetch((url) =>
      url.hostname === 'contoso-my.sharepoint.com'
        ? json(driveItem(CHAT_FILE_URL))
        : json(driveItem(CHANNEL_FILE_URL)),
    )

    const api = client().teams.files
    await api.resolveAttachment(chatAttachment())
    await api.resolveAttachment(channelAttachment())

    expect(scopes).toEqual([
      'https://contoso-my.sharepoint.com/.default openid profile offline_access',
      'https://contoso.sharepoint.com/.default openid profile offline_access',
    ])
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('resolveAttachment falls back when the first locator returns 404', async () => {
    mockFetch((url) => {
      const target = shareToken(url)
      if (target === new URL(CHAT_SHARE_URL).href)
        return new Response('not found', { status: 404, statusText: 'Not Found' })
      if (target === new URL(CHAT_FILE_URL).href) return json(driveItem(CHAT_FILE_URL))
      throw new Error(`Unexpected share token: ${target}`)
    })

    const item = await client().teams.files.resolveAttachment(chatAttachment())
    expect(item.id).toBe('01EXAMPLEITEMID')
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('resolveAttachment aggregates every failed locator', async () => {
    mockFetch(() => new Response('not found', { status: 404, statusText: 'Not Found' }))
    await expect(client().teams.files.resolveAttachment(chatAttachment())).rejects.toThrow(
      'Could not resolve attachment Example.pdf',
    )
    expect(requests).toHaveLength(3)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('downloadAttachment uses downloadUrlNoAuth with a bearer token', async () => {
    const noAuth =
      'https://contoso-my.sharepoint.com/personal/user_contoso_com/_layouts/15/download.aspx?UniqueId=abc'
    mockFetch((url) => {
      if (url.pathname.includes('/shares/'))
        return json(
          driveItem(CHAT_FILE_URL, {
            '@content.downloadUrlNoAuth': noAuth,
            '@content.downloadUrl': `${noAuth}&tempauth=secret`,
          }),
        )
      expect(url.href).toBe(noAuth)
      expect(requests.at(-1)?.method).toBe('GET')
      expect(requests.at(-1)?.headers.get('authorization')).toBe('Bearer test-token')
      return new Response('file bytes')
    })

    const response = await client().teams.files.downloadAttachment(chatAttachment())
    expect(await response.text()).toBe('file bytes')
    expect(requests.map((request) => request.url.hostname)).toEqual([
      'contoso-my.sharepoint.com',
      'contoso-my.sharepoint.com',
    ])
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('downloadAttachment rejects a download URL from a different SharePoint origin', async () => {
    const attachment = {
      ...chatAttachment(),
      objectUrl: undefined,
      fileInfo: { shareUrl: CHAT_SHARE_URL },
    }
    mockFetch(() =>
      json(
        driveItem(CHAT_FILE_URL, {
          '@content.downloadUrlNoAuth':
            'https://evil.sharepoint.com/personal/user/_layouts/15/download.aspx?UniqueId=abc',
        }),
      ),
    )

    await expect(client().teams.files.downloadAttachment(attachment)).rejects.toThrow(
      'does not match the SharePoint origin',
    )
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('downloadAttachment reports blocksDownload without fetching content', async () => {
    const attachment = {
      ...chatAttachment(),
      objectUrl: undefined,
      fileInfo: { shareUrl: CHAT_SHARE_URL },
    }
    mockFetch(() => json(driveItem(CHAT_FILE_URL, { currentUserRole: { blocksDownload: true } })))

    await expect(client().teams.files.downloadAttachment(attachment)).rejects.toThrow('blocked')
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('redactDriveItem replaces every download URL field and leaves the original untouched', () => {
    const item = driveItem('https://contoso.sharepoint.com/sites/team/file.pdf', {
      '@content.downloadUrl':
        'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?tempauth=secret',
      '@content.downloadUrlNoAuth':
        'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?UniqueId=1',
      '@microsoft.graph.downloadUrl': 'https://contoso.sharepoint.com/download?tempauth=secret',
      '@microsoft.graph.downloadUrlNoAuth': 'https://contoso.sharepoint.com/download?UniqueId=1',
    })
    item.remoteItem = { ...item, id: 'child' }

    const redacted = redactDriveItem(item)
    expect(redacted['@content.downloadUrl']).toBe('<redacted>')
    expect(redacted['@content.downloadUrlNoAuth']).toBe('<redacted>')
    expect(redacted['@microsoft.graph.downloadUrl']).toBe('<redacted>')
    expect(redacted['@microsoft.graph.downloadUrlNoAuth']).toBe('<redacted>')
    expect(redacted.remoteItem?.['@content.downloadUrl']).toBe('<redacted>')
    expect(JSON.stringify(redacted)).not.toContain('tempauth')
    expect(item['@content.downloadUrl']).toContain('tempauth')
  })
})

describe('attachment CLI', () => {
  test('lists conversation attachments with redacted resolved metadata', async () => {
    const file = driveItem(CHANNEL_FILE_URL, {
      '@content.downloadUrl':
        'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?tempauth=secret',
      '@content.downloadUrlNoAuth':
        'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?UniqueId=1',
    })
    mockFetch((url) => {
      if (url.pathname.endsWith('/conversations/conv/messages'))
        return json({
          messages: [
            {
              id: 'message-1',
              properties: { files: JSON.stringify([channelAttachment()]) },
            },
          ],
        })
      return json(file)
    })

    const result = await executeCommand(parseArgs(['messages', 'files', 'conv']), client(), context)
    expect(result.command).toBe('messages-files')
    const rows = result.data as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      messageId: 'message-1',
      index: 0,
      name: '日本語 report.pdf',
      type: 'pdf',
      host: 'contoso.sharepoint.com',
      driveId: 'b!drive',
      itemId: '01EXAMPLEITEMID',
      size: 942060,
      blocksDownload: false,
    })
    expect(JSON.stringify(result)).not.toContain('tempauth')

    const logs: string[] = []
    const log = spyOn(console, 'log').mockImplementation((value) => logs.push(String(value)))
    mocks.push(log)
    printResult(context, result, 'test')
    expect(logs.join('\n')).not.toContain('tempauth')
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('--no-resolve only fetches messages and still reports the host', async () => {
    mockFetch((url) => {
      expect(url.pathname).toEndWith('/conversations/conv/messages')
      return json({
        messages: [
          {
            id: 'message-1',
            properties: { files: JSON.stringify([chatAttachment()]) },
          },
        ],
      })
    })

    const result = await executeCommand(
      parseArgs(['messages', 'files', 'conv', '--no-resolve']),
      client(),
      context,
    )
    const rows = result.data as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      messageId: 'message-1',
      name: 'Example.pdf',
      host: 'contoso-my.sharepoint.com',
    })
    expect(rows[0]).not.toHaveProperty('driveId')
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('filters by message and resolves the team for channel files', async () => {
    mockFetch((url) => {
      expect(url.pathname).toContain('/channels/channel-1')
      return json({
        replyChains: [
          {
            messages: [
              {
                id: 'post-1',
                properties: { files: JSON.stringify([channelAttachment()]) },
              },
              {
                id: 'post-2',
                properties: { files: JSON.stringify([chatAttachment()]) },
              },
            ],
          },
        ],
      })
    })
    const teamsClient = client()
    spyOn(teamsClient.teams.users.me, 'fetch').mockResolvedValue({
      teams: [{ id: '19:team', channels: [{ id: 'channel-1' }] }],
    } as never)

    const result = await executeCommand(
      parseArgs(['channel', 'files', 'channel-1', '--message', 'post-2', '--no-resolve']),
      teamsClient,
      context,
    )
    const rows = result.data as Record<string, unknown>[]
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      messageId: 'post-2',
      name: 'Example.pdf',
      host: 'contoso-my.sharepoint.com',
    })
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('--download saves attachments with sanitized names and never overwrites', async () => {
    const root = await temp()
    const directory = join(root, 'out')
    const attachment = { ...channelAttachment(), fileName: '../escape report.pdf' }
    mockFetch((url) => {
      if (url.pathname.endsWith('/conversations/conv/messages'))
        return json({
          messages: [
            {
              id: 'message-1',
              properties: { files: JSON.stringify([attachment]) },
            },
          ],
        })
      if (url.pathname.includes('/shares/'))
        return json(
          driveItem(CHANNEL_FILE_URL, {
            '@content.downloadUrlNoAuth':
              'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?UniqueId=1',
          }),
        )
      return new Response('downloaded bytes')
    })

    const result = await executeCommand(
      parseArgs(['messages', 'files', 'conv', '--download', directory]),
      client(),
      context,
    )
    expect(await readdir(root)).toEqual(['out'])
    const names = await readdir(directory)
    expect(names).toHaveLength(1)
    expect(names[0]).not.toContain('/')
    expect(names[0]?.startsWith('..')).toBe(false)
    expect(await readFile(join(directory, names[0]!), 'utf8')).toBe('downloaded bytes')
    expect(JSON.stringify(result)).not.toContain('tempauth')
    expect(requests.every((request) => request.method === 'GET')).toBe(true)

    await expect(
      executeCommand(
        parseArgs(['messages', 'files', 'conv', '--download', directory]),
        client(),
        context,
      ),
    ).rejects.toThrow()
    expect(await readFile(join(directory, names[0]!), 'utf8')).toBe('downloaded bytes')
  })

  test('redacts existing files get/path/resolve/list/search/channel output', async () => {
    const file = driveItem(CHANNEL_FILE_URL, {
      '@content.downloadUrl':
        'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?tempauth=secret',
      '@content.downloadUrlNoAuth':
        'https://contoso.sharepoint.com/sites/team/_layouts/15/download.aspx?UniqueId=1',
      '@microsoft.graph.downloadUrl': 'https://contoso.sharepoint.com/download?tempauth=secret',
    })
    mockFetch((url) => {
      const path = url.pathname
      if (path.endsWith('/filesFolder'))
        return json({ id: 'folder', name: 'folder', parentReference: { driveId: 'd' } })
      if (path.includes('/children') || path.includes('/search(')) return json({ value: [file] })
      if (path.includes('/_api/v2.0/shares/')) return json(file)
      if (path.endsWith('/root:/file.pdf')) return json(file)
      if (path.endsWith('/items/i')) return json(file)
      throw new Error(`Unexpected path: ${path}`)
    })

    const commands = [
      ['files', 'get', 'd', 'i'],
      ['files', 'path', 'd', 'file.pdf'],
      ['files', 'resolve', CHANNEL_FILE_URL],
      ['files', 'list', 'd', 'root'],
      ['files', 'search', 'd', 'report'],
      ['files', 'channel', 'group', 'channel'],
    ]
    for (const args of commands) {
      const result = await executeContentCommand(parseArgs(args), client())
      expect(JSON.stringify(result)).not.toContain('tempauth')
      expect(JSON.stringify(result)).not.toContain('download.aspx')
    }
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('MCP description advertises both attachment commands', () => {
    expect(teamsToolDescription).toContain('teams messages files')
    expect(teamsToolDescription).toContain('teams channel files')
    expect(teamsToolDescription).toContain('--no-resolve')
    expect(teamsToolDescription).toContain('--download')
  })
})
