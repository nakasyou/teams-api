import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TeamsClient } from '../src/client/TeamsClient'
import { SCOPES } from '../src/rest/constants'
import { executeContentCommand, exportNotebook, saveResponse } from '../src/cli/content'
import { parseArgs } from '../src/cli/args'

const scopes: string[] = []
const client = () =>
  new TeamsClient({
    async getTokenFromScope(scope) {
      scopes.push(scope)
      return 'test-token'
    },
  })
const json = (data: unknown) => Response.json(data)
const mocks: { mockRestore(): void }[] = []
const directories: string[] = []
function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) =>
        handler(
          new URL(
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
          ),
          init,
        ),
      { preconnect: fetch.preconnect },
    ),
  )
  mocks.push(mock)
  return mock
}
async function temp() {
  const path = await mkdtemp(join(tmpdir(), 'teams-content-test-'))
  directories.push(path)
  return path
}
afterEach(async () => {
  for (const mock of mocks.splice(0)) mock.mockRestore()
  scopes.length = 0
  await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

describe('files', () => {
  test('follows pages and encodes IDs without reusing initial query', async () => {
    const calls: URL[] = []
    mockFetch((url, init) => {
      calls.push(url)
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token')
      if (url.searchParams.has('$skiptoken'))
        return json({ value: [{ id: 'second', name: '日本語.pdf' }] })
      return json({
        value: [{ id: 'first', name: 'folder', folder: {} }],
        '@odata.nextLink':
          'https://graph.microsoft.com/v1.0/drives/a%2Fb/items/x%23y/children?$skiptoken=next',
      })
    })
    const result = await client().teams.files.listChildren('a/b', 'x#y', { top: 1 })
    expect(result.value).toHaveLength(2)
    expect(calls[0]?.pathname).toBe('/v1.0/drives/a%2Fb/items/x%23y/children')
    expect(calls[1]?.searchParams.has('$top')).toBe(false)
    expect(scopes).toEqual([SCOPES.graph, SCOPES.graph])
  })
  test('rejects cross-origin and repeated pagination links', async () => {
    const mock = mockFetch(() =>
      json({ value: [], '@odata.nextLink': 'https://evil.example/steal' }),
    )
    await expect(client().teams.files.listChildren('drive')).rejects.toThrow(
      'outside the API origin',
    )
    expect(mock).toHaveBeenCalledTimes(1)
    mock.mockImplementation(
      Object.assign(
        async () =>
          json({
            value: [],
            '@odata.nextLink': 'https://graph.microsoft.com/v1.0/drives/drive/root/children',
          }),
        { preconnect: fetch.preconnect },
      ),
    )
    await expect(client().teams.files.listChildren('drive')).rejects.toThrow('Repeated pagination')
  })
  test('resolves unicode SharePoint links and authenticates downloadUrlNoAuth', async () => {
    const fileUrl = 'https://school.sharepoint.com/sites/class/Shared%20Documents/日本語.pdf'
    mockFetch((url, init) => {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer test-token')
      if (url.pathname.includes('/shares/')) {
        const share = url.pathname.split('/shares/')[1]!.split('/')[0]!
        expect(Buffer.from(share.slice(2), 'base64url').toString()).toBe(new URL(fileUrl).href)
        return json({
          id: 'file',
          name: '日本語.pdf',
          file: {},
          '@content.downloadUrlNoAuth':
            'https://school.sharepoint.com/sites/class/_layouts/15/download.aspx?UniqueId=file',
        })
      }
      return new Response(new Uint8Array([0, 255, 1]))
    })
    const response = await client().teams.files.download({ url: fileUrl })
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([0, 255, 1])
    expect(scopes).toEqual(
      Array(2).fill('https://school.sharepoint.com/.default openid profile offline_access'),
    )
  })
  test('never sends bearer tokens to signed content hosts', async () => {
    mockFetch((url, init) => {
      if (url.hostname === 'graph.microsoft.com')
        return json({
          id: 'file',
          name: 'file.bin',
          file: {},
          '@microsoft.graph.downloadUrl': 'https://download.example/file',
        })
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      if (url.pathname === '/file')
        return new Response(null, { status: 302, headers: { location: '/next' } })
      return new Response('content')
    })
    expect(await (await client().teams.files.download({ driveId: 'd', itemId: 'i' })).text()).toBe(
      'content',
    )
  })
  test('handles authenticated content redirects without forwarding tokens', async () => {
    mockFetch((url, init) => {
      if (url.pathname.endsWith('/items/i')) return json({ id: 'i', name: 'file', file: {} })
      if (url.hostname === 'graph.microsoft.com')
        return new Response(null, {
          status: 302,
          headers: { location: 'https://download.example/file' },
        })
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      return new Response('file')
    })
    expect(await (await client().teams.files.download({ driveId: 'd', itemId: 'i' })).text()).toBe(
      'file',
    )
  })
  test('blocks restricted files, folders and invalid service URLs', async () => {
    mockFetch(() =>
      json({ id: 'file', name: 'restricted', currentUserRole: { blocksDownload: true } }),
    )
    await expect(client().teams.files.download({ driveId: 'd', itemId: 'i' })).rejects.toThrow(
      'blocked',
    )
    expect(() => client().teams.files.fetchShared('https://evil.example/file')).toThrow(
      'HTTPS sharepoint',
    )
    expect(() => client().teams.files.fetchShared('http://school.sharepoint.com/file')).toThrow(
      'HTTPS sharepoint',
    )
  })
  test('reads SharePoint CAML pages and escapes apostrophes in library paths', async () => {
    const requests: { url: URL; body: { parameters: { Paging?: string; ViewXml: string } } }[] = []
    mockFetch((url, init) => {
      const body = JSON.parse(String(init?.body)) as {
        parameters: { Paging?: string; ViewXml: string }
      }
      requests.push({ url, body })
      const row = {
        UniqueId: '{id}',
        FileLeafRef: '日本語.pdf',
        FileRef: "/sites/class/Teacher's Files/日本語.pdf",
        FSObjType: '0',
        File_x0020_Size: '20',
      }
      return json(
        body.parameters.Paging
          ? { Row: [] }
          : { ListData: { Row: [row], NextHref: '?Paged=TRUE&p_ID=1' } },
      )
    })
    const result = await client().teams.files.listSharePointFiles(
      'https://school.sharepoint.com/sites/class',
      "/sites/class/Teacher's Files",
      { recursive: true, pageSize: 1 },
    )
    expect(result.value[0]?.name).toBe('日本語.pdf')
    expect(result.value[0]?.size).toBe(20)
    expect(requests[0]?.url.searchParams.get('@a1')).toBe("'/sites/class/Teacher''s Files'")
    expect(requests[0]?.body.parameters.ViewXml).toContain('Scope="RecursiveAll"')
    expect(requests[1]?.body.parameters.Paging).toBe('Paged=TRUE&p_ID=1')
  })
})

describe('notebooks', () => {
  test('uses captured OneNote service for Class Notebook requests', async () => {
    const requests: { url: URL; method: string }[] = []
    mockFetch((url, init) => {
      requests.push({ url, method: init?.method ?? 'GET' })
      return json({ value: url.pathname.endsWith('/sections') ? [] : 'id' })
    })
    const api = client().teams.classNotebooks
    await api.fetchType('group')
    await api.fetchDefault('group')
    await api.fetchCollaborationSpaceId('group', false)
    await api.listCollaborationSections('group', 'notebook', 'sectionGroup', '19:channel')

    await api.fetchWopiProperties('group')
    expect(requests[0]?.url.pathname).toEndWith('/notebooks/GetNotebookType')
    expect(requests[2]?.method).toBe('POST')
    expect(requests[2]?.url.searchParams.get('initial')).toBe('false')
    expect(requests[3]?.url.searchParams.get('teamsChannelId')).toBe('19:channel')
    expect(requests[4]?.url.pathname).toEndWith("getWopiProperties(frameAction='View')")
    expect(scopes.every((scope) => scope === SCOPES.notes)).toBe(true)
  })
  test('exports nested sections, HTML, and image/file resources', async () => {
    const directory = await temp()
    mockFetch((url) => {
      const path = url.pathname
      if (path.endsWith('/notebooks/n')) return json({ id: 'n', displayName: 'Notebook' })
      if (path.endsWith('/notebooks/n/sections')) return json({ value: [] })
      if (path.endsWith('/notebooks/n/sectionGroups'))
        return json({ value: [{ id: 'g', displayName: 'Group' }] })
      if (path.endsWith('/sectionGroups/g/sections'))
        return json({ value: [{ id: 's', displayName: 'Section' }] })
      if (path.endsWith('/sectionGroups/g/sectionGroups')) return json({ value: [] })
      if (path.endsWith('/sections/s/pages'))
        return json({ value: [{ id: 'p', title: '日本語 / title' }] })
      if (path.endsWith('/pages/p/content'))
        return new Response(
          '<html><img src="https://www.onenote.com/api/v1.0/me/notes/resources/r/$value?x=1&amp;y=2"><object data="https://graph.microsoft.com/v1.0/me/onenote/resources/f/content"></object></html>',
        )
      if (path.includes('/resources/')) return new Response(new Uint8Array([1, 2, 3]))
      throw new Error(`Unexpected path ${path}`)
    })
    const result = await exportNotebook(client(), { groupId: 'group' }, 'n', directory)
    expect(result).toMatchObject({ pages: 1, resources: 2 })
    const sectionPath = join(directory, 'Group-g', 'Section-s')
    const pagePath = (await readdir(sectionPath)).find((name) => name.endsWith('.html'))!
    const html = await readFile(join(sectionPath, pagePath), 'utf8')
    expect(html).toContain('src="resource-1"')
    expect(html).toContain('data="resource-2"')
    expect(html).not.toContain('https://www.onenote.com')
    expect(JSON.parse(await readFile(join(directory, 'index.json'), 'utf8')).pages).toHaveLength(1)
  })
  test('rejects cycles in notebook hierarchy', async () => {
    mockFetch((url) => {
      if (url.pathname.endsWith('/notebooks/n')) return json({ id: 'n' })
      if (url.pathname.endsWith('/sections')) return json({ value: [] })
      return json({ value: [{ id: 'g' }] })
    })
    await expect(client().teams.notebooks.fetchTree({ me: true }, 'n')).rejects.toThrow(
      'Repeated section group',
    )
  })
})

describe('saving and CLI', () => {
  test('streams binary content and never overwrites an existing file', async () => {
    const path = join(await temp(), 'file.bin')
    const response = new Response(new Uint8Array([0, 255, 1, 128]))
    expect(await saveResponse(response, path)).toMatchObject({ bytes: 4 })
    await expect(saveResponse(new Response('replacement'), path)).rejects.toThrow()
    expect([...(await readFile(path))]).toEqual([0, 255, 1, 128])
  })
  test('removes incomplete downloads', async () => {
    const directory = await temp()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array([1]))
        controller.error(new Error('connection lost'))
      },
    })
    await expect(
      saveResponse(new Response(stream), join(directory, 'partial.bin')),
    ).rejects.toThrow('connection lost')
    expect(await readdir(directory)).toEqual([])
  })
  test('resolves Teams thread IDs to group IDs and parses notebook arguments', async () => {
    mockFetch((url) =>
      url.pathname.endsWith('/users/me') ? json({ teams: [] }) : json({ value: [] }),
    )
    const c = client()
    spyOn(c.teams.users.me, 'fetch').mockResolvedValue({
      teams: [{ id: '19:team', teamSiteInformation: { groupId: 'group' } }],
    } as never)
    const result = await executeContentCommand(parseArgs(['notebooks', 'list', '19:team']), c)
    expect(result).toEqual({ command: 'notebooks', data: { value: [] } })
    expect(parseArgs(['files', 'download', 'url', '--output', 'file']).command).toBe('files')
  })
  test('rejects unsafe remote filenames before writing outside output directory', async () => {
    mockFetch(() => json({ value: [{ id: 'file', name: '../escape', file: {} }] }))
    const directory = await temp()
    await expect(
      executeContentCommand(
        parseArgs(['files', 'download-folder', 'd', 'root', '--output', directory]),
        client(),
      ),
    ).rejects.toThrow('Unsafe')
    expect(await readdir(directory)).toEqual([])
  })
})

