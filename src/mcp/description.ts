import { contentHelp } from '../cli/content'

const basicCommands = [
  [
    'teams mcp [--profile <name>] [--profile-json <path>]',
    'Start this stdio MCP server. This launcher is not executable through the tool; mcp --help returns its usage.',
  ],
  ['teams notifications [--limit N]', 'Fetch the latest notifications; the default limit is 20.'],
  ['teams messages <conversationId> [--limit N]', 'Fetch messages from a chat or conversation.'],
  [
    'teams channel messages <channelId> [--limit N]',
    'Resolve the owning team and fetch channel messages.',
  ],
  ['teams teams list', 'List joined teams, including their thread IDs.'],
  ['teams teams channels <teamId>', 'List the channels belonging to a Teams thread ID.'],
  ['teams me', 'Fetch the current user snapshot, including teams and chats.'],
  [
    'teams login [--tenant-id <id>] [--ests-auth-persistent <cookie> | --refresh-token <token>]',
    'Store credentials in the selected profile. The session cookie is preferred; refresh-token is deprecated. MCP is noninteractive, so provide credentials in arguments or environment variables.',
  ],
  ['teams --help', 'Show the top-level CLI help without authentication.'],
  ['teams help', 'Show the top-level CLI help without authentication.'],
] as const

const contentDescriptions: Record<string, string> = {
  'files drives': 'List document libraries for a team/group, me, or user:<userId>.',
  'files channel': 'Resolve the channel file folder and list its contents.',
  'files list':
    'List all children of a drive folder, following pagination; the default item is root.',
  'files get': 'Fetch file/folder metadata by drive ID and item ID.',
  'files path': 'Fetch metadata by a path relative to the drive root.',
  'files search': 'Search for files/folders within a drive.',
  'files resolve': 'Resolve a SharePoint file or sharing URL to drive-item metadata.',
  'files sharepoint':
    'List a SharePoint document library by its server-relative path; --folder selects a folder and --recursive includes nested items.',
  'files download':
    'Save a single file from its SharePoint URL or drive/item IDs. --output is a local file path; existing local files are not overwritten.',
  'files thumbnail':
    'Save a thumbnail locally; --size accepts small, medium, large, or c<width>x<height>.',
  'files download-folder':
    'Recursively save a drive folder into --output. OneNote packages use notebooks export instead.',
  'files download-sharepoint':
    'Recursively save all files in a SharePoint library or --folder into --output.',
  'files upload':
    'Upload a local file into a drive folder; use root for the drive root. --name changes the destination name. --conflict defaults to fail; replace overwrites and rename avoids a collision. --if-match supplies an ETag. Large files use upload-session chunks.',
  'files replace':
    'Replace the binary contents of an existing file. --if-match provides an optional ETag condition; use upload for files above 250 MiB.',
  'files mkdir':
    'Create a drive folder. --conflict selects fail, replace, or rename; default fail.',
  'files rename': 'Rename a file/folder, optionally using --if-match <etag>.',
  'files move':
    'Move a file/folder within a drive; --name also renames it and --if-match conditions the update.',
  'files copy':
    'Start an asynchronous copy to a destination drive and folder; --name optionally renames the copy. Returns an operation URL.',
  'files delete': 'Delete a drive item; --if-match optionally conditions deletion on an ETag.',
  'notebooks list': 'List accessible notebooks in the selected scope.',
  'notebooks get': 'Fetch one notebook by ID.',
  'notebooks tree':
    'Fetch a complete notebook hierarchy, including nested section groups, sections, and page metadata.',
  'notebooks sections': 'List sections in the scope, a notebook, or --section-group <id>.',
  'notebooks section-groups':
    'List section groups in the scope, a notebook, or --section-group <id>.',
  'notebooks pages': 'List pages in the scope or one section, following pagination.',
  'notebooks page': 'Fetch page metadata by ID.',
  'notebooks download-page':
    'Save raw page HTML to --output; resources remain remote. Use export for a local copy including resources.',
  'notebooks download-resource': 'Save an image or attached file resource by resource ID.',
  'notebooks export':
    'Save the entire notebook into --output, including nested sections, page HTML, local image/file resources, and index.json. Existing files are not overwritten.',
  'notebooks create': 'Create a notebook with the supplied name.',
  'notebooks create-section':
    'Create a section in a notebook, or use --section-group <id> to create it in a section group.',
  'notebooks create-section-group':
    'Create a section group in a notebook, or a nested group using --section-group <id>.',
  'notebooks rename-section': 'Rename an existing section through the OneNote service.',
  'notebooks create-page':
    'Create a page from local --input HTML. Repeat --attachment partName=path to include local images/files, referenced as name:partName in the HTML.',
  'notebooks patch-page':
    'Edit a page using a local --input JSON array of commands: target, action (append/prepend/insert/replace/delete), optional position (before/after), and content. Repeat --attachment partName=path for multipart resources.',
  'notebooks delete-page': 'Permanently delete a page through OneNote.',
  'notebooks copy-page':
    'Copy a page into a destination section and return the asynchronous operation URL.',
  'notebooks copy-section':
    'Copy a section into a destination notebook or --section-group <id>; return the operation URL.',
  'notebooks copy-notebook':
    'Copy an entire notebook in the selected scope; --name names the copy. Returns an operation URL.',
  'notebooks operation': 'Check a OneNote copy operation using the returned operation URL.',
  'notebooks lock-page':
    'Set a Class Notebook page edit-lock start date, or pass the literal null to clear the lock.',
  'class-notebook list':
    'List class-specific notebook metadata. This endpoint can return 403 for student accounts; default and notebooks list may still work.',
  'class-notebook get': 'Fetch class-specific metadata for one notebook.',
  'class-notebook type': 'Fetch the team/group notebook type, such as EDU.',
  'class-notebook default': 'Fetch the team/group default notebook and its ID.',
  'class-notebook collaboration':
    'Fetch the collaboration-space section-group ID through the captured Teams endpoint.',
  'class-notebook sections':
    'List sections in a class notebook collaboration section group; --channel optionally filters by Teams channel ID.',
  'class-notebook open':
    'Fetch notebook web URLs and display information; the WOPI access token is omitted from CLI output.',
  'class-notebook export':
    'Export a class notebook and its resources into --output. If notebookId is omitted, use the group default notebook.',
  'class-notebook create':
    'Create a class notebook from --input JSON: name, studentSections (string array), teachers/students (arrays of {id, principalType: Person|Group}), optional hasTeacherOnlySectionGroup. --locale specifies the language. Creation emails are disabled.',
  'class-notebook teacher-only':
    'Add the teacher-only section group to an existing class notebook.',
  'class-notebook delete': 'Delete an existing class notebook.',
  'class-notebook add-member':
    'Add one student or teacher, granting notebook access and creating the student section group when applicable.',
  'class-notebook remove-member':
    'Revoke notebook access for one student or teacher; the API retains their content.',
  'class-notebook copy-sections':
    'Copy the supplied section IDs into the class notebook Content Library.',
  'class-notebook distribute-page':
    'Distribute a page to a student using --input JSON with studentUserPrincipalName, targetSectionName, ISO lockStartDate, optional assignmentId and ignoreIfStudentPageExists.',
  'class-notebook sync-membership':
    'Synchronize the default class notebook teachers/students with group owners/members.',
  'class-notebook repair':
    'Reapply notebook permissions from its existing teacher/student metadata.',
}

