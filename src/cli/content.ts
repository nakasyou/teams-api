import { contentWriteHelp, contentWriteOptions, executeContentWrite } from './content-write'
import { parseArgs as parseNodeArgs } from 'node:util'
import { mkdir, open, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import type { TeamsClient } from '../client'
import type { CliCommandResult, ParsedArgs } from './types'
import type {
  DriveItem,
  FileReference,
  NotebookScope,
  NotebookSection,
  NotebookSectionGroup,
  Team,
} from '../types'

export const contentHelp = {
  files: [
    ...contentWriteHelp.files,
    'teams files drives <teamId|groupId|me|user:userId>',
    'teams files channel <teamId|groupId> <channelId>',
    'teams files list <driveId> [itemId]',
    'teams files get <driveId> <itemId>',
    'teams files path <driveId> <path>',
    'teams files search <driveId> <query>',
    'teams files resolve <sharepointFileUrl>',
    'teams files sharepoint <siteUrl> <libraryPath> [--folder <path>] [--recursive]',
    'teams files download <sharepointFileUrl> --output <file>',
    'teams files download <driveId> <itemId> --output <file>',
    'teams files thumbnail <sharepointFileUrl> --output <file> [--size large]',
    'teams files thumbnail <driveId> <itemId> --output <file> [--size large]',
    'teams files download-folder <driveId> <itemId|root> --output <directory>',
    'teams files download-sharepoint <siteUrl> <libraryPath> --output <directory> [--folder <path>]',
  ],
  notebooks: [
    ...contentWriteHelp.notebooks,
    'teams notebooks list <teamId|groupId|me>',
    'teams notebooks get <scope> <notebookId>',
    'teams notebooks tree <scope> <notebookId>',
    'teams notebooks sections <scope> [notebookId] [--section-group <id>]',
    'teams notebooks section-groups <scope> [notebookId] [--section-group <id>]',
    'teams notebooks pages <scope> [sectionId]',
    'teams notebooks page <scope> <pageId>',
    'teams notebooks download-page <scope> <pageId> --output <file.html>',
    'teams notebooks download-resource <scope> <resourceId> --output <file>',
    'teams notebooks export <scope> <notebookId> --output <directory>',
    'Scope: me, teamId, groupId, user:<userId>, or site:<siteId>',
  ],
  'class-notebook': [
    ...contentWriteHelp['class-notebook'],
    'teams class-notebook list <teamId|groupId>',
    'teams class-notebook get <teamId|groupId> <notebookId>',
    'teams class-notebook type <teamId|groupId>',
    'teams class-notebook default <teamId|groupId>',
    'teams class-notebook collaboration <teamId|groupId>',
    'teams class-notebook sections <teamId|groupId> <notebookId> <sectionGroupId> [--channel <channelId>]',
    'teams class-notebook open <teamId|groupId>',
    'teams class-notebook export <teamId|groupId> [notebookId] --output <directory>',
  ],
}

export async function executeContentCommand(
  args: ParsedArgs,
  client: TeamsClient,
): Promise<CliCommandResult> {
  if (args.command !== 'files' && args.command !== 'notebooks' && args.command !== 'class-notebook')
    throw new Error('Expected a content command')
  if (
    !args.commandArgs.length ||
    args.commandArgs.some((arg) => arg === '--help' || arg === '-h')
  ) {
    return { command: 'help', data: args.command }
  }
  const parsed = parseNodeArgs({
    args: args.commandArgs,
    allowPositionals: true,
    strict: true,
    options: {
      ...contentWriteOptions,
      output: { type: 'string' },
      folder: { type: 'string' },
      recursive: { type: 'boolean' },
      size: { type: 'string' },
      'section-group': { type: 'string' },
      channel: { type: 'string' },
    },
  })
  const [command, ...ids] = parsed.positionals
  const values = parsed.values
  const required = (index: number): string => {
    const value = ids[index]
    if (!value) throw new Error(`Missing argument. Run teams ${args.command} --help`)
    return value
  }
  const count = (min: number, max = min): void => {
    if (ids.length < min || ids.length > max)
      throw new Error(`Invalid arguments. Run teams ${args.command} --help`)
  }
  const output = (): string => {
    if (!values.output?.trim()) throw new Error('--output <path> is required')
    return resolve(values.output)
  }
  const allow = (...options: string[]): void => {
    for (const key of Object.keys(values))
      if (!options.includes(key)) throw new Error(`--${key} is not supported by this command`)
  }
  const mutation = await executeContentWrite(args.command, command ?? '', ids, values, client, {
    group: (input) => resolveGroupId(client, input),
    notebookScope: (input) => resolveNotebookScope(client, input),
  })
  if (mutation) return { command: args.command, data: mutation.data }
  let data: unknown
  if (args.command === 'files') {
    const files = client.teams.files
    const reference = (): FileReference =>
      ids.length === 1 ? { url: required(0) } : { driveId: required(0), itemId: required(1) }
    switch (command) {
      case 'drives':
        allow()
        count(1)
        data = await files.listDrives(await resolveGroupId(client, required(0)))
        break
      case 'channel':
        allow()
        count(2)
        data = await files.listChannelFiles(await resolveGroupId(client, required(0)), required(1))
        break
      case 'list':
        allow()
        count(1, 2)
        data = await files.listChildren(required(0), ids[1])
        break
      case 'get':
        allow()
        count(2)
        data = await files.fetch(required(0), required(1))
        break
      case 'path':
        allow()
        count(2)
        data = await files.fetchByPath(required(0), required(1))
        break
      case 'search':
        allow()
        count(2)
        data = await files.search(required(0), required(1))
        break
      case 'resolve':
        allow()
        count(1)
        data = await files.fetchShared(required(0))
        break
      case 'sharepoint':
        allow('folder', 'recursive')
        count(2)
        data = await files.listSharePointFiles(required(0), required(1), {
          folder: values.folder,
          recursive: values.recursive,
        })
        break
      case 'download':
      case 'thumbnail': {
        allow(...(command === 'download' ? ['output'] : ['output', 'size']))
        count(1, 2)
        const path = output()
        const response =
          command === 'download'
            ? await files.download(reference())
            : await files.thumbnail(reference(), values.size)
        data = await saveResponse(response, path)
        break
      }
      case 'download-folder': {
        allow('output')
        count(2)
        const directory = output()
        data = {
          directory,
          files: await downloadFolder(client, required(0), required(1), directory),
        }
        break
      }
      case 'download-sharepoint': {
        allow('output', 'folder')
        count(2)
        const directory = output()
        const siteUrl = required(0)
        const root = values.folder ?? required(1)
        const listing = await files.listSharePointFiles(siteUrl, required(1), {
          folder: values.folder,
          recursive: true,
        })
        const results: { path: string; bytes: number }[] = []
        for (const file of listing.value) {
          if (file.isFolder) continue
          if (!file.serverRelativeUrl.startsWith(`${root.replace(/\/$/, '')}/`))
            throw new Error('File is outside the requested folder')
          const relative = file.serverRelativeUrl.slice(root.replace(/\/$/, '').length + 1)
          const path = safeJoin(directory, ...relative.split('/'))
          results.push(
            await saveResponse(await files.download({ siteUrl, uniqueId: file.id }), path),
          )
        }
        data = { directory, files: results }
        break
      }
      default:
        throw new Error(`Unknown files subcommand: ${command}`)
    }
  } else if (args.command === 'notebooks') {
    const notebooks = client.teams.notebooks
    const scope = () => resolveNotebookScope(client, required(0))
    const parent = () => {
      if (ids[1] && values['section-group'])
        throw new Error('Use either notebookId or --section-group')
      return values['section-group']
        ? { sectionGroupId: values['section-group'] }
        : ids[1]
          ? { notebookId: ids[1] }
          : undefined
    }
    switch (command) {
      case 'list':
        allow()
        count(1)
        data = await notebooks.list(await scope())
        break
      case 'get':
        allow()
        count(2)
        data = await notebooks.fetch(await scope(), required(1))
        break
      case 'tree':
        allow()
        count(2)
        data = await notebooks.fetchTree(await scope(), required(1))
        break
      case 'sections':
        allow('section-group')
        count(1, 2)
        data = await notebooks.listSections(await scope(), parent())
        break
      case 'section-groups':
        allow('section-group')
        count(1, 2)
        data = await notebooks.listSectionGroups(await scope(), parent())
        break
      case 'pages':
        allow()
        count(1, 2)
        data = await notebooks.listPages(await scope(), ids[1])
        break
      case 'page':
        allow()
        count(2)
        data = await notebooks.fetchPage(await scope(), required(1))
        break
      case 'download-page': {
        allow('output')
        count(2)
        const path = output()
        const html = await notebooks.fetchPageContent(await scope(), required(1))
        data = await saveText(html, path)
        break
      }
      case 'download-resource': {
        allow('output')
        count(2)
        const path = output()
        data = await saveResponse(
          await notebooks.downloadResource(await scope(), required(1)),
          path,
        )
        break
      }
      case 'export': {
        allow('output')
        count(2)
        const directory = output()
        data = await exportNotebook(client, await scope(), required(1), directory)
        break
      }
      default:
        throw new Error(`Unknown notebooks subcommand: ${command}`)
    }
  } else {
    const notebooks = client.teams.classNotebooks
    const group = () => resolveGroupId(client, required(0))
    switch (command) {
      case 'list':
        allow()
        count(1)
        data = await notebooks.list(await group())
        break
      case 'get':
        allow()
        count(2)
        data = await notebooks.fetch(await group(), required(1))
        break
      case 'type':
        allow()
        count(1)
        data = await notebooks.fetchType(await group())
        break
      case 'default':
        allow()
        count(1)
        data = await notebooks.fetchDefault(await group())
        break
      case 'collaboration':
        allow()
        count(1)
        data = await notebooks.fetchCollaborationSpaceId(await group())
        break
      case 'sections':
        allow('channel')
        count(3)
        data = await notebooks.listCollaborationSections(
          await group(),
          required(1),
          required(2),
          values.channel,
        )
        break
      case 'open': {
        allow()
        count(1)
        const properties = await notebooks.fetchWopiProperties(await group())
        // WOPI access tokens belong in memory, not terminal output or profile files.
        data = {
          id: properties.id,
          oneNoteWebUrl: properties.oneNoteWebUrl,
          webApplicationUrl: properties.webApplicationUrl,
          accessTokenTtl: properties.accessTokenTtl,
        }
        break
      }
      case 'export': {
        allow('output')
        count(1, 2)
        const directory = output()
        const groupId = await group()
        const notebookId = ids[1] ?? (await notebooks.fetchDefault(groupId)).id
        data = await exportNotebook(client, { groupId }, notebookId, directory)
        break
      }
      default:
        throw new Error(`Unknown class-notebook subcommand: ${command}`)
    }
  }
  return { command: args.command, data }
}

async function resolveGroupId(client: TeamsClient, input: string): Promise<string> {
  if (!input.startsWith('19:')) return input
  const me = await client.teams.users.me.fetch()
  const team: Team | undefined = me.teams.find((team) => team.id === input)
  if (!team?.teamSiteInformation?.groupId)
    throw new Error(`Team has no Microsoft 365 group ID: ${input}`)
  return team.teamSiteInformation.groupId
}

async function resolveNotebookScope(client: TeamsClient, input: string): Promise<NotebookScope> {
  if (input === 'me') return { me: true }
  if (input.startsWith('user:')) return { userId: input.slice(5) }
  if (input.startsWith('site:')) return { siteId: input.slice(5) }
  return { groupId: await resolveGroupId(client, input) }
}

function safeJoin(directory: string, ...names: string[]): string {
  for (const name of names) {
    if (!name || name === '.' || name === '..' || /[\\/\x00]/.test(name))
      throw new Error('Unsafe file or folder name received from API')
  }
  return join(directory, ...names)
}

export async function saveResponse(
  response: Response,
  path: string,
): Promise<{ path: string; bytes: number }> {
  if (!response.ok) throw new Error(`Download failed: ${response.status}`)
  if (!response.body) throw new Error('Download response has no body')
  await mkdir(dirname(path), { recursive: true })
  let handle
  try {
    handle = await open(path, 'wx')
  } catch (error) {
    await response.body.cancel()
    throw error
  }
  try {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        let offset = 0
        while (offset < value.byteLength) {
          const { bytesWritten } = await handle.write(value, offset, value.byteLength - offset)
          if (!bytesWritten) throw new Error('Failed to write download data')
          offset += bytesWritten
        }
      }
    } finally {
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
    const bytes = (await handle.stat()).size
    await handle.close()
    return { path, bytes }
  } catch (error) {
    await handle.close()
    await unlink(path)
    throw error
  }
}

