import { afterEach, expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseArgs } from '../src/cli/args'
import {
  loadProfileState,
  resolveProfile,
  resolveRefreshTokenForStore,
  saveProfile,
} from '../src/cli/profile'
import { TokenManager } from '../src/auth/TokenManager'
import { loginFromEstsAuthPersistent } from '../src/auth/estsAuth'
import { resolveTenantId } from '../src/auth/tenant'

const originalFetch = globalThis.fetch
const directories: string[] = []
afterEach(async () => {
  globalThis.fetch = originalFetch
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true })
})

async function profilePath() {
  const directory = await mkdtemp(join(tmpdir(), 'teams-tenant-'))
  directories.push(directory)
  return join(directory, 'profile.json')
}

test('login saves tenant selection and subsequent commands read it from JSON', async () => {
  const path = await profilePath()
  const login = parseArgs([
    '--profile-json',
    path,
    'login',
    '--tenant-id',
    'example.edu',
    '--refresh-token',
    'test-refresh',
  ])
  const state = await resolveRefreshTokenForStore(login)
  await saveProfile(path, state)
  expect((await loadProfileState(path)).tenantId).toBe('example.edu')
  expect((await resolveProfile(parseArgs(['--profile-json', path, 'me']))).tenantId).toBe(
    'example.edu',
  )
  const again = await resolveRefreshTokenForStore(
    parseArgs(['--profile-json', path, 'login', '--refresh-token', 'replacement']),
  )
  expect(again.tenantId).toBe('example.edu')
})

test('old profiles default to organizations and tenant input rejects URL injection', async () => {
  const path = await profilePath()
  await saveProfile(path, { refreshToken: 'test-refresh' })
  expect((await resolveProfile(parseArgs(['--profile-json', path, 'me']))).tenantId).toBe(
    'organizations',
  )
  expect(() => resolveTenantId('../common?secret=1')).toThrow('Invalid tenant ID')
  expect(() => parseArgs(['login', '--tenant-id='])).toThrow()
  expect(() => parseArgs(['--tenant-id', 'example.edu', 'me'])).toThrow()
})

test('TokenManager uses configured tenant for refresh requests', async () => {
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input))
    return Response.json({ access_token: 'access', refresh_token: 'refresh', expires_in: 3600 })
  }) as typeof fetch
  const manager = new TokenManager('refresh', undefined, undefined, 'example.edu')
  expect(await manager.getToken('scope')).toBe('access')
  expect(urls).toEqual(['https://login.microsoftonline.com/example.edu/oauth2/v2.0/token'])
})

test('cookie login uses the same tenant for authorization and code exchange', async () => {
  const urls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    urls.push(String(input))
    if (urls.length === 1)
      return new Response(null, {
        status: 302,
        headers: { location: 'https://teams.cloud.microsoft/v2#code=test-code' },
      })
    return Response.json({ refresh_token: 'refresh', refresh_token_expires_in: 3600 })
  }) as typeof fetch
  await loginFromEstsAuthPersistent('test-cookie', 'example.edu')
  expect(new URL(urls[0]!).pathname).toBe('/example.edu/oauth2/v2.0/authorize')
  expect(urls[1]).toBe('https://login.microsoftonline.com/example.edu/oauth2/v2.0/token')
})