const contentCommands = Object.values(contentHelp)
  .flat()
  .filter((usage) => usage.startsWith('teams '))
  .map((usage) => {
    const key = usage.split(' ').slice(1, 3).join(' ')
    const description = contentDescriptions[key]
    if (!description) throw new Error(`Missing MCP command description: ${key}`)
    return [usage, description] as const
  })

export const teamsToolDescription = [
  'Run one Microsoft Teams CLI command and return its result. This is the only tool exposed by this MCP server.',
  'Input args is an argv array, excluding the executable name teams. Do not pass a shell command or shell quoting; each argument is one array element. Example: {"args":["files","list","drive-id"]}.',
  'The CLI runs with --json --no-color. Returns exitCode, stdout, stderr, and result when stdout is JSON. A nonzero exit code is an MCP tool error. Help returns text. Downloads/exports write to the server machine; paths and local --input/attachment files are resolved relative to the server working directory.',
  'Authentication uses the existing ~/.teams-cli/default.json profile or the configured server profile. Global options go BEFORE the subcommand: --profile <name>, --profile-json <path>, --ests-auth-persistent <cookie>, --refresh-token <token> (deprecated), --json, --no-color, --help/-h. ESTSAUTHPERSISTENT and REFRESH_TOKEN environment variables are supported. Configure tenant with teams login --tenant-id <id>; subsequent commands read tenantId from profile JSON (default: organizations). Normal API calls may update stored refresh credentials.',
  'Team thread IDs (19:...) are resolved to Microsoft 365 group IDs. File drive/item IDs come from discovery commands. Notebook scope accepts teamId, groupId, me, user:<userId>, or site:<hostname,siteCollectionId,siteId>. SharePoint library/folder paths are server-relative. Classroom administration requires teacher/owner permissions. Mutation commands modify server data when invoked.',
  'All supported commands (syntax followed by explanation):',
  ...[...basicCommands, ...contentCommands].map(
    ([usage, description]) => `${usage}\n  ${description}`,
  ),
  'teams files --help\n  Show every file command without authentication.',
  'teams notebooks --help\n  Show every notebook command without authentication.',
  'teams class-notebook --help\n  Show every Class Notebook command without authentication.',
  'For notifications/messages/channel/me/teams/login, --help or -h also displays command-specific help; existing CLI authentication behavior applies.',
].join('\n\n')
