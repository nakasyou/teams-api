import { openAsBlob } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type { TeamsClient } from '../client'
import type {
  ConflictBehavior,
  CreateClassNotebook,
  DistributeNotebookPage,
  NotebookPagePatch,
  NotebookPrincipal,
  NotebookScope,
} from '../types'

export const contentWriteOptions = {
  input: { type: 'string' },
  name: { type: 'string' },
  conflict: { type: 'string' },
  'if-match': { type: 'string' },
  attachment: { type: 'string', multiple: true },
  locale: { type: 'string' },
} as const

export const contentWriteHelp = {
  files: [
    'teams files upload <driveId> <parentId|root> <localFile> [--name <name>] [--conflict fail|replace|rename]',
    'teams files replace <driveId> <itemId> <localFile> [--if-match <etag>]',
    'teams files mkdir <driveId> <parentId|root> <name>',
    'teams files rename <driveId> <itemId> <name> [--if-match <etag>]',
    'teams files move <driveId> <itemId> <parentId> [--name <name>] [--if-match <etag>]',
    'teams files copy <driveId> <itemId> <destinationDriveId> <parentId> [--name <name>]',
    'teams files delete <driveId> <itemId> [--if-match <etag>]',
  ],
  notebooks: [
    'teams notebooks create <scope> <name>',
    'teams notebooks create-section <scope> <notebookId> <name>',
    'teams notebooks create-section <scope> <name> --section-group <sectionGroupId>',
    'teams notebooks create-section-group <scope> <notebookId> <name>',
    'teams notebooks create-section-group <scope> <name> --section-group <sectionGroupId>',
    'teams notebooks rename-section <scope> <sectionId> <name>',
    'teams notebooks create-page <scope> <sectionId> --input <page.html> [--attachment <partName=path>]',
    'teams notebooks patch-page <scope> <pageId> --input <commands.json> [--attachment <partName=path>]',
    'teams notebooks delete-page <scope> <pageId>',
    'teams notebooks copy-page <scope> <pageId> <destinationSectionId>',
    'teams notebooks copy-section <scope> <sectionId> <destinationNotebookId>',
    'teams notebooks copy-section <scope> <sectionId> --section-group <destinationGroupId>',
    'teams notebooks copy-notebook <scope> <notebookId> [--name <name>]',
    'teams notebooks operation <operationUrl>',
    'teams notebooks lock-page <scope> <pageId> <ISO-date|null>',
  ],
  'class-notebook': [
    'teams class-notebook create <teamId|groupId> --input <notebook.json> [--locale ja-jp]',
    'teams class-notebook teacher-only <teamId|groupId> <notebookId>',
    'teams class-notebook delete <teamId|groupId> <notebookId>',
    'teams class-notebook add-member <teamId|groupId> <notebookId> <students|teachers> <userPrincipalName>',
    'teams class-notebook remove-member <teamId|groupId> <notebookId> <students|teachers> <principalId>',
    'teams class-notebook copy-sections <teamId|groupId> <notebookId> <sectionId> [sectionId...]',
    'teams class-notebook distribute-page <teamId|groupId> <notebookId> <pageId> --input <distribution.json>',
    'teams class-notebook sync-membership <teamId|groupId>',
    'teams class-notebook repair <teamId|groupId> <notebookId>',
  ],
}

