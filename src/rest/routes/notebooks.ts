import type { RestClient } from '../RestClient'
import { SCOPES } from '../constants'
import type { ODataCollection, OperationResult } from '../../types/files'
import type {
  CreateClassNotebook,
  DistributeNotebookPage,
  NotebookCopyTarget,
  NotebookPagePatch,
  NotebookPrincipal,
  ClassNotebook,
  Notebook,
  NotebookListOptions,
  NotebookPage,
  NotebookScope,
  NotebookSection,
  NotebookSectionGroup,
  NotebookTree,
  NotebookWopiProperties,
} from '../../types/notebooks'
import { collect, encodeId, graphRoot, listQuery, validateServiceUrl } from './content'

export class TeamsNotebooksAPI {
  constructor(
    private readonly rest: RestClient,
    private readonly backend: 'onenote' | 'graph' = 'onenote',
  ) {}

  list(scope: NotebookScope, options?: NotebookListOptions): Promise<ODataCollection<Notebook>> {
    return collect(this.rest, `${this.root(scope)}/notebooks`, this.tokenScope, listQuery(options))
  }

  fetch(scope: NotebookScope, notebookId: string): Promise<Notebook> {
    return this.rest.request(`${this.root(scope)}/notebooks/${encodeId(notebookId)}`, {
      scope: this.tokenScope,
    })
  }

  listSections(
    scope: NotebookScope,
    parent?: { notebookId: string } | { sectionGroupId: string },
    options?: NotebookListOptions,
  ): Promise<ODataCollection<NotebookSection>> {
    const path = parent
      ? 'notebookId' in parent
        ? `notebooks/${encodeId(parent.notebookId)}/`
        : `sectionGroups/${encodeId(parent.sectionGroupId)}/`
      : ''
    return collect(
      this.rest,
      `${this.root(scope)}/${path}sections`,
      this.tokenScope,
      listQuery(options),
    )
  }

  listSectionGroups(
    scope: NotebookScope,
    parent?: { notebookId: string } | { sectionGroupId: string },
    options?: NotebookListOptions,
  ): Promise<ODataCollection<NotebookSectionGroup>> {
    const path = parent
      ? 'notebookId' in parent
        ? `notebooks/${encodeId(parent.notebookId)}/`
        : `sectionGroups/${encodeId(parent.sectionGroupId)}/`
      : ''
    return collect(
      this.rest,
      `${this.root(scope)}/${path}sectionGroups`,
      this.tokenScope,
      listQuery(options),
    )
  }

  listPages(
    scope: NotebookScope,
    sectionId?: string,
    options?: NotebookListOptions,
  ): Promise<ODataCollection<NotebookPage>> {
    const path = sectionId ? `sections/${encodeId(sectionId)}/` : ''
    return collect(
      this.rest,
      `${this.root(scope)}/${path}pages`,
      this.tokenScope,
      listQuery(options),
    )
  }

  fetchPage(scope: NotebookScope, pageId: string): Promise<NotebookPage> {
    return this.rest.request(`${this.root(scope)}/pages/${encodeId(pageId)}`, {
      scope: this.tokenScope,
    })
  }

  async fetchPageContent(
    scope: NotebookScope,
    pageId: string,
    includeIDs = false,
  ): Promise<string> {
    const response = await this.rest.requestResponse(
      `${this.root(scope)}/pages/${encodeId(pageId)}/content`,
      {
        scope: this.tokenScope,
        query: { includeIDs },
        headers: { accept: 'text/html' },
      },
    )
    return response.text()
  }

  downloadResource(scope: NotebookScope, resourceId: string): Promise<Response> {
    return this.rest.requestResponse(
      `${this.root(scope)}/resources/${encodeId(resourceId)}/content`,
      { scope: this.tokenScope },
    )
  }

  async fetchTree(scope: NotebookScope, notebookId: string): Promise<NotebookTree> {
    const notebook = await this.fetch(scope, notebookId)
    const visited = new Set<string>()
    const walk = async (
      parent: { notebookId: string } | { sectionGroupId: string },
    ): Promise<{ sections: NotebookSection[]; sectionGroups: NotebookSectionGroup[] }> => {
      const key =
        'notebookId' in parent ? `notebook:${parent.notebookId}` : `group:${parent.sectionGroupId}`
      if (visited.has(key)) throw new Error('Repeated section group in notebook hierarchy')
      visited.add(key)
      const sections = (await this.listSections(scope, parent)).value
      for (const section of sections)
        section.pages = (await this.listPages(scope, section.id)).value
      const sectionGroups = (await this.listSectionGroups(scope, parent)).value
      for (const group of sectionGroups)
        Object.assign(group, await walk({ sectionGroupId: group.id }))
      return { sections, sectionGroups }
    }
    return { ...notebook, ...(await walk({ notebookId })) }
  }

