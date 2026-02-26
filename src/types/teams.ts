export type TeamsExport = {
  conversationFolders: ConversationFoldersRoot
  teams: Team[]
  chats: ChatThread[]
  engageCommunities: unknown[]
  users: unknown[]
  privateFeeds: PrivateFeed[]
  metadata: SyncMetadata
}

export type ConversationFoldersRoot = {
  folderHierarchyVersion: number
  conversationFolders: ConversationFolder[]
  conversationFolderOrder: string[]
  migratedPinnedToFavorites: boolean
  isPartialResponse: boolean
  supportedSlicesMetadata: SupportedSlicesMetadata
}

export type ConversationFolder = {
  id: string
  sortType: string
  name: string
  folderType: string
  conversationFolderItems: ConversationFolderItem[]
  version: number
  createdTime: number
  isExpanded: boolean
  isDeleted: boolean
  isHierarchicalViewEnabled?: boolean
}

export type ConversationFolderItem =
  | {
      conversationId: string
      createdTime: number
      lastUpdatedTime: number
      threadType: 'streamofnotes' | 'topic' | string
      itemType?: never
    }
  | {
      conversationId: string
      createdTime: number
      lastUpdatedTime: number
      itemType: 'Slice' | string
      threadType?: never
    }

export type SupportedSlicesMetadata = {
  commonSliceHierarchyVersion: number
  isEnabled: boolean
  slicesMetadata: Record<string, SliceMetadata>
}

export type SliceMetadata = {
  id: string
  defaultGesture: string
  supportedGestures: string[]
  currentReleaseVersion: number
  isEnabled: boolean
}

export type Team = {
  displayName: string
  id: string
  channels: Channel[]
  joiningenabled: string
  pictureETag: string
  description: string
  isFavorite: boolean
  isCollapsed: boolean
  isDeleted: boolean
  isTenantWide: boolean
  isEmptyConversation: boolean
  smtpAddress: string
  threadVersion: string
  threadSchemaVersion: string
  conversationVersion: string | null
  classification: string | null
  accessType: number
  guestUsersCategory: unknown | null
  dynamicMembership: boolean
  maximumMemberLimitExceeded: boolean
  teamSettings: TeamSettings
  teamGuestSettings: TeamSettings
  teamStatus: TeamStatus
  teamSiteInformation: TeamSiteInformation
  isGeneralChannelFavorite: boolean
  isCreator: boolean
  creator: string
  membershipVersion: number | string
  membershipSummary: MembershipSummary
  isUserMuted: boolean
  lastJoinAt: string
  membershipExpiry: number
  memberRole: number
  memberRoleString: string
  isFollowed: boolean
  tenantId: string
  teamType: number
  extensionDefinition?: ExtensionDefinition
  isArchived: boolean
  classSettings?: ClassSettings
  isTeamLocked: boolean
  isUnlockMembershipSyncRequired: boolean
  channelOnlyMember: boolean
  rosterVersion: number
}

export type Channel = {
  id: string
  displayName: string
  description?: string
  consumptionHorizon: ConsumptionHorizon
  lastL2MessageIdNFS: number
  version: number
  threadVersion: number | string
  threadSchemaVersion: string
  parentTeamId: string
  isGeneral: boolean
  isFavorite: boolean
  isFollowed: boolean
  isMember: boolean
  creator?: string
  isMessageRead: boolean
  isImportantMessageRead: boolean
  isGapDetectionEnabled: boolean
  defaultFileSettings?: DefaultFileSettings
  lastMessage: Message
  lastImportantMessageTime?: string
  isDeleted: boolean
  isPinned: boolean
  lastJoinAt: string
  threadType: string
  isEmptyConversation: boolean
  threadSubType: string
  lastLeaveAt?: string
  lastTimeFavorited?: string
  memberRole: number
  memberRoleString: string
  isMuted: boolean
  membershipExpiry: number
  isFavoriteByDefault: boolean
  creationTime: string
  isArchived: boolean
  channelType: number
  membershipVersion: number
  isModerator: boolean
  groupId: string
  channelOnlyMember: boolean
  explicitlyAdded: boolean
  isShared: boolean
  csaV1: boolean
  lastRcMetadataVersion: number

  // optional advanced fields (seen in some channels)
  channelSettings?: ChannelSettings
  tabs?: Tab[]
  connectorProfiles?: ConnectorProfile[]
  sharepointSiteUrl?: string
  substrateGroupId?: string
  tenantId?: string
  memberSettings?: MemberSettings
  guestSettings?: MemberSettings
  shareWithParentSpaces?: ShareWithParentSpaces
  extensionDefinition?: ExtensionDefinition
}

export type ConsumptionHorizon = {
  originalArrivalTime: number
  timeStamp: number
  clientMessageId: string
}

export type DefaultFileSettings = {
  filesRelativePath: string | null
  documentLibraryId?: string
  sharepointRootLibrary?: string
}

