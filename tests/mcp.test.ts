import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { contentHelp } from '../src/cli/content'
import { createTeamsMcpServer } from '../src/mcp/server'
import { createCliRunner, type CliRunner } from '../src/mcp/runner'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close()
})
async function connect(runCli: CliRunner) {
  const server = createTeamsMcpServer(runCli, '0.0.0-test')
  const client = new Client({ name: 'test', version: '1.0.0' })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  await client.connect(clientTransport)
  cleanup.push(
    () => server.close(),
    () => client.close(),
  )
  return client
}
async function temp() {
  const directory = await mkdtemp(join(tmpdir(), 'teams-mcp-test-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}

test('advertises exactly one tool with all command explanations in its description', async () => {
  const client = await connect(async () => ({ exitCode: 0, stdout: '{}', stderr: '' }))
  const { tools } = await client.listTools()
  expect(tools.map((tool) => tool.name)).toEqual(['teams'])
  const description = tools[0]!.description!
  for (const usage of Object.values(contentHelp)
    .flat()
    .filter((usage) => usage.startsWith('teams '))) {
    expect(description).toContain(`${usage}\n  `)
  }
  for (const command of [
    'notifications',
    'messages',
    'channel messages',
    'teams list',
    'teams channels',
    'me',
    'login',
    'help',
  ]) {
    expect(description).toContain(`teams ${command}`)
  }
  expect(description).toContain('Global options go BEFORE the subcommand')
  expect(description).toContain('target, action (append/prepend/insert/replace/delete)')
  expect(tools[0]!.inputSchema.properties).toHaveProperty('args')
})

test('passes argv through and returns CLI JSON and error details', async () => {
  const calls: string[][] = []
  const client = await connect(async (args) => {
    calls.push(args)
    return args[0] === 'me'
      ? { exitCode: 0, stdout: '{"command":"me","data":{"teams":[]}}\n', stderr: '' }
      : { exitCode: 1, stdout: '{"error":"No authentication token found"}\n', stderr: 'diagnostic' }
  })
  const success = await client.callTool({ name: 'teams', arguments: { args: ['me'] } })
  expect(success.isError).toBe(false)
  expect(success.structuredContent).toMatchObject({
    exitCode: 0,
    result: { command: 'me', data: { teams: [] } },
  })
  const failure = await client.callTool({
    name: 'teams',
    arguments: { args: ['files', 'get', 'd', 'i'] },
  })
  expect(failure.isError).toBe(true)
  expect(failure.structuredContent).toMatchObject({
    exitCode: 1,
    stderr: 'diagnostic',
    result: { error: 'No authentication token found' },
  })
  expect(calls).toEqual([['me'], ['files', 'get', 'd', 'i']])
})

test('rejects invalid tool input before invoking the CLI', async () => {
  let calls = 0
  const client = await connect(async () => {
    calls++
    return { exitCode: 0, stdout: '{}', stderr: '' }
  })
  expect((await client.callTool({ name: 'teams', arguments: { args: 'me' } })).isError).toBe(true)
  expect((await client.callTool({ name: 'teams', arguments: { args: [] } })).isError).toBe(true)
  expect(calls).toBe(0)
})

test('serializes concurrent calls and continues after runner failures', async () => {
  const events: string[] = []
  let release: (() => void) | undefined
  let started: (() => void) | undefined
  const firstStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const waitForRelease = new Promise<void>((resolve) => {
    release = resolve
  })
  const client = await connect(async (args) => {
    events.push(`start:${args[0]}`)
    if (args[0] === 'first') {
      started!()
      await waitForRelease
      throw new Error('runner failed')
    }
    events.push(`end:${args[0]}`)
    return { exitCode: 0, stdout: 'help text\n', stderr: '' }
  })
  const first = client.callTool({ name: 'teams', arguments: { args: ['first'] } })
  await firstStarted
  const second = client.callTool({ name: 'teams', arguments: { args: ['second'] } })
  expect(events).toEqual(['start:first'])
  release!()
  expect((await first).isError).toBe(true)
  const result = await second
  expect(result.isError).toBe(false)
  expect(result.content).toEqual([{ type: 'text', text: 'help text' }])
  expect(events).toEqual(['start:first', 'start:second', 'end:second'])
})

test('runner uses literal arguments and injects JSON output and the configured profile', async () => {
  const directory = await temp()
  const fakeCli = join(directory, 'cli.mjs')
  await writeFile(fakeCli, 'console.log(JSON.stringify(process.argv.slice(2)))')
  const runner = createCliRunner(fakeCli, ['--profile', 'work'])
  const args = ['files', 'upload', 'd', 'root', 'report; exit 99.pdf']
  const result = await runner(args)
  expect(result.exitCode).toBe(0)
  expect(JSON.parse(result.stdout)).toEqual(['--json', '--no-color', '--profile', 'work', ...args])
})

test('stdio server performs a real MCP handshake and runs CLI help and failures', async () => {
  const client = new Client({ name: 'stdio-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../src/mcp/index.ts', import.meta.url))],
    stderr: 'pipe',
  })
  cleanup.push(() => client.close())
  await client.connect(transport)
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['teams'])
  const help = await client.callTool({ name: 'teams', arguments: { args: ['files', '--help'] } })
  expect(help.isError).toBe(false)
  expect(help.structuredContent).toMatchObject({ exitCode: 0 })
  expect(JSON.stringify(help.content)).toContain('files download-folder')
  const failure = await client.callTool({ name: 'teams', arguments: { args: ['unknown-command'] } })
  expect(failure.isError).toBe(true)
  expect(failure.structuredContent).toMatchObject({ exitCode: 1 })
  const next = await client.callTool({
    name: 'teams',
    arguments: { args: ['notebooks', '--help'] },
  })
  expect(next.isError).toBe(false)
  expect(JSON.stringify(next.content)).toContain('notebooks patch-page')
})

test('teams mcp starts the same single-tool server and can return launcher help', async () => {
  const client = new Client({ name: 'cli-mcp-test', version: '1.0.0' })
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      fileURLToPath(new URL('../src/cli/index.ts', import.meta.url)),
      'mcp',
      '--profile',
      'mcp-test',
    ],
    stderr: 'pipe',
  })
  cleanup.push(() => client.close())
  await client.connect(transport)
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(['teams'])
  const help = await client.callTool({ name: 'teams', arguments: { args: ['mcp', '--help'] } })
  expect(help.isError).toBe(false)
  expect(JSON.stringify(help.content)).toContain('Usage: teams mcp')
  const nested = await client.callTool({ name: 'teams', arguments: { args: ['mcp'] } })
  expect(nested.isError).toBe(true)
  const dataHelp = await client.callTool({
    name: 'teams',
    arguments: { args: ['files', '--help'] },
  })
  expect(dataHelp.isError).toBe(false)
})
