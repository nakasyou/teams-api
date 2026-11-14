import type { DriveItem, FileReference, MessageFileAttachment } from '../../types/files'

const DOWNLOAD_URL_KEYS = [
  '@content.downloadUrl',
  '@content.downloadUrlNoAuth',
  '@microsoft.graph.downloadUrl',
  '@microsoft.graph.downloadUrlNoAuth',
] as const

export function parseMessageFiles(
  properties: { files?: unknown } | null | undefined,
): MessageFileAttachment[] {
  const raw = properties?.files
  if (raw === undefined || raw === null || raw === '') return []

  let value: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return []
    try {
      value = JSON.parse(raw)
    } catch {
      return []
    }
  }

  if (!Array.isArray(value)) return []
  return value.filter((item): item is MessageFileAttachment => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return false
    const candidate = item as Partial<MessageFileAttachment>
    return typeof candidate.itemid === 'string' && typeof candidate.fileName === 'string'
  })
}

export function attachmentReferences(attachment: MessageFileAttachment): FileReference[] {
  const references: FileReference[] = []
  const seen = new Set<string>()
  const add = (reference: FileReference | undefined): void => {
    if (!reference) return
    const key = referenceKey(reference)
    if (!key || seen.has(key)) return
    seen.add(key)
    references.push(reference)
  }

  add(urlReference(attachment.fileInfo?.shareUrl))
  add(urlReference(attachment.objectUrl))
  add(urlReference(attachment.fileInfo?.fileUrl))

  const siteUrl =
    stringValue(attachment.fileInfo?.siteUrl) ?? stringValue(attachment.sharepointIds?.siteUrl)
  const uniqueId =
    stringValue(attachment.itemid) ?? stringValue(attachment.sharepointIds?.listItemUniqueId)
  if (siteUrl && uniqueId) add({ siteUrl, uniqueId })

  return references
}

export function attachmentReference(attachment: MessageFileAttachment): FileReference | undefined {
  return attachmentReferences(attachment)[0]
}

export function redactDriveItem(item: DriveItem): DriveItem {
  const copy: DriveItem = { ...item }
  for (const key of DOWNLOAD_URL_KEYS) {
    if (copy[key] !== undefined) copy[key] = '<redacted>'
  }
  if (item.remoteItem) copy.remoteItem = redactDriveItem(item.remoteItem)
  return copy
}

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function urlReference(value: unknown): FileReference | undefined {
  const url = stringValue(value)
  return url ? { url } : undefined
}

function referenceKey(reference: FileReference): string | undefined {
  if ('url' in reference) {
    const url = canonicalUrl(reference.url)
    return url ? `url:${url}` : undefined
  }
  if ('siteUrl' in reference) {
    const siteUrl = canonicalUrl(reference.siteUrl)
    return siteUrl ? `site:${siteUrl}:${reference.uniqueId}` : undefined
  }
  return `drive:${reference.driveId}:${reference.itemId}`
}

function canonicalUrl(value: string): string | undefined {
  const trimmed = value.trim()
  if (!trimmed) return undefined
  try {
    return new URL(trimmed).href
  } catch {
    return trimmed
  }
}
