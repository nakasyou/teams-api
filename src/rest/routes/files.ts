import type { RestClient } from '../RestClient'
import { SCOPES } from '../constants'
import type {
  ConflictBehavior,
  DriveItemUpdate,
  OperationResult,
  UploadOptions,
  UploadSession,
  Drive,
  DriveItem,
  FileListOptions,
  FileReference,
  ODataCollection,
  SharePointFileList,
  SharePointFileListOptions,
} from '../../types/files'
import {
  collect,
  encodeId,
  fetchDownload,
  graphRoot,
  listQuery,
  validateServiceUrl,
} from './content'

export class TeamsFilesAPI {
  constructor(private readonly rest: RestClient) {}

  listDrives(groupId = 'me'): Promise<ODataCollection<Drive>> {
    const location =
      groupId === 'me'
        ? 'me'
        : groupId.startsWith('user:')
          ? `users/${encodeId(groupId.slice(5))}`
          : `groups/${encodeId(groupId)}`
    return collect(this.rest, `${graphRoot}/${location}/drives`, SCOPES.graph)
  }

  fetchChannelFolder(groupId: string, channelId: string): Promise<DriveItem> {
    return this.rest.request(
      `${graphRoot}/teams/${encodeId(groupId)}/channels/${encodeId(channelId)}/filesFolder`,
      { scope: SCOPES.graph },
    )
  }

  async listChannelFiles(
    groupId: string,
    channelId: string,
    options?: FileListOptions,
  ): Promise<ODataCollection<DriveItem>> {
    const folder = await this.fetchChannelFolder(groupId, channelId)
    const driveId = folder.parentReference?.driveId
    if (!driveId) throw new Error('Channel folder has no drive ID')
    return this.listChildren(driveId, folder.id, options)
  }

  listChildren(
    driveId: string,
    itemId = 'root',
    options?: FileListOptions,
  ): Promise<ODataCollection<DriveItem>> {
    const path = itemId === 'root' ? 'root' : `items/${encodeId(itemId)}`
    return collect(
      this.rest,
      `${graphRoot}/drives/${encodeId(driveId)}/${path}/children`,
      SCOPES.graph,
      listQuery(options),
    )
  }

  fetch(driveId: string, itemId: string): Promise<DriveItem> {
    return this.rest.request(`${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(itemId)}`, {
      scope: SCOPES.graph,
    })
  }

  fetchByPath(driveId: string, path: string): Promise<DriveItem> {
    const encodedPath = path.split('/').filter(Boolean).map(encodeURIComponent).join('/')
    return this.rest.request(
      `${graphRoot}/drives/${encodeId(driveId)}/root${encodedPath ? `:/${encodedPath}` : ''}`,
      { scope: SCOPES.graph },
    )
  }