export type ContentOptions = Record<string, string | string[] | boolean | undefined>
type ContentResolvers = {
  group(input: string): Promise<string>
  notebookScope(input: string): Promise<NotebookScope>
}
const mutations = {
  files: ['upload', 'replace', 'mkdir', 'rename', 'move', 'copy', 'delete'],
  notebooks: [
    'create',
    'create-section',
    'create-section-group',
    'rename-section',
    'create-page',
    'patch-page',
    'delete-page',
    'copy-page',
    'copy-section',
    'lock-page',
    'copy-notebook',
    'operation',
  ],
  'class-notebook': [
    'create',
    'teacher-only',
    'delete',
    'add-member',
    'remove-member',
    'copy-sections',
    'distribute-page',
    'sync-membership',
    'repair',
  ],
}
export async function executeContentWrite(
  kind: keyof typeof mutations,
  command: string,
  ids: string[],
  options: ContentOptions,
  client: TeamsClient,
  resolvers: ContentResolvers,
): Promise<{ data: unknown } | undefined> {
  if (!mutations[kind].includes(command)) return undefined
  const count = (min: number, max = min) => {
    if (ids.length < min || ids.length > max)
      throw new Error(`Invalid arguments. Run teams ${kind} --help`)
  }
  const id = (index: number) => {
    const value = ids[index]
    if (!value?.trim()) throw new Error('Missing argument')
    return value
  }
  const allow = (...names: string[]) => {
    for (const key of Object.keys(options))
      if (!names.includes(key)) throw new Error(`--${key} is not supported by this command`)
  }
  const option = (name: string): string | undefined =>
    typeof options[name] === 'string' ? (options[name] as string) : undefined
  const input = async () => {
    const path = option('input')
    if (!path) throw new Error('--input <file> is required')
    return readFile(path, 'utf8')
  }
  const conflict = (): ConflictBehavior => {
    const value = option('conflict') ?? 'fail'
    if (value !== 'fail' && value !== 'replace' && value !== 'rename')
      throw new Error('--conflict must be fail, replace, or rename')
    return value
  }
  const ifMatch = option('if-match')
  let data: unknown
  if (kind === 'files') {
    const files = client.teams.files
    switch (command) {
      case 'upload':
        allow('name', 'conflict', 'if-match')
        count(3)
        data = await files.upload(
          id(0),
          id(1),
          option('name') ?? basename(id(2)),
          await openAsBlob(id(2)),
          { conflictBehavior: conflict(), ifMatch },
        )
        break
      case 'replace':
        allow('if-match')
        count(3)
        data = await files.replaceContent(id(0), id(1), await openAsBlob(id(2)), ifMatch)
        break
      case 'mkdir':
        allow('conflict')
        count(3)
        data = await files.createFolder(id(0), id(1), id(2), conflict())
        break
      case 'rename':
        allow('if-match')
        count(3)
        data = await files.update(id(0), id(1), { name: id(2) }, ifMatch)
        break
      case 'move':
        allow('name', 'if-match')
        count(3)
        data = await files.update(
          id(0),
          id(1),
          { name: option('name'), parentReference: { id: id(2) } },
          ifMatch,
        )
        break
      case 'copy':
        allow('name')
        count(4)
        data = await files.copy(id(0), id(1), { driveId: id(2), id: id(3) }, option('name'))
        break
      case 'delete':
        allow('if-match')
        count(2)
        await files.delete(id(0), id(1), ifMatch)
        data = { deleted: true, id: id(1) }
        break
    }
  } else if (kind === 'notebooks') {
    const notebooks = client.teams.notebooks
    const scope = () => resolvers.notebookScope(id(0))
    const parent = () =>
      option('section-group') ? { sectionGroupId: option('section-group')! } : { notebookId: id(1) }
    switch (command) {
      case 'create':
        allow()
        count(2)
        data = await notebooks.create(await scope(), id(1))
        break
      case 'create-section':
        allow('section-group')
        count(option('section-group') ? 2 : 3)
        data = await notebooks.createSection(
          await scope(),
          parent(),
          id(option('section-group') ? 1 : 2),
        )
        break
      case 'create-section-group':
        allow('section-group')
        count(option('section-group') ? 2 : 3)
        data = await notebooks.createSectionGroup(
          await scope(),
          parent(),
          id(option('section-group') ? 1 : 2),
        )
        break
      case 'rename-section':
        allow()
        count(3)
        await notebooks.renameSection(await scope(), id(1), id(2))
        data = { renamed: true, id: id(1) }
        break
      case 'create-page': {
        allow('input', 'attachment')
        count(2)
        const html = await input()
        const content = await multipartContent(
          'Presentation',
          html,
          'text/html',
          options.attachment,
        )
        data = await notebooks.createPage(await scope(), id(1), content)
        break
      }
      case 'patch-page': {
        allow('input', 'attachment')
        count(2)
        const commands = parsePatchCommands(JSON.parse(await input()) as unknown)
        const content = await multipartContent(
          'Commands',
          JSON.stringify(commands),
          'application/json',
          options.attachment,
        )
        await notebooks.updatePageContent(
          await scope(),
          id(1),
          content instanceof FormData ? content : commands,
        )
        data = { updated: true, id: id(1) }
        break
      }
      case 'delete-page':
        allow()
        count(2)
        await notebooks.deletePage(await scope(), id(1))
        data = { deleted: true, id: id(1) }
        break
      case 'copy-page':
        allow()
        count(3)
        data = await notebooks.copyPage(await scope(), id(1), { id: id(2) })
        break
      case 'copy-section':
        allow('section-group')
        count(option('section-group') ? 2 : 3)
        data = await notebooks.copySection(
          await scope(),
          id(1),
          { id: option('section-group') ?? id(2) },
          option('section-group') ? 'sectionGroup' : 'notebook',
        )
        break
      case 'copy-notebook':
        allow('name')
        count(2)
        data = await notebooks.copyNotebook(await scope(), id(1), { renameAs: option('name') })
        break
      case 'operation':
        allow()
        count(1)
        data = await notebooks.fetchOperation(id(0))
        break
      case 'lock-page':
        allow()
        count(3)
        await notebooks.setPageLock(await scope(), id(1), id(2) === 'null' ? null : id(2))
        data = { updated: true, id: id(1) }
        break
    }
  } else {
    const notebooks = client.teams.classNotebooks
    const group = () => resolvers.group(id(0))
    const role = () => {
      const value = id(2)
      if (value !== 'students' && value !== 'teachers')
        throw new Error('Role must be students or teachers')
      return value
    }
    switch (command) {
      case 'create':
        allow('input', 'locale')
        count(1)
        data = await notebooks.create(
          await group(),
          parseCreateClassNotebook(JSON.parse(await input()) as unknown),
          option('locale'),
        )
        break
      case 'teacher-only':
        allow()
        count(2)
        await notebooks.addTeacherOnlySectionGroup(await group(), id(1))
        data = { updated: true, id: id(1) }
        break
      case 'delete':
        allow()
        count(2)
        await notebooks.delete(await group(), id(1))
        data = { deleted: true, id: id(1) }
        break
      case 'add-member':
        allow()
        count(4)
        data = await notebooks.addMembers(await group(), id(1), role(), [
          { id: id(3), principalType: 'Person' },
        ])
        break
      case 'remove-member':
        allow()
        count(4)
        await notebooks.removeMember(await group(), id(1), role(), id(3))
        data = { removed: true, id: id(3) }
        break
      case 'copy-sections':
        allow()
        count(3, Number.MAX_SAFE_INTEGER)
        data = await notebooks.copySectionsToContentLibrary(await group(), id(1), ids.slice(2))
        break
      case 'distribute-page':
        allow('input')
        count(3)
        data = await notebooks.distributePage(
          await group(),
          id(1),
          id(2),
          parseDistribution(JSON.parse(await input()) as unknown),
        )
        break
      case 'sync-membership':
        allow()
        count(1)
        await notebooks.syncMembership(await group())
        data = { updated: true }
        break
      case 'repair':
        allow()
        count(2)
        await notebooks.repair(await group(), id(1))
        data = { repaired: true, id: id(1) }
        break
    }
  }
  return { data }
}

