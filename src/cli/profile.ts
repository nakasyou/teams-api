import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ParsedArgs, ResolvedProfile } from './types'
import { DEFAULT_PROFILE_DIR, DEFAULT_PROFILE_NAME } from './constants'

type ProfileFile = {
  refreshToken?: unknown
}

const PROFILE_KEY = 'refreshToken'

export function resolveProfilePath(args: ParsedArgs): string {
  if (args.profileJsonPath) {
    return expandHome(args.profileJsonPath)
  }
  const home = getHomeDirectory()
  const safeName = normalizeProfileName(args.profileName)
  return join(home, DEFAULT_PROFILE_DIR, `${safeName}.json`)
}

export function getProfileLabel(args: ParsedArgs): string {
  if (args.profileJsonPath) {
    return 'profile-json'
  }
  return normalizeProfileName(args.profileName)
}

export async function loadRefreshToken(path: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = JSON.parse(raw) as ProfileFile
    if (typeof parsed[PROFILE_KEY] !== 'string') {
      return undefined
    }
    const token = parsed[PROFILE_KEY].trim()
    return token.length > 0 ? token : undefined
  } catch (_error) {
    return undefined
  }
}

export async function saveRefreshToken(path: string, refreshToken: string): Promise<void> {
  const directory = dirname(path)
  if (directory !== '.') {
    await mkdir(directory, { recursive: true })
  }
  const payload = JSON.stringify(
    {
      refreshToken: refreshToken.trim(),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )
  await writeFile(path, payload, 'utf8')
}

export async function resolveProfile(args: ParsedArgs): Promise<ResolvedProfile> {
  const profilePath = resolveProfilePath(args)
  const storedRefreshToken = await loadRefreshToken(profilePath)
  const token = args.refreshToken ?? storedRefreshToken ?? process.env.REFRESH_TOKEN
  if (!token) {
    throw new Error(
      'No refresh token found. Use --refresh-token, --profile-json file, or set REFRESH_TOKEN in env.',
    )
  }

  return {
    token,
    profilePath,
    profileLabel: getProfileLabel(args),
  }
}

export function resolveRefreshTokenForStore(args: ParsedArgs): string {
  const token = args.refreshToken ?? process.env.REFRESH_TOKEN
  if (!token) {
    throw new Error('set-refresh-token requires --refresh-token or REFRESH_TOKEN.')
  }
  return token
}

function getHomeDirectory(): string {
  const home = process.env.HOME || process.env.USERPROFILE
  if (!home) {
    throw new Error('Cannot resolve home directory (HOME/USERPROFILE not set)')
  }
  return home
}

function normalizeProfileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9._-]/g, '_') || DEFAULT_PROFILE_NAME
}

function expandHome(value: string): string {
  if (value === '~') {
    return getHomeDirectory()
  }
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    return join(getHomeDirectory(), value.slice(2))
  }
  return value
}