  search(driveId: string, query: string): Promise<ODataCollection<DriveItem>> {
    const escaped = encodeURIComponent(query.replace(/'/g, "''")).replace(/'/g, '%27')
    return collect(
      this.rest,
      `${graphRoot}/drives/${encodeId(driveId)}/root/search(q='${escaped}')`,
      SCOPES.graph,
    )
  }

  fetchShared(url: string): Promise<DriveItem> {
    const parsed = validateServiceUrl(url, 'sharepoint')
    const bytes = new TextEncoder().encode(parsed.href)
    const shareId = `u!${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '')}`
    return this.rest.request(`${parsed.origin}/_api/v2.0/shares/${shareId}/driveItem`, {
      scope: this.sharePointScope(parsed),
      query: {
        $select:
          'id,name,size,webUrl,parentReference,file,folder,package,currentUserRole,sharepointIds,@content.downloadUrl,@content.downloadUrlNoAuth',
      },
    })
  }

  fetchSharePointItem(siteUrl: string, uniqueId: string): Promise<DriveItem> {
    const site = validateServiceUrl(siteUrl, 'sharepoint')
    const root = `${site.origin}${site.pathname.replace(/\/$/, '')}`
    return this.rest.request(
      `${root}/_api/v2.0/sites/root/items/${encodeId(uniqueId.replace(/[{}]/g, ''))}/driveItem`,
      {
        scope: this.sharePointScope(site),
        query: {
          $select:
            'id,name,size,webUrl,parentReference,file,folder,package,currentUserRole,sharepointIds,@content.downloadUrl,@content.downloadUrlNoAuth',
        },
      },
    )
  }

  async resolve(reference: FileReference): Promise<DriveItem> {
    if ('url' in reference) return this.fetchShared(reference.url)
    if ('siteUrl' in reference)
      return this.fetchSharePointItem(reference.siteUrl, reference.uniqueId)
    return this.fetch(reference.driveId, reference.itemId)
  }

  async download(reference: FileReference): Promise<Response> {
    const item = await this.resolve(reference)
    if (item.currentUserRole?.blocksDownload)
      throw new Error('Downloading this file is blocked by its access policy')
    if (item.folder || item.package)
      throw new Error('Download individual files; use notebooks for OneNote packages')
    const direct = item['@microsoft.graph.downloadUrl']
    if (direct) return fetchDownload(direct)
    // SharePoint downloadUrlNoAuth omits tempauth; it still needs a bearer token.
    const authenticated = item['@content.downloadUrlNoAuth'] ?? item['@content.downloadUrl']
    if (authenticated) {
      const url = validateServiceUrl(authenticated, 'sharepoint')
      const expected =
        'url' in reference
          ? new URL(reference.url).origin
          : 'siteUrl' in reference
            ? new URL(reference.siteUrl).origin
            : item.sharepointIds?.siteUrl
              ? new URL(item.sharepointIds.siteUrl).origin
              : undefined
      if (url.origin !== expected)
        throw new Error('Download URL does not match the SharePoint origin')
      return this.contentResponse(url.href, this.sharePointScope(url))
    }
    const driveId = 'driveId' in reference ? reference.driveId : item.parentReference?.driveId
    if (!driveId) throw new Error('File has no download URL or drive ID')
    return this.contentResponse(
      `${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(item.id)}/content`,
      SCOPES.graph,
    )
  }

  async thumbnail(reference: FileReference, size = 'large'): Promise<Response> {
    if (!/^(small|medium|large|c\d+x\d+)$/.test(size)) throw new Error('Invalid thumbnail size')
    const item = await this.resolve(reference)
    const driveId = 'driveId' in reference ? reference.driveId : item.parentReference?.driveId
    if (!driveId) throw new Error('File has no drive ID')
    return this.contentResponse(
      `${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(item.id)}/thumbnails/0/${size}/content`,
      SCOPES.graph,
    )
  }

  async listSharePointFiles(
    siteUrl: string,
    libraryPath: string,
    options?: SharePointFileListOptions,
  ): Promise<SharePointFileList> {
    const site = validateServiceUrl(siteUrl, 'sharepoint')
    const pageSize = options?.pageSize ?? 200
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 5000)
      throw new Error('pageSize must be between 1 and 5000')
    if (!libraryPath.startsWith('/') || (options?.folder && !options.folder.startsWith('/')))
      throw new Error('Library and folder paths must be server-relative paths')
    const root = `${site.origin}${site.pathname.replace(/\/$/, '')}`
    const endpoint = `${root}/_api/web/GetListUsingPath(DecodedUrl=@a1)/RenderListDataAsStream`
    type Row = {
      UniqueId: string
      FileLeafRef: string
      FileRef: string
      FSObjType: string
      File_x0020_Size?: string
      Modified?: string
      '.spItemUrl'?: string
    }
    type ListData = { Row?: Row[]; NextHref?: string }
    const value: SharePointFileList['value'] = []
    const seen = new Set<string>()
    let paging: string | undefined
    do {
      const response: { ListData?: ListData } & ListData = await this.rest.request(endpoint, {
        scope: this.sharePointScope(site),
        method: 'POST',
        headers: {
          'content-type': 'application/json;odata=nometadata',
          accept: 'application/json;odata=nometadata',
        },
        query: {
          '@a1': `'${libraryPath.replace(/'/g, "''")}'`,
          RootFolder: options?.folder ?? libraryPath,
        },
        body: JSON.stringify({
          parameters: {
            RenderOptions: 2,
            AddRequiredFields: true,
            ViewXml: `<View${options?.recursive ? ' Scope="RecursiveAll"' : ''}><ViewFields><FieldRef Name="FileLeafRef"/><FieldRef Name="FileRef"/><FieldRef Name="FSObjType"/><FieldRef Name="UniqueId"/><FieldRef Name="File_x0020_Size"/><FieldRef Name="Modified"/></ViewFields><RowLimit Paged="TRUE">${pageSize}</RowLimit></View>`,
            ...(paging ? { Paging: paging } : {}),
          },
        }),
      })
      const data = response.ListData ?? response
      if (!Array.isArray(data.Row)) throw new Error('Expected SharePoint list rows')
      for (const row of data.Row) {
        if (!row.FileRef || !row.UniqueId) throw new Error('SharePoint row has no file path or ID')
        value.push({
          id: row.UniqueId.replace(/[{}]/g, ''),
          name: row.FileLeafRef,
          serverRelativeUrl: row.FileRef,
          webUrl: new URL(row.FileRef, site.origin).href,
          isFolder: row.FSObjType === '1',
          size: row.File_x0020_Size ? Number(row.File_x0020_Size) : undefined,
          modified: row.Modified,
          driveItemUrl: row['.spItemUrl'],
        })
      }
      paging = data.NextHref?.replace(/^\?/, '') || undefined
      if (paging && seen.has(paging)) throw new Error('Repeated SharePoint paging token')
      if (paging) seen.add(paging)
    } while (paging)
    return { value }
  }

