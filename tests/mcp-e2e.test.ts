import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createTeamsMcpServer } from '../src/mcp/server'
import { createCliRunner, type CliRunner } from '../src/mcp/runner'

const cleanup: (() => Promise<unknown>)[] = []

afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})

async function temp() {
  const directory = await mkdtemp(join(tmpdir(), 'teams-mcp-e2e-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

async function connect(runCli: CliRunner) {
  const server = createTeamsMcpServer(runCli, '0.0.0-test')
  const client = new Client({ name: 'e2e', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  cleanup.push(
    () => server.close(),
    () => client.close(),
  )
  return client
}

function preloadSource(logFile: string): string {
  return `
import { appendFileSync } from 'node:fs'

const logFile = ${JSON.stringify(logFile)}
const secondPage =
  'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages?view=msnp24Equivalent&pageSize=3&startTime=3&syncState=page2'

function record(url, method) {
  const path = url.pathname.includes('/_api/v2.0/shares/')
    ? '/_api/v2.0/shares/<id>/driveItem'
    : url.pathname
  const entry = { method: method, host: url.hostname, path: path }
  if (path.endsWith('/conversations/conv/messages')) {
    entry.syncState = url.searchParams.get('syncState')
  }
  appendFileSync(logFile, JSON.stringify(entry) + '\\n')
}

function attachment(name) {
  return {
    itemid: '11111111-1111-4111-8111-111111111111',
    fileName: name,
    fileType: 'pdf',
    fileInfo: {
      shareUrl:
        'https://contoso-my.sharepoint.com/:b:/g/personal/user_contoso_com/EXAMPLE-SHARING-TOKEN',
    },
    objectUrl: null,
    type: 'pdf'
  }
}

function page(messages, backwardLink) {
  return { messages: messages, _metadata: backwardLink ? { backwardLink: backwardLink } : {} }
}

const firstPage = [
  { id: 'message-1' },
  {
    id: 'message-2',
    properties: { files: JSON.stringify([attachment('no-resolve.pdf')]) }
  }
]
const nextPage = [
  {
    id: 'message-3',
    properties: { files: JSON.stringify([attachment('resolved.pdf')]) }
  },
  { id: 'message-4' }
]

globalThis.fetch = async function (input, init) {
  const url = new URL(
    typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  )
  const method = init && init.method ? init.method : 'GET'
  record(url, method)

  if (url.hostname === 'login.microsoftonline.com') {
    if (method !== 'POST' || !url.pathname.endsWith('/oauth2/v2.0/token')) {
      throw new Error('Unexpected OAuth request: ' + method + ' ' + url.pathname)
    }
    return Response.json({
      token_type: 'Bearer',
      scope: 'https://api.spaces.skype.com/.default openid profile offline_access',
      expires_in: 3600,
      ext_expires_in: 3600,
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      refresh_token_expires_in: 3600,
      id_token: 'fake-id-token',
      client_info: 'fake-client-info'
    })
  }

  if (url.pathname.endsWith('/conversations/conv/messages')) {
    return Response.json(
      url.searchParams.get('syncState') === 'page2'
        ? page(nextPage)
        : page(firstPage, secondPage)
    )
  }

  if (url.pathname.includes('/_api/v2.0/shares/')) {
    return Response.json({
      id: '01EXAMPLEITEMID',
      name: 'resolved.pdf',
      size: 1234,
      webUrl: 'https://contoso-my.sharepoint.com/personal/user_contoso_com/Documents/resolved.pdf',
      parentReference: { driveId: 'b!drive' },
      file: { mimeType: 'application/pdf' },
      currentUserRole: { blocksDownload: false },
      '@content.downloadUrl':
        'https://contoso-my.sharepoint.com/personal/user_contoso_com/_layouts/15/download.aspx?tempauth=secret'
    })
  }

  throw new Error('Unexpected fake fetch URL: ' + method + ' ' + url.origin + url.pathname)
}
`
}

test('MCP server and CLI runner scan two message pages for messages files with and without resolve', async () => {
  const directory = await temp()
  const profilePath = join(directory, 'profile.json')
  const logPath = join(directory, 'requests.jsonl')
  await writeFile(
    profilePath,
    JSON.stringify({
      tenantId: 'organizations',
      refreshToken: 'fake-refresh-token',
      refreshTokenExpiresIn: 3600,
      updatedAt: new Date().toISOString(),
    }),
  )
  const preloadPath = join(directory, 'preload.ts')
  await writeFile(preloadPath, preloadSource(logPath))

  const cliPath = fileURLToPath(new URL('../src/cli/index.ts', import.meta.url))
  const runner = createCliRunner(cliPath, ['--profile-json', profilePath], {
    execArgs: ['--preload', preloadPath],
  })
  const client = await connect(runner)

  const noResolve = await client.callTool({
    name: 'teams',
    arguments: { args: ['messages', 'files', 'conv', '--limit', '3', '--no-resolve'] },
  })
  expect(noResolve.isError).toBe(false)
  const noResolveResult = (
    noResolve.structuredContent as {
      result: { command: string; data: Record<string, unknown>[] }
    }
  ).result
  expect(noResolveResult.command).toBe('messages-files')
  expect(noResolveResult.data.map((row) => row.name)).toEqual(['no-resolve.pdf', 'resolved.pdf'])
  expect(noResolveResult.data.map((row) => row.messageId)).toEqual(['message-2', 'message-3'])
  expect(noResolveResult.data.every((row) => row.driveId === undefined)).toBe(true)
  expect(JSON.stringify(noResolve)).not.toContain('tempauth')

  const resolved = await client.callTool({
    name: 'teams',
    arguments: { args: ['messages', 'files', 'conv', '--limit', '3'] },
  })
  expect(resolved.isError).toBe(false)
  const resolvedResult = (
    resolved.structuredContent as {
      result: { command: string; data: Record<string, unknown>[] }
    }
  ).result
  expect(resolvedResult.command).toBe('messages-files')
  expect(resolvedResult.data.map((row) => row.name)).toEqual(['no-resolve.pdf', 'resolved.pdf'])
  expect(resolvedResult.data.map((row) => row.driveId)).toEqual(['b!drive', 'b!drive'])
  expect(resolvedResult.data.map((row) => row.itemId)).toEqual([
    '01EXAMPLEITEMID',
    '01EXAMPLEITEMID',
  ])
  expect(JSON.stringify(resolved)).not.toContain('tempauth')

  const requests = (await readFile(logPath, 'utf8'))
    .trim()
    .split('\n')
    .map(
      (line) =>
        JSON.parse(line) as {
          method: string
          host: string
          path: string
          syncState?: string | null
        },
    )
  const chatRequests = requests.filter((request) =>
    request.path.endsWith('/conversations/conv/messages'),
  )
  expect(chatRequests.map((request) => request.syncState)).toEqual([null, 'page2', null, 'page2'])
  expect(requests.filter((request) => request.path.includes('/_api/v2.0/shares/'))).toHaveLength(2)
  const nonGet = requests.filter((request) => request.method !== 'GET')
  // Chat and SharePoint scopes each refresh a token, so resolve adds one more POST.
  expect(nonGet).toHaveLength(3)
  expect(
    nonGet.every(
      (request) =>
        request.host === 'login.microsoftonline.com' && request.path.endsWith('/oauth2/v2.0/token'),
    ),
  ).toBe(true)
}, 20_000)