  fetchSection(scope: NotebookScope, sectionId: string): Promise<NotebookSection> {
    return this.rest.request(`${this.root(scope)}/sections/${encodeId(sectionId)}`, {
      scope: this.tokenScope,
    })
  }

  fetchSectionGroup(scope: NotebookScope, sectionGroupId: string): Promise<NotebookSectionGroup> {
    return this.rest.request(`${this.root(scope)}/sectionGroups/${encodeId(sectionGroupId)}`, {
      scope: this.tokenScope,
    })
  }

  create(scope: NotebookScope, name: string): Promise<Notebook> {
    return this.jsonWrite(`${this.root(scope)}/notebooks`, 'POST', this.nameBody(name))
  }

  createSection(
    scope: NotebookScope,
    parent: { notebookId: string } | { sectionGroupId: string },
    name: string,
  ): Promise<NotebookSection> {
    const path =
      'notebookId' in parent
        ? `notebooks/${encodeId(parent.notebookId)}`
        : `sectionGroups/${encodeId(parent.sectionGroupId)}`
    return this.jsonWrite(`${this.root(scope)}/${path}/sections`, 'POST', this.nameBody(name))
  }

  createSectionGroup(
    scope: NotebookScope,
    parent: { notebookId: string } | { sectionGroupId: string },
    name: string,
  ): Promise<NotebookSectionGroup> {
    const path =
      'notebookId' in parent
        ? `notebooks/${encodeId(parent.notebookId)}`
        : `sectionGroups/${encodeId(parent.sectionGroupId)}`
    return this.jsonWrite(`${this.root(scope)}/${path}/sectionGroups`, 'POST', this.nameBody(name))
  }

  async renameSection(scope: NotebookScope, sectionId: string, name: string): Promise<void> {
    if (this.backend === 'graph')
      throw new Error('Section renaming uses the OneNote service backend')
    await this.jsonWrite(
      `${this.root(scope)}/sections/${encodeId(sectionId)}`,
      'PATCH',
      this.nameBody(name),
    )
  }

  createPage(
    scope: NotebookScope,
    sectionId: string,
    content: string | FormData,
  ): Promise<NotebookPage> {
    return this.rest.request(`${this.root(scope)}/sections/${encodeId(sectionId)}/pages`, {
      scope: this.tokenScope,
      method: 'POST',
      body: content,
      headers: typeof content === 'string' ? { 'content-type': 'text/html' } : undefined,
    })
  }

  async updatePageContent(
    scope: NotebookScope,
    pageId: string,
    commands: NotebookPagePatch[] | FormData,
  ): Promise<void> {
    if (!(commands instanceof FormData)) {
      if (
        !commands.length ||
        commands.some(
          (command) =>
            !command.target ||
            !['append', 'prepend', 'insert', 'replace', 'delete'].includes(command.action) ||
            (command.action !== 'delete' && typeof command.content !== 'string'),
        )
      ) {
        throw new Error('Expected valid OneNote page patch commands')
      }
    }
    await this.rest.request(`${this.root(scope)}/pages/${encodeId(pageId)}/content`, {
      scope: this.tokenScope,
      method: 'PATCH',
      headers: commands instanceof FormData ? undefined : { 'content-type': 'application/json' },
      body: commands instanceof FormData ? commands : JSON.stringify(commands),
    })
  }

  async deletePage(scope: NotebookScope, pageId: string): Promise<void> {
    await this.rest.request(`${this.root(scope)}/pages/${encodeId(pageId)}`, {
      scope: this.tokenScope,
      method: 'DELETE',
    })
  }

  copyPage(
    scope: NotebookScope,
    pageId: string,
    target: NotebookCopyTarget,
  ): Promise<OperationResult> {
    return this.copyAction(`${this.root(scope)}/pages/${encodeId(pageId)}/copyToSection`, target)
  }

  copySection(
    scope: NotebookScope,
    sectionId: string,
    target: NotebookCopyTarget,
    destination: 'notebook' | 'sectionGroup' = 'notebook',
  ): Promise<OperationResult> {
    return this.copyAction(
      `${this.root(scope)}/sections/${encodeId(sectionId)}/${destination === 'notebook' ? 'copyToNotebook' : 'copyToSectionGroup'}`,
      target,
    )
  }