async function saveText(text: string, path: string): Promise<{ path: string; bytes: number }> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, { flag: 'wx' })
  return { path, bytes: Buffer.byteLength(text) }
}

async function downloadFolder(
  client: TeamsClient,
  driveId: string,
  itemId: string,
  directory: string,
): Promise<{ path: string; bytes: number }[]> {
  const results: { path: string; bytes: number }[] = []
  const seen = new Set<string>()
  const walk = async (drive: string, item: string, path: string): Promise<void> => {
    const key = `${drive}/${item}`
    if (seen.has(key)) throw new Error('Repeated folder in file hierarchy')
    seen.add(key)
    await mkdir(path, { recursive: true })
    for (const entry of (await client.teams.files.listChildren(drive, item)).value) {
      const target: DriveItem = entry.remoteItem ?? entry
      const targetDrive = target.parentReference?.driveId ?? drive
      const child = safeJoin(path, entry.name)
      if (target.folder) await walk(targetDrive, target.id, child)
      else if (target.package?.type === 'oneNote')
        throw new Error('Use notebooks export to download a OneNote notebook')
      else
        results.push(
          await saveResponse(
            await client.teams.files.download({ driveId: targetDrive, itemId: target.id }),
            child,
          ),
        )
    }
  }
  await walk(driveId, itemId, directory)
  return results
}

