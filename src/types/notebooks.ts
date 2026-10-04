export type NotebookScope =
  | { groupId: string }
  | { userId: string }
  | { siteId: string }
  | { me: true }

export type NotebookEntity = {
  id: string
  displayName?: string
  name?: string
  self?: string
  createdDateTime?: string
  lastModifiedDateTime?: string
}

export type Notebook = NotebookEntity & {
  isDefault?: boolean
  userRole?: string
  sectionsUrl?: string
  sectionGroupsUrl?: string
  links?: { oneNoteClientUrl?: { href: string }; oneNoteWebUrl?: { href: string } }
  sections?: NotebookSection[]
  sectionGroups?: NotebookSectionGroup[]
}

export type NotebookSectionGroup = NotebookEntity & {
  sectionsUrl?: string
  sectionGroupsUrl?: string
  sections?: NotebookSection[]
  sectionGroups?: NotebookSectionGroup[]
}

export type NotebookSection = NotebookEntity & {
  pagesUrl?: string
  pages?: NotebookPage[]
}

export type NotebookPage = NotebookEntity & {
  title?: string
  contentUrl?: string
  level?: number
  order?: number
}

export type ClassNotebook = Notebook & {
  studentSections?: string[]
  teachers?: NotebookPrincipal[]
  students?: NotebookPrincipal[]
  hasTeacherOnlySectionGroup?: boolean
}

export type NotebookPrincipal = { id: string; principalType: 'Person' | 'Group' }

export type NotebookWopiProperties = {
  id: string
  accessToken: string
  accessTokenTtl: number
  webApplicationUrl: string
  applicationUrl?: string | null
  wopiSrc?: string | null
  oneNoteWebUrl?: string
}

export type NotebookListOptions = {
  top?: number
  orderBy?: string
  select?: string
  expand?: string
  filter?: string
}

export type NotebookTree = Notebook & {
  sections: NotebookSection[]
  sectionGroups: NotebookSectionGroup[]
}

export type NotebookPagePatch = {
  target: string
  action: 'append' | 'prepend' | 'insert' | 'replace' | 'delete'
  position?: 'before' | 'after'
  content?: string
}

export type CreateClassNotebook = {
  name: string
  studentSections: string[]
  teachers: NotebookPrincipal[]
  students: NotebookPrincipal[]
  hasTeacherOnlySectionGroup?: boolean
}

export type DistributeNotebookPage = {
  studentUserPrincipalName: string
  lockStartDate: string
  targetSectionName: string
  assignmentId?: string
  ignoreIfStudentPageExists?: boolean
}

export type NotebookCopyTarget = {
  id: string
  groupId?: string
  siteCollectionId?: string
  siteId?: string
  renameAs?: string
}