  async setPageLock(scope: NotebookScope, pageId: string, startDate: string | null): Promise<void> {
    if (this.backend === 'graph') throw new Error('Page locking uses the OneNote service backend')
    if (startDate !== null && Number.isNaN(Date.parse(startDate)))
      throw new Error('Invalid page lock date')
    await this.jsonWrite(`${this.root(scope)}/pages/${encodeId(pageId)}`, 'PATCH', {
      blockEditsInClientStartDate: startDate,
    })
  }

  copyNotebook(
    scope: NotebookScope,
    notebookId: string,
    target: Omit<NotebookCopyTarget, 'id'> = {},
  ): Promise<OperationResult> {
    if (this.backend === 'graph')
      throw new Error('Whole-notebook copying uses the OneNote service backend')
    return this.copyAction(
      `${this.root(scope)}/notebooks/${encodeId(notebookId)}/copyNotebook`,
      target,
    )
  }

  fetchOperation(url: string): Promise<unknown> {
    const validated = validateServiceUrl(url, this.backend === 'graph' ? 'graph' : 'notes')
    if (!validated.pathname.includes('/operations/'))
      throw new Error('Expected a OneNote operation URL')
    return this.rest.request(validated.href, { scope: this.tokenScope })
  }

  private nameBody(name: string): { name: string } | { displayName: string } {
    if (!name.trim()) throw new Error('A name must not be empty')
    return this.backend === 'graph' ? { displayName: name } : { name }
  }