export async function exportNotebook(
  client: TeamsClient,
  scope: NotebookScope,
  notebookId: string,
  directory: string,
): Promise<{ directory: string; pages: number; resources: number }> {
  const tree = await client.teams.notebooks.fetchTree(scope, notebookId)
  const resources = new Map<string, string>()
  const manifest: { id: string; title?: string; path: string }[] = []
  const saveSection = async (section: NotebookSection, path: string): Promise<void> => {
    for (const page of section.pages ?? []) {
      let html = await client.teams.notebooks.fetchPageContent(scope, page.id)
      // Only authenticated resource references belonging to this notebook scope are fetched.
      const matches = [...html.matchAll(/\b(?:src|data|data-fullres-src)\s*=\s*["']([^"']+)["']/gi)]
      for (const match of matches) {
        const raw = match[1]
        if (!raw) continue
        let url: URL
        try {
          url = new URL(raw.replace(/&amp;/g, '&'))
        } catch {
          continue
        }
        if (
          url.protocol !== 'https:' ||
          !['graph.microsoft.com', 'www.onenote.com'].includes(url.hostname)
        )
          continue
        const resourceMatch = url.pathname.match(
          /\/(?:onenote|notes)\/resources\/([^/]+)\/(?:content|\$value)$/,
        )
        if (!resourceMatch?.[1]) continue
        const resourceId = decodeURIComponent(resourceMatch[1])
        let asset = resources.get(resourceId)
        if (!asset) {
          asset = `resource-${resources.size + 1}`
          await saveResponse(
            await client.teams.notebooks.downloadResource(scope, resourceId),
            safeJoin(path, asset),
          )
          resources.set(resourceId, safeJoin(path, asset))
        }
        // Each section owns its assets; use relative paths when a resource is shared.
        const savedResource = resources.get(resourceId)
        if (!savedResource) throw new Error('Resource was not saved')
        const local = relative(path, savedResource).split('\\').join('/')
        html = html.split(raw).join(local)
      }
      const filename = `${safeLabel(page.title ?? 'page')}-${safeLabel(page.id)}.html`
      await saveText(html, safeJoin(path, filename))
      manifest.push({ id: page.id, title: page.title, path: safeJoin(path, filename) })
    }
  }
  const walk = async (
    node: { sections?: NotebookSection[]; sectionGroups?: NotebookSectionGroup[] },
    path: string,
  ): Promise<void> => {
    await mkdir(path, { recursive: true })
    for (const section of node.sections ?? [])
      await saveSection(
        section,
        safeJoin(
          path,
          `${safeLabel(section.displayName ?? section.name ?? 'section')}-${safeLabel(section.id)}`,
        ),
      )
    for (const group of node.sectionGroups ?? [])
      await walk(
        group,
        safeJoin(
          path,
          `${safeLabel(group.displayName ?? group.name ?? 'group')}-${safeLabel(group.id)}`,
        ),
      )
  }
  await walk(tree, directory)
  await saveText(
    JSON.stringify({ notebook: tree, pages: manifest }, null, 2),
    safeJoin(directory, 'index.json'),
  )
  return { directory, pages: manifest.length, resources: resources.size }
}

function safeLabel(input: string): string {
  return (
    input
      .replace(/[\\/\x00-\x1f<>:"|?*]/g, '_')
      .replace(/^\.+|\.+$/g, '_')
      .slice(0, 100) || 'untitled'
  )
}