export type TeamSettings = {
  createTopic: boolean
  updateTopic: boolean
  deleteTopic: boolean
  editChannelTopic: boolean
  createTab: boolean
  deleteTab: boolean
  createIntegration: boolean
  updateIntegration: boolean
  deleteIntegration: boolean
  teamMention: boolean
  channelMention: boolean
  giphyEnabled: boolean
  stickersEnabled: boolean
  giphyRating: number
  customMemesEnabled: boolean
  teamMemesEnabled: boolean
  addDisplayContent: boolean
  removeDisplayContent: boolean
  allowChOwnToAddB2BCollabMemToOAC: boolean | null
  allowChOwnToAddExtMemToPAC: boolean | null
  allowChOwnToSharePACWithTeams: boolean | null
  allowChOwnToAddB2BCollabMemToPAC: boolean | null
  adminDeleteEnabled: boolean
  deleteEnabled: boolean
  editEnabled: boolean
  messageThreadingEnabled: boolean
  generalChannelPosting: number
  installApp: boolean
  uninstallApp: boolean
  isPrivateChannelCreationEnabled: boolean
  isSharedChannelCreationEnabled: boolean
  uploadCustomApp: boolean
  enableAndDisableApps?: boolean
}

export type TeamStatus = {
  exchangeTeamCreationStatus: number
  sharePointSiteCreationStatus: number
  teamNotebookCreationStatus?: number
}

export type TeamSiteInformation = {
  groupId: string
  sharepointSiteUrl: string
  notebookId?: string
  isOneNoteProvisioned?: boolean
}

export type MembershipSummary = {
  botCount: number
  mutedMembersCount: number
  totalMemberCount: number
  adminRoleCount?: number
  userRoleCount?: number
}

export type ExtensionDefinition = {
  updatedTime: string
  tabsEtag: unknown | null
}

export type ClassSettings = {
  guardianAssignmentEmail: boolean
}

export type ChannelSettings = {
  channelPostPermissions: number
  channelReplyPermissions: number
  channelPinPostPermissions: number
  channelBotsPostPermissions: number
  channelConnectorsPostPermissions: number
  memberSettings?: MemberSettings
  guestSettings?: MemberSettings
}

export type MemberSettings = {
  createTab: boolean
  deleteTab: boolean
  createIntegration: boolean
  updateIntegration: boolean
  deleteIntegration: boolean
  giphyEnabled: boolean
  stickersEnabled: boolean
  giphyRating: number
  customMemesEnabled: boolean
  teamMemesEnabled: boolean
  editChannelTopic: boolean
  teamMention: boolean
  channelMention: boolean
  adminDeleteEnabled: boolean
  deleteEnabled: boolean
  editEnabled: boolean
  installApp: boolean
  uninstallApp: boolean
  enableAndDisableApps: boolean
}

export type ShareWithParentSpaces = {
  linkedSpaceInfoItems: LinkedSpaceInfoItem[]
}

export type LinkedSpaceInfoItem = {
  spaceThreadId: string
  role: number
  linkState: number
}

export type Tab = {
  id: string
  name: string
  definitionId: string
  directive: string
  tabType: string
  order: number
  replyChainId: number
  settings: TabSettings
}

export type TabSettings = {
  subtype: string
  url: string
  websiteUrl: string
  entityId: string
  dateAdded: string
  removeUrl?: string | null
}

export type ConnectorProfile = {
  avatarUrl: string
  displayName: string
  incomingUrl: string | null
  connectorType: string
  id: string
}

export type Message = {
  messageType: string | null
  content: string | null
  clientMessageId: string | null
  fromFamilyNameInToken: string | null
  fromGivenNameInToken: string | null
  fromDisplayNameInToken: string | null
  imDisplayName: string | null
  id: string | null
  type: string | null
  composeTime: string | null
  originalArrivalTime: string | null
  containerId: string | null
  parentMessageId: string | null
  from: string | null
  sequenceId: number
  version: number
  threadType: string | null
  isEscalationToNewPerson: boolean
}

export type ChatThread = {
  id: string
  consumptionHorizon: ConsumptionHorizon
  lastRcMetadataVersion: number
  lastL2MessageIdNFS: number
  retentionHorizon: unknown | null
  retentionHorizonV2: unknown | null
  members: ChatMember[]
  title: string | null
  version: number
  threadVersion: number | string
  threadType: string
  isEmptyConversation: boolean
  isRead: boolean
  isHighImportance: boolean
  isOneOnOne: boolean
  lastMessage: Message
  isLastMessageFromMe: boolean
  chatSubType: number
  lastJoinAt: string
  createdAt: string
  creator: string
  tenantId: string
  hidden: boolean
  isGapDetectionEnabled: boolean
  interopType: number
  isConversationDeleted: boolean
  isExternal: boolean
  addedBy: string
  addedByTenantId: string
  isMessagingDisabled: boolean
  isDisabled: boolean
  importState: string
  chatType: string
  interopConversationStatus: string
  conversationBlockedAt: number
  hasTranscript: boolean
  templateType: string
  isMigrated: boolean
  isSticky: boolean
  isSmsThread: boolean
  meetingPolicy: string
  rosterVersion: number
  identityMaskEnabled: boolean
  isLiveChatEnabled: boolean
  fileReferences: Record<string, unknown>

  // optional fields seen in some chats
  productContext?: string
  lastImportantMessageTime?: string
  relationshipState?: { inQuarantine: boolean }
  quickReplyAugmentation?: QuickReplyAugmentation
}