async function multipartContent(
  part: string,
  content: string,
  type: string,
  attachments: ContentOptions['attachment'],
): Promise<string | FormData> {
  if (!Array.isArray(attachments) || !attachments.length) return content
  const body = new FormData()
  body.append(
    part,
    new Blob([content], { type }),
    `${part}.${type === 'text/html' ? 'html' : 'json'}`,
  )
  const names = new Set([part])
  for (const attachment of attachments) {
    const separator = attachment.indexOf('=')
    const name = attachment.slice(0, separator)
    const path = attachment.slice(separator + 1)
    if (separator < 1 || !path || !/^[a-zA-Z0-9_-]+$/.test(name) || names.has(name))
      throw new Error('Use unique --attachment partName=path values')
    names.add(name)
    body.append(name, await openAsBlob(path), basename(path))
  }
  return body
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a JSON object')
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Expected a nonempty string')
  return value
}
function principals(value: unknown): NotebookPrincipal[] {
  if (!Array.isArray(value)) throw new Error('Expected a principals array')
  return value.map((entry) => {
    const principal = object(entry)
    const role = principal.principalType
    if (role !== 'Person' && role !== 'Group') throw new Error('Invalid principalType')
    return { id: text(principal.id), principalType: role }
  })
}
function parseCreateClassNotebook(value: unknown): CreateClassNotebook {
  const data = object(value)
  if (!Array.isArray(data.studentSections)) throw new Error('Expected studentSections')
  if (
    data.hasTeacherOnlySectionGroup !== undefined &&
    typeof data.hasTeacherOnlySectionGroup !== 'boolean'
  )
    throw new Error('Expected a boolean hasTeacherOnlySectionGroup')
  return {
    name: text(data.name),
    studentSections: data.studentSections.map(text),
    teachers: principals(data.teachers),
    students: principals(data.students),
    hasTeacherOnlySectionGroup: data.hasTeacherOnlySectionGroup as boolean | undefined,
  }
}
function parseDistribution(value: unknown): DistributeNotebookPage {
  const data = object(value)
  if (
    data.ignoreIfStudentPageExists !== undefined &&
    typeof data.ignoreIfStudentPageExists !== 'boolean'
  )
    throw new Error('Expected a boolean ignoreIfStudentPageExists')
  return {
    studentUserPrincipalName: text(data.studentUserPrincipalName),
    lockStartDate: text(data.lockStartDate),
    targetSectionName: text(data.targetSectionName),
    assignmentId: data.assignmentId === undefined ? undefined : text(data.assignmentId),
    ignoreIfStudentPageExists: data.ignoreIfStudentPageExists as boolean | undefined,
  }
}
function parsePatchCommands(value: unknown): NotebookPagePatch[] {
  if (!Array.isArray(value) || !value.length)
    throw new Error('Expected a nonempty JSON commands array')
  return value.map((entry) => {
    const patch = object(entry)
    const action = patch.action
    if (
      action !== 'append' &&
      action !== 'prepend' &&
      action !== 'insert' &&
      action !== 'replace' &&
      action !== 'delete'
    )
      throw new Error('Invalid page patch action')
    const position = patch.position
    if (position !== undefined && position !== 'before' && position !== 'after')
      throw new Error('Invalid page patch position')
    if (action !== 'delete' && typeof patch.content !== 'string')
      throw new Error('Expected page patch content')
    return {
      action,
      target: text(patch.target),
      position,
      content: patch.content as string | undefined,
    }
  })
}