describe('content mutations', () => {
  test('uploads binary content and creates folders with explicit conflict handling', async () => {
    mockFetch(async (url, init) => {
      if (init?.method === 'PUT') {
        expect(url.pathname).toEndWith(
          '/root:/日本語.bin:/content'.replace('日本語', encodeURIComponent('日本語')),
        )
        expect(url.searchParams.get('@microsoft.graph.conflictBehavior')).toBe('fail')
        expect([...new Uint8Array(await (init.body as Blob).arrayBuffer())]).toEqual([0, 255])
      } else {
        expect(JSON.parse(String(init?.body))).toEqual({
          name: 'Folder',
          folder: {},
          '@microsoft.graph.conflictBehavior': 'rename',
        })
      }
      return json({ id: 'new', name: 'file' })
    })
    await client().teams.files.upload(
      'd',
      'root',
      '日本語.bin',
      new Blob([new Uint8Array([0, 255])]),
    )
    await client().teams.files.createFolder('d', 'root', 'Folder', 'rename')
  })
  test('uploads large files in ordered chunks without bearer tokens on the upload host', async () => {
    const size = 4 * 1024 * 1024 + 13
    const chunkSize = 320 * 1024
    let accepted = 0
    let chunks = 0
    mockFetch(async (url, init) => {
      if (url.hostname === 'graph.microsoft.com') {
        expect(JSON.parse(String(init?.body)).item['@microsoft.graph.conflictBehavior']).toBe(
          'replace',
        )
        return json({
          uploadUrl: 'https://upload.example/session',
          expirationDateTime: '2099-01-01',
        })
      }
      expect(new Headers(init?.headers).has('authorization')).toBe(false)
      const chunk = init?.body as Blob
      expect(new Headers(init?.headers).get('content-range')).toBe(
        `bytes ${accepted}-${accepted + chunk.size - 1}/${size}`,
      )
      if (accepted + chunk.size < size) expect(chunk.size % (320 * 1024)).toBe(0)
      accepted += chunk.size
      chunks++
      return accepted === size
        ? json({ id: 'finished', name: 'large.bin' })
        : new Response(JSON.stringify({ nextExpectedRanges: [`${accepted}-`] }), { status: 202 })
    })
    const result = await client().teams.files.upload(
      'd',
      'root',
      'large.bin',
      new Blob([new Uint8Array(size)]),
      { chunkSize, conflictBehavior: 'replace' },
    )
    expect(result.id).toBe('finished')
    expect(accepted).toBe(size)
    expect(chunks).toBe(Math.ceil(size / chunkSize))
  })
  test('cancels failed upload sessions and propagates the original failure', async () => {
    let cancelled = false
    mockFetch((url, init) => {
      if (url.hostname === 'graph.microsoft.com')
        return json({ uploadUrl: 'https://upload.example/session' })
      if (init?.method === 'DELETE') {
        cancelled = true
        return new Response(null, { status: 204 })
      }
      return new Response(null, { status: 500 })
    })
    await expect(
      client().teams.files.upload('d', 'root', 'file', new Blob([new Uint8Array(5 * 1024 * 1024)])),
    ).rejects.toThrow('Upload failed: 500')
    expect(cancelled).toBe(true)
  })
  test('updates, moves, copies, replaces, and deletes files, including empty 204 responses', async () => {
    const calls: { method: string; path: string; body: unknown }[] = []
    mockFetch((url, init) => {
      const method = init?.method ?? 'GET'
      calls.push({
        method,
        path: url.pathname,
        body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
      })
      if (method === 'DELETE') {
        expect(new Headers(init?.headers).get('if-match')).toBe('etag')
        return new Response(null, { status: 204 })
      }
      if (url.pathname.endsWith('/copy'))
        return new Response(null, {
          status: 202,
          headers: { location: 'https://graph.microsoft.com/operation' },
        })
      return json({ id: 'i', name: 'new' })
    })
    const files = client().teams.files
    await files.update('d', 'i', { name: 'new', parentReference: { id: 'parent' } })
    await files.replaceContent('d', 'i', new Blob(['updated']))
    expect(await files.copy('d', 'i', { driveId: 'd2', id: 'folder' })).toMatchObject({
      status: 202,
    })
    await files.delete('d', 'i', 'etag')
    expect(calls.map((call) => call.method)).toEqual(['PATCH', 'PUT', 'POST', 'DELETE'])
  })
  test('creates notes, sections, groups and pages, patches HTML, and deletes pages', async () => {
    const calls: { path: string; method: string; body: unknown }[] = []
    mockFetch((url, init) => {
      const body =
        typeof init?.body === 'string' && init.body.startsWith('{')
          ? JSON.parse(init.body)
          : init?.body
      calls.push({ path: url.pathname, method: init?.method ?? 'GET', body })
      if (init?.method === 'PATCH' || init?.method === 'DELETE')
        return new Response(null, { status: 204 })
      return json({ id: 'new', name: 'Note' })
    })
    const api = client().teams.notebooks
    const scope = { groupId: 'g' }
    await api.create(scope, 'Note')
    await api.createSection(scope, { notebookId: 'n' }, 'Section')
    await api.createSectionGroup(scope, { sectionGroupId: 'parent' }, 'Group')
    await api.renameSection(scope, 's', 'Renamed')
    await api.createPage(scope, 's', '<html><title>New</title><body>Hello</body></html>')
    await api.updatePageContent(scope, 'p', [
      { target: 'body', action: 'append', content: '<p>Updated</p>' },
    ])
    await api.deletePage(scope, 'p')
    await api.setPageLock(scope, 'p', null)
    expect(calls[0]?.body).toEqual({ name: 'Note' })
    expect(calls[2]?.path).toEndWith('/sectionGroups/parent/sectionGroups')
    expect(calls[3]?.body).toEqual({ name: 'Renamed' })
    expect(calls[5]?.body).toBe(
      JSON.stringify([{ target: 'body', action: 'append', content: '<p>Updated</p>' }]),
    )
    expect(calls[7]?.body).toEqual({ blockEditsInClientStartDate: null })
  })
  test('copies pages using the documented id and returns operation-location', async () => {
    mockFetch((_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ id: 'section' })
      return new Response(null, {
        status: 202,
        headers: { 'operation-location': 'https://www.onenote.com/api/beta/notes/operations/1' },
      })
    })
    expect(
      await client().teams.notebooks.copyPage({ me: true }, 'p', { id: 'section' }),
    ).toMatchObject({
      status: 202,
      operationUrl: 'https://www.onenote.com/api/beta/notes/operations/1',
    })
  })
  test('manages Class Notebook creation, membership, content distribution and deletion', async () => {
    const calls: { path: string; body: unknown; method: string }[] = []
    mockFetch((url, init) => {
      calls.push({
        path: url.pathname,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
        method: init?.method ?? 'GET',
      })
      if (
        init?.method === 'DELETE' ||
        init?.method === 'PATCH' ||
        url.pathname.includes('UpdateMembership') ||
        url.pathname.includes('RepairNotebook')
      )
        return new Response(null, { status: 204 })
      return json({ id: 'n', value: 'new-page' })
    })
    const api = client().teams.classNotebooks
    await api.create('g', {
      name: 'Class',
      studentSections: ['Work'],
      teachers: [{ id: 'teacher@example.com', principalType: 'Person' }],
      students: [],
    })
    await api.addTeacherOnlySectionGroup('g', 'n')
    await api.addMembers('g', 'n', 'students', [
      { id: 'a@example.com', principalType: 'Person' },
      { id: 'b@example.com', principalType: 'Person' },
    ])
    await api.removeMember('g', 'n', 'students', 'a@example.com')
    await api.copySectionsToContentLibrary('g', 'n', ['s'])
    await api.distributePage('g', 'n', 'p', {
      studentUserPrincipalName: 'b@example.com',
      targetSectionName: 'Work',
      lockStartDate: '2027-01-01T00:00:00Z',
    })
    await api.syncMembership('g')
    await api.repair('g', 'n')
    await api.delete('g', 'n')
    expect(calls[2]?.body).toEqual({ id: 'a@example.com', principalType: 'Person' })
    expect(calls[3]?.body).toEqual({ id: 'b@example.com', principalType: 'Person' })
    expect(calls[6]?.path).toEndWith("/pages('p')/Microsoft.OneNote.Api.DistributePageToStudent")
    expect(calls[9]?.method).toBe('DELETE')
  })
  test('CLI sends HTML and file attachments as multipart OneNote content', async () => {
    const directory = await temp()
    await writeFile(
      join(directory, 'page.html'),
      '<html><body><object data="name:file1"></object></body></html>',
    )
    await writeFile(join(directory, 'attachment.bin'), new Uint8Array([0, 255]))
    mockFetch(async (_url, init) => {
      expect(init?.body).toBeInstanceOf(FormData)
      expect(new Headers(init?.headers).has('content-type')).toBe(false)
      const body = init!.body as FormData
      expect(await (body.get('Presentation') as Blob).text()).toContain('name:file1')
      expect([...new Uint8Array(await (body.get('file1') as Blob).arrayBuffer())]).toEqual([0, 255])
      return json({ id: 'new-page' })
    })
    const result = await executeContentCommand(
      parseArgs([
        'notebooks',
        'create-page',
        'group',
        'section',
        '--input',
        join(directory, 'page.html'),
        '--attachment',
        `file1=${join(directory, 'attachment.bin')}`,
      ]),
      client(),
    )
    expect(result.data).toEqual({ id: 'new-page' })
  })
  test('CLI validates patch commands before making a request', async () => {
    const directory = await temp()
    await writeFile(
      join(directory, 'commands.json'),
      JSON.stringify([{ target: 'body', action: 'invalid' }]),
    )
    const mock = mockFetch(() => {
      throw new Error('Must not request')
    })
    await expect(
      executeContentCommand(
        parseArgs([
          'notebooks',
          'patch-page',
          'group',
          'page',
          '--input',
          join(directory, 'commands.json'),
        ]),
        client(),
      ),
    ).rejects.toThrow('Invalid page patch action')
    expect(mock).not.toHaveBeenCalled()
  })
})