export type ChatMember = {
  isMuted: boolean
  mri: string
  objectId: string
  role: string
  isIdentityMasked: boolean
}

export type QuickReplyAugmentation = {
  suggestedActivities: SuggestedActivity[]
}

export type SuggestedActivity = {
  type: string
  suggestedActions: {
    actions: SuggestedAction[]
  }
  id: string
  timestamp: string
  from: {
    id: string
    name: string
  }
  conversation: {
    isGroup: boolean
    id: string
  }
  replyToId: string
}

export type SuggestedAction = {
  type: string
  title: string
  value: string
  channelData: {
    type: string
    device: string
    id: string
    utcTime: string
    targetMessageId: string
  }
}

export type PrivateFeed = {
  id: string
  type: string
  version: number
  properties: Record<string, string>
  lastMessage: Message
  messages: string
  threadType: string
  isEmptyConversation: boolean
  targetLink: string
  streamType: string
}

export type SyncMetadata = {
  syncToken: string
  forwardSyncToken: string | null
  isPartialData: boolean
  hasMoreChats: boolean
  coldBootTime: number
}

export type PinnedChannelsResponse = {
  orderVersion: 1746834948329
  pinChannelOrder: string[]
}

export type ConversationMessagesOptions = {
  view?: string
  pageSize?: number
  startTime?: number
  syncState?: string
  endTime?: number
  draftVersion?: string
}

export type ConversationMessagesResponse = {
  messages: ConversationMessage[]
  tenantId?: string
  _metadata?: ConversationMessagesMetadata
  [key: string]: unknown
}

export type ConversationMessagesMetadata = {
  lastCompleteSegmentStartTime?: number
  lastCompleteSegmentEndTime?: number
  syncState?: string
  [key: string]: unknown
}

export type ConversationMessage = {
  sequenceId?: number
  conversationid?: string
  conversationLink?: string
  contenttype?: string
  type?: string
  s2spartnername?: string
  clumpId?: string
  secondaryReferenceId?: string
  id?: string
  clientmessageid?: string
  version?: string
  messagetype?: string
  content?: string
  from?: string
  imdisplayname?: string
  prioritizeImDisplayName?: boolean
  composetime?: string
  originalarrivaltime?: string
  properties?: ConversationMessageProperties
  [key: string]: unknown
}

export type ConversationMessageProperties = {
  activity?: ConversationActivity
  messageUpdatePolicyValue?: number
  isread?: boolean | string
  s2spartnername?: string
  mentions?: string
  languageStamp?: string
  edittime?: number
  [key: string]: unknown
}

export type ConversationActivity = {
  activityType?: string
  activitySubtype?: string
  activityTimestamp?: string
  activityId?: number
  sourceThreadId?: string
  sourceMessageId?: number
  sourceMessageVersion?: number
  sourceReplyChainId?: number
  sourceUserId?: string
  sourceUserImDisplayName?: string
  targetUserId?: string
  targetThreadId?: string
  messagePreview?: string
  messagePreviewTemplateOption?: string
  activityContext?: Record<string, unknown>
  sourceThreadTopic?: string
  sourceThreadRosterNonBotMemberCount?: number
  sourceThreadIsPrivateChannel?: boolean | string
  [key: string]: unknown
}

export type ChannelPostsResponse = {
  replyChains: ChannelReplyChain[]
  hasMore: boolean
  lastModifiedTimeOfLastReturnedReplyChain: string | null
  channelTenantId: string
}

export type ChannelReplyChain = {
  containerId: string
  id: string
  latestDeliveryTime: string
  messages?: ChannelPostMessage[]
  replies?: ChannelPostMessage[]
  message?: ChannelPostMessage
}

export type ChannelPostMessage = Message & {
  properties?: ChannelPostMessageProperties
  annotationsHint?: {
    annotationsHintType?: string
    annotationsHint?: string
    hashfunctionId?: string
    numberOfHashfunction?: number
  }
  annotationsSummary?: Record<string, unknown>
}

export type ChannelPostMessageProperties = {
  mentions?: unknown[] | string
  cards?: string
  importance?: string
  subject?: string
  title?: string
  links?: string
  files?: string
  formatVariant?: string
  languageStamp?: string
  emotions?: unknown[]
  ams_references?: unknown[]
  [key: string]: unknown
}

export type FetchShortProfileResponse = {
  type: 'Microsoft.SkypeSpaces.MiddleTier.Models.IUserIdentity'
  value: ShortProfileUser[]
}

export type ShortProfileUser = {
  userPrincipalName?: string
  givenName?: string
  surname?: string
  jobTitle?: string
  department?: string
  email?: string
  userType?: string
  isShortProfile?: boolean
  tenantName?: string
  companyName?: string
  displayName?: string
  type?: string
  mri: string
  objectId?: string
}