  async upload(
    driveId: string,
    parentId: string,
    name: string,
    content: Blob,
    options?: UploadOptions,
  ): Promise<DriveItem> {
    this.validateName(name)
    const chunkSize = options?.chunkSize ?? 10 * 1024 * 1024
    if (
      !Number.isInteger(chunkSize) ||
      chunkSize < 320 * 1024 ||
      chunkSize >= 60 * 1024 * 1024 ||
      chunkSize % (320 * 1024)
    ) {
      throw new Error('chunkSize must be a multiple of 320 KiB below 60 MiB')
    }
    const parent = parentId === 'root' ? 'root' : `items/${encodeId(parentId)}`
    const target = `${graphRoot}/drives/${encodeId(driveId)}/${parent}:/${encodeURIComponent(name)}`
    const conflict = options?.conflictBehavior ?? 'fail'
    if (!['fail', 'replace', 'rename'].includes(conflict))
      throw new Error('Invalid conflict behavior')
    if (content.size <= 4 * 1024 * 1024) {
      return this.rest.request(`${target}:/content`, {
        scope: SCOPES.graph,
        method: 'PUT',
        headers: {
          'content-type': content.type || 'application/octet-stream',
          ...(options?.ifMatch ? { 'if-match': options.ifMatch } : {}),
        },
        query: { '@microsoft.graph.conflictBehavior': conflict },
        body: content,
      })
    }
    const session = await this.createUploadSession(driveId, parentId, name, options)
    try {
      let start = 0
      while (start < content.size) {
        const end = Math.min(start + chunkSize, content.size)
        const url = this.uploadUrl(session.uploadUrl)
        const response = await fetch(url, {
          method: 'PUT',
          redirect: 'error',
          headers: {
            'content-type': 'application/octet-stream',
            'content-range': `bytes ${start}-${end - 1}/${content.size}`,
          },
          body: content.slice(start, end),
        })
        if (!response.ok)
          throw new Error(`Upload failed: ${response.status} ${response.statusText}`)
        if (response.status === 200 || response.status === 201)
          return (await response.json()) as DriveItem
        if (response.status !== 202) throw new Error(`Unexpected upload status: ${response.status}`)
        const progress = (await response.json()) as { nextExpectedRanges?: string[] }
        const next = Number(progress.nextExpectedRanges?.[0]?.split('-')[0])
        if (!Number.isInteger(next) || next <= start || next > content.size)
          throw new Error('Invalid upload progress')
        start = next
      }
      throw new Error('Upload ended without a completed drive item')
    } catch (error) {
      await this.cancelUpload(session.uploadUrl).catch(() => {})
      throw error
    }
  }