  private jsonWrite<T>(url: string, method: 'POST' | 'PATCH', body: unknown): Promise<T> {
    return this.rest.request(url, {
      scope: this.tokenScope,
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  private async copyAction(
    url: string,
    target: Partial<NotebookCopyTarget>,
  ): Promise<OperationResult> {
    const body: Record<string, string | undefined> = { ...target }
    const response = await this.rest.requestResponse(url, {
      scope: this.tokenScope,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const text = await response.text()
    return {
      status: response.status,
      operationUrl:
        response.headers.get('operation-location') ?? response.headers.get('location') ?? undefined,
      value: text ? (JSON.parse(text) as unknown) : undefined,
    }
  }

  private get tokenScope(): string {
    return this.backend === 'graph' ? SCOPES.graph : SCOPES.notes
  }

  private root(scope: NotebookScope): string {
    if (this.backend === 'onenote') {
      const base = 'https://www.onenote.com/api/v1.0'
      if ('groupId' in scope)
        return `${base}/myOrganization/groups/${encodeId(scope.groupId)}/notes`
      if ('userId' in scope) return `${base}/users/${encodeId(scope.userId)}/notes`
      if ('siteId' in scope) {
        const [, collectionId, siteId] = scope.siteId.split(',')
        if (!collectionId || !siteId)
          throw new Error('Use a Graph composite site ID: hostname,siteCollectionId,siteId')
        return `${base}/myOrganization/siteCollections/${encodeId(collectionId)}/sites/${encodeId(siteId)}/notes`
      }
      return `${base}/me/notes`
    }
    const location =
      'groupId' in scope
        ? `groups/${encodeId(scope.groupId)}`
        : 'userId' in scope
          ? `users/${encodeId(scope.userId)}`
          : 'siteId' in scope
            ? `sites/${encodeId(scope.siteId)}`
            : 'me'
    return `${graphRoot}/${location}/onenote`
  }
}

export class TeamsClassNotebooksAPI {
  constructor(private readonly rest: RestClient) {}

  list(groupId: string, options?: NotebookListOptions): Promise<ODataCollection<ClassNotebook>> {
    return collect(
      this.rest,
      `${this.root(groupId)}/classnotebooks`,
      SCOPES.notes,
      listQuery(options),
    )
  }

  fetch(groupId: string, notebookId: string): Promise<ClassNotebook> {
    return this.rest.request(`${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}`, {
      scope: SCOPES.notes,
    })
  }

  fetchType(groupId: string): Promise<{ value: string }> {
    return this.rest.request(`${this.root(groupId)}/notebooks/GetNotebookType`, {
      scope: SCOPES.notes,
    })
  }

  fetchDefault(groupId: string): Promise<Notebook> {
    return this.rest.request(`${this.root(groupId)}/notebooks/getDefaultNotebook`, {
      scope: SCOPES.notes,
    })
  }

  fetchCollaborationSpaceId(groupId: string, initial = true): Promise<{ value: string }> {
    return this.rest.request(`${this.root(groupId)}/classnotebooks/GetCollaborationSpaceId`, {
      scope: SCOPES.notes,
      method: 'POST',
      query: { initial },
    })
  }

  listCollaborationSections(
    groupId: string,
    notebookId: string,
    sectionGroupId: string,
    teamsChannelId?: string,
  ): Promise<ODataCollection<NotebookSection>> {
    return collect(
      this.rest,
      `${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}/sectionGroups/${encodeId(sectionGroupId)}/sections`,
      SCOPES.notes,
      { teamsChannelId },
    )
  }

  fetchWopiProperties(groupId: string): Promise<NotebookWopiProperties> {
    return this.rest.request(
      `${this.root(groupId)}/classnotebooks/getWopiProperties(frameAction='View')`,
      { scope: SCOPES.notes },
    )
  }

  create(groupId: string, options: CreateClassNotebook, locale?: string): Promise<ClassNotebook> {
    if (
      !options.name?.trim() ||
      !Array.isArray(options.studentSections) ||
      !Array.isArray(options.teachers) ||
      !Array.isArray(options.students)
    ) {
      throw new Error('Expected name, studentSections, teachers, and students')
    }
    return this.rest.request(`${this.root(groupId)}/classnotebooks`, {
      scope: SCOPES.notes,
      method: 'POST',
      query: { omkt: locale, sendemail: false },
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(options),
    })
  }

  async addTeacherOnlySectionGroup(groupId: string, notebookId: string): Promise<void> {
    await this.write(`${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}`, 'PATCH', {
      hasTeacherOnlySectionGroup: true,
    })
  }

  async delete(groupId: string, notebookId: string): Promise<void> {
    await this.write(`${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}`, 'DELETE')
  }

  async addMembers(
    groupId: string,
    notebookId: string,
    role: 'students' | 'teachers',
    principals: NotebookPrincipal[],
  ): Promise<unknown[]> {
    if (
      !['students', 'teachers'].includes(role) ||
      !principals.length ||
      principals.some(
        (principal) => !principal.id || !['Person', 'Group'].includes(principal.principalType),
      )
    )
      throw new Error('Expected valid notebook principals')
    const results: unknown[] = []
    for (const principal of principals)
      results.push(
        await this.write(
          `${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}/${role}`,
          'POST',
          principal,
        ),
      )
    return results
  }

  async removeMember(
    groupId: string,
    notebookId: string,
    role: 'students' | 'teachers',
    principalId: string,
  ): Promise<void> {
    if (!['students', 'teachers'].includes(role)) throw new Error('Invalid notebook member role')
    await this.write(
      `${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}/${role}/${encodeId(principalId)}`,
      'DELETE',
    )
  }

  copySectionsToContentLibrary(
    groupId: string,
    notebookId: string,
    sectionIds: string[],
  ): Promise<unknown> {
    if (!sectionIds.length || sectionIds.some((id) => !id.trim()))
      throw new Error('Expected section IDs')
    return this.write(
      `${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}/copySectionsToContentLibrary`,
      'POST',
      { sectionIds },
    )
  }

  distributePage(
    groupId: string,
    notebookId: string,
    pageId: string,
    options: DistributeNotebookPage,
  ): Promise<{ value: string }> {
    if (
      !options.studentUserPrincipalName ||
      !options.targetSectionName ||
      Number.isNaN(Date.parse(options.lockStartDate))
    )
      throw new Error('Expected a student, target section, and lock start date')
    const id = encodeURIComponent(pageId.replace(/'/g, "''")).replace(/'/g, '%27')
    return this.write(
      `${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}/pages('${id}')/Microsoft.OneNote.Api.DistributePageToStudent`,
      'POST',
      options,
    )
  }

  async syncMembership(groupId: string): Promise<void> {
    await this.write(
      `${this.root(groupId)}/classnotebooks/Microsoft.OneNote.Api.UpdateMembership`,
      'POST',
    )
  }

  async repair(groupId: string, notebookId: string): Promise<void> {
    await this.write(
      `${this.root(groupId)}/classnotebooks/${encodeId(notebookId)}/Microsoft.OneNote.Api.RepairNotebook`,
      'POST',
    )
  }

  private write<T>(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<T> {
    return this.rest.request(url, {
      scope: SCOPES.notes,
      method,
      headers: body === undefined ? undefined : { 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  }

  private root(groupId: string): string {
    return `https://www.onenote.com/api/v1.0/myOrganization/groups/${encodeId(groupId)}/notes`
  }
}
