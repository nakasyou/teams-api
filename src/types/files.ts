export type ODataCollection<T> = {
  value: T[]
  '@odata.nextLink'?: string
}

export type Drive = {
  id: string
  name?: string
  driveType?: string
  webUrl?: string
}

export type DriveItem = {
  id: string
  name: string
  size?: number
  webUrl?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
  eTag?: string
  cTag?: string
  parentReference?: { driveId?: string; id?: string; path?: string; siteId?: string }
  file?: { mimeType?: string; hashes?: Record<string, string> }
  folder?: { childCount?: number }
  package?: { type?: string }
  remoteItem?: DriveItem
  sharepointIds?: { siteUrl?: string; listId?: string; listItemUniqueId?: string }
  currentUserRole?: { blocksDownload?: boolean; readOnly?: boolean; allowEdit?: boolean }
  '@microsoft.graph.downloadUrl'?: string
  '@content.downloadUrl'?: string
  '@content.downloadUrlNoAuth'?: string
}

export type FileListOptions = {
  top?: number
  orderBy?: string
  select?: string
  expand?: string
}

export type SharePointFile = {
  id: string
  name: string
  serverRelativeUrl: string
  webUrl: string
  isFolder: boolean
  size?: number
  modified?: string
  driveItemUrl?: string
}

export type SharePointFileListOptions = {
  folder?: string
  recursive?: boolean
  pageSize?: number
}

export type SharePointFileList = {
  value: SharePointFile[]
}

export type FileReference =
  | { url: string }
  | { driveId: string; itemId: string }
  | { siteUrl: string; uniqueId: string }

export type ConflictBehavior = 'fail' | 'replace' | 'rename'
export type UploadOptions = {
  conflictBehavior?: ConflictBehavior
  ifMatch?: string
  chunkSize?: number
}
export type UploadSession = {
  uploadUrl: string
  expirationDateTime: string
  nextExpectedRanges?: string[]
}
export type DriveItemUpdate = {
  name?: string
  parentReference?: { id: string; driveId?: string }
  description?: string
}
export type OperationResult = { status: number; operationUrl?: string; value?: unknown }