  createUploadSession(
    driveId: string,
    parentId: string,
    name: string,
    options?: UploadOptions,
  ): Promise<UploadSession> {
    this.validateName(name)
    const parent = parentId === 'root' ? 'root' : `items/${encodeId(parentId)}`
    return this.rest.request(
      `${graphRoot}/drives/${encodeId(driveId)}/${parent}:/${encodeURIComponent(name)}:/createUploadSession`,
      {
        scope: SCOPES.graph,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(options?.ifMatch ? { 'if-match': options.ifMatch } : {}),
        },
        body: JSON.stringify({
          item: { name, '@microsoft.graph.conflictBehavior': options?.conflictBehavior ?? 'fail' },
        }),
      },
    )
  }

  async cancelUpload(uploadUrl: string): Promise<void> {
    const response = await fetch(this.uploadUrl(uploadUrl), { method: 'DELETE', redirect: 'error' })
    if (!response.ok) throw new Error(`Failed to cancel upload: ${response.status}`)
  }

  createFolder(
    driveId: string,
    parentId: string,
    name: string,
    conflictBehavior: ConflictBehavior = 'fail',
  ): Promise<DriveItem> {
    this.validateName(name)
    const parent = parentId === 'root' ? 'root' : `items/${encodeId(parentId)}`
    return this.rest.request(`${graphRoot}/drives/${encodeId(driveId)}/${parent}/children`, {
      scope: SCOPES.graph,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name,
        folder: {},
        '@microsoft.graph.conflictBehavior': conflictBehavior,
      }),
    })
  }

  update(
    driveId: string,
    itemId: string,
    update: DriveItemUpdate,
    ifMatch?: string,
  ): Promise<DriveItem> {
    if (update.name !== undefined) this.validateName(update.name)
    return this.rest.request(`${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(itemId)}`, {
      scope: SCOPES.graph,
      method: 'PATCH',
      headers: { 'content-type': 'application/json', ...(ifMatch ? { 'if-match': ifMatch } : {}) },
      body: JSON.stringify(update),
    })
  }

  async replaceContent(
    driveId: string,
    itemId: string,
    content: Blob,
    ifMatch?: string,
  ): Promise<DriveItem> {
    if (content.size > 250 * 1024 * 1024)
      throw new Error('Use upload with an upload session for files larger than 250 MiB')
    return this.rest.request(
      `${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(itemId)}/content`,
      {
        scope: SCOPES.graph,
        method: 'PUT',
        headers: {
          'content-type': content.type || 'application/octet-stream',
          ...(ifMatch ? { 'if-match': ifMatch } : {}),
        },
        body: content,
      },
    )
  }

  async delete(driveId: string, itemId: string, ifMatch?: string): Promise<void> {
    await this.rest.request(`${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(itemId)}`, {
      scope: SCOPES.graph,
      method: 'DELETE',
      headers: ifMatch ? { 'if-match': ifMatch } : undefined,
    })
  }

  async copy(
    driveId: string,
    itemId: string,
    parentReference: { driveId: string; id: string },
    name?: string,
  ): Promise<OperationResult> {
    if (name !== undefined) this.validateName(name)
    const response = await this.rest.requestResponse(
      `${graphRoot}/drives/${encodeId(driveId)}/items/${encodeId(itemId)}/copy`,
      {
        scope: SCOPES.graph,
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentReference, name }),
      },
    )
    return { status: response.status, operationUrl: response.headers.get('location') ?? undefined }
  }

  private uploadUrl(input: string): URL {
    const url = new URL(input)
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error('Expected an HTTPS upload URL')
    return url
  }

  private validateName(name: string): void {
    if (!name.trim() || name === '.' || name === '..' || /[\\/\x00]/.test(name))
      throw new Error('Invalid file or folder name')
  }

  private sharePointScope(url: URL): string {
    return `${url.origin}/.default openid profile offline_access`
  }

  private async contentResponse(url: string, scope: string): Promise<Response> {
    const response = await this.rest.requestResponse(url, { scope, redirect: 'manual' })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('Content redirect has no location')
      await response.body?.cancel()
      return fetchDownload(new URL(location, url).href)
    }
    return response
  }
}