test('CLI creates nested section groups and copies sections without redundant parent arguments', async () => {
  const requests: { path: string; body: unknown }[] = []
  mockFetch((url, init) => {
    requests.push({ path: url.pathname, body: JSON.parse(String(init?.body)) })
    return url.pathname.includes('/copyTo')
      ? new Response(null, { status: 202 })
      : json({ id: 'new' })
  })
  await executeContentCommand(
    parseArgs(['notebooks', 'create-section', 'group', 'Notes', '--section-group', 'parent']),
    client(),
  )
  await executeContentCommand(
    parseArgs([
      'notebooks',
      'create-section-group',
      'group',
      'Nested',
      '--section-group',
      'parent',
    ]),
    client(),
  )
  await executeContentCommand(
    parseArgs(['notebooks', 'copy-section', 'group', 'section', '--section-group', 'target']),
    client(),
  )
  expect(requests[0]?.path).toEndWith('/sectionGroups/parent/sections')
  expect(requests[0]?.body).toEqual({ name: 'Notes' })
  expect(requests[1]?.path).toEndWith('/sectionGroups/parent/sectionGroups')
  expect(requests[2]?.body).toEqual({ id: 'target' })
})

test('copies whole notebooks and validates operation polling URLs', async () => {
  mockFetch((url, init) => {
    if (init?.method === 'POST') {
      expect(url.pathname).toEndWith('/notebooks/n/copyNotebook')
      expect(JSON.parse(String(init.body))).toEqual({ renameAs: 'Copy' })
      return new Response(null, {
        status: 202,
        headers: { 'operation-location': 'https://www.onenote.com/api/beta/me/notes/operations/1' },
      })
    }
    return json({ status: 'completed' })
  })
  const api = client().teams.notebooks
  const operation = await api.copyNotebook({ me: true }, 'n', { renameAs: 'Copy' })
  expect(await api.fetchOperation(operation.operationUrl!)).toEqual({ status: 'completed' })
  expect(() => api.fetchOperation('https://evil.example/operations/1')).toThrow('HTTPS notes')
})
