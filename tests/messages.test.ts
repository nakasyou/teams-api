import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { TeamsClient } from '../src/client/TeamsClient'
import { SCOPES } from '../src/rest/constants'
import { parseArgs } from '../src/cli/args'
import { executeMessageCommand } from '../src/cli/messages'

const scopes: string[] = []
const client = () =>
  new TeamsClient({
    async getTokenFromScope(scope) {
      scopes.push(scope)
      return 'test-token'
    },
  })
const json = (data: unknown) => Response.json(data)
const messageResponse = (
  location = 'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/c/messages/1699',
  body: unknown = { OriginalArrivalTime: '1699' },
) => new Response(JSON.stringify(body), { status: 201, headers: { location } })
const mocks: { mockRestore(): void }[] = []

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

afterEach(() => {
  for (const mock of mocks.splice(0)) mock.mockRestore()
  scopes.length = 0
})

const bodyOf = (init?: RequestInit): Record<string, unknown> =>
  JSON.parse(String(init?.body)) as Record<string, unknown>

describe('messages', () => {
  test('sends an escaped RichText/Html message and reads Location + arrival time', async () => {
    const calls: { url: URL; init?: RequestInit }[] = []
    mockFetch((url, init) => {
      calls.push({ url, init })
      return messageResponse()
    })

    const result = await client().teams.conversations.sendMessage(
      '19:abc@thread.v2',
      'Hello & <world>\nline2',
    )

    expect(calls).toHaveLength(1)
    const call = calls[0]!
    expect(call.url.href).toBe(
      'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/19%3Aabc%40thread.v2/messages',
    )
    expect(call.url.pathname).toBe(
      '/api/chatsvc/jp/v1/users/ME/conversations/19%3Aabc%40thread.v2/messages',
    )
    expect(call.init?.method).toBe('POST')
    const headers = new Headers(call.init?.headers)
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('authorization')).toBe('Bearer test-token')

    const body = bodyOf(call.init)
    expect(body).toMatchObject({
      messagetype: 'RichText/Html',
      contenttype: 'text',
      content: '<p>Hello &amp; &lt;world&gt;<br>line2</p>',
      properties: { importance: '' },
    })
    expect(body.clientmessageid).toMatch(/^\d{1,19}$/)
    expect(body).not.toHaveProperty('imdisplayname')
    expect(body).not.toHaveProperty('replyChainId')
    expect(result).toEqual({
      id: '1699',
      clientMessageId: String(body.clientmessageid),
      originalArrivalTime: '1699',
      conversationId: '19:abc@thread.v2',
    })
    expect(scopes).toEqual([SCOPES.chats])
  })

  test('supports raw HTML, Text messages, subjects, importance and display name', async () => {
    const bodies: Record<string, unknown>[] = []
    let count = 0
    mockFetch((_url, init) => {
      bodies.push(bodyOf(init))
      count++
      return messageResponse(undefined, { OriginalArrivalTime: 1700 + count })
    })

    await client().teams.conversations.sendMessage('19:chat', '<p>Raw <b>HTML</b></p>', {
      html: true,
      subject: 'Weekly notes',
      importance: 'high',
      displayName: 'Alice',
      clientMessageId: '123456',
    })
    await client().teams.conversations.sendMessage('19:chat', 'plain <not html>', {
      messageType: 'Text',
    })

    expect(bodies[0]).toEqual({
      messagetype: 'RichText/Html',
      contenttype: 'text',
      content: '<p>Raw <b>HTML</b></p>',
      imdisplayname: 'Alice',
      clientmessageid: '123456',
      properties: { importance: 'high', subject: 'Weekly notes' },
    })
    expect(bodies[1]).toMatchObject({
      messagetype: 'Text',
      contenttype: 'text',
      content: 'plain <not html>',
      properties: { importance: '' },
    })
    expect(bodies[1]?.clientmessageid).toMatch(/^\d{1,19}$/)
  })

  test('serializes mentions as the matching JSON string', async () => {
    let body: Record<string, unknown> | undefined
    mockFetch((_url, init) => {
      body = bodyOf(init)
      return messageResponse()
    })

    await client().teams.conversations.sendMessage(
      '19:chat',
      '<span itemtype="http://schema.skype.com/Mention" itemscope="" itemid="0">Alice</span> hi',
      {
        html: true,
        mentions: [
          {
            itemId: '0',
            mri: '8:orgid:alice',
            displayName: 'Alice',
            mentionType: 'person',
          },
        ],
      },
    )

    expect(JSON.parse(String((body?.properties as Record<string, unknown>).mentions))).toEqual([
      {
        '@type': 'http://schema.skype.com/Mention',
        itemid: '0',
        mri: '8:orgid:alice',
        mentionType: 'person',
        displayName: 'Alice',
      },
    ])
  })

  test('encodes the whole reply conversation id including %3Bmessageid%3D', async () => {
    const calls: { url: URL; init?: RequestInit }[] = []
    mockFetch((url, init) => {
      calls.push({ url, init })
      return messageResponse(
        'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/c/messages/2001',
        { OriginalArrivalTime: '2001' },
      )
    })

    const result = await client().teams.channels.reply(
      'team-id',
      '19:chan@thread.tacv2',
      '1699',
      'Reply body',
    )

    expect(calls[0]?.url.pathname).toBe(
      '/api/chatsvc/jp/v1/users/ME/conversations/19%3Achan%40thread.tacv2%3Bmessageid%3D1699/messages',
    )
    expect(calls[0]?.url.href).not.toContain(';messageid=')
    const body = bodyOf(calls[0]?.init)
    expect(body).toMatchObject({
      messagetype: 'RichText/Html',
      content: '<p>Reply body</p>',
      replyChainId: '1699',
      properties: { importance: '' },
    })
    expect(result.id).toBe('2001')
    expect(result.conversationId).toBe('19:chan@thread.tacv2')
  })

  test('posts to a channel conversation with a subject, with and without teamId', async () => {
    const calls: { url: URL; body: Record<string, unknown> }[] = []
    let count = 0
    mockFetch((url, init) => {
      calls.push({ url, body: bodyOf(init) })
      count++
      return messageResponse(
        `https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/c/messages/${3000 + count}`,
      )
    })

    await client().teams.channels.post('team-id', '19:chan@thread.tacv2', 'Post body', {
      subject: 'Weekly release notes',
    })
    await client().teams.channels.post('19:chan@thread.tacv2', 'Second post')

    expect(calls[0]?.url.pathname).toBe(
      '/api/chatsvc/jp/v1/users/ME/conversations/19%3Achan%40thread.tacv2/messages',
    )
    expect(calls[0]?.body.properties).toEqual({
      importance: '',
      subject: 'Weekly release notes',
    })
    expect(calls[1]?.url.pathname).toBe(calls[0]?.url.pathname)
    expect(calls[1]?.body.properties).toEqual({ importance: '' })
  })

  test('rejects missing Location and non-2xx responses', async () => {
    mockFetch(() => new Response(JSON.stringify({}), { status: 201 }))
    await expect(client().teams.conversations.sendMessage('19:chat', 'hello')).rejects.toThrow(
      'Location',
    )

    mockFetch(() => new Response('failed', { status: 500, statusText: 'Server Error' }))
    await expect(client().teams.conversations.sendMessage('19:chat', 'hello')).rejects.toThrow(
      'Failed request POST',
    )
  })
})

describe('chats', () => {
  test('creates a chat with self as Admin and parses threadId from Location', async () => {
    const calls: { url: URL; init?: RequestInit }[] = []
    mockFetch((url, init) => {
      calls.push({ url, init })
      return new Response(JSON.stringify({ threadId: 'ignored' }), {
        status: 201,
        headers: {
          location:
            'https://teams.cloud.microsoft/api/chatsvc/jp/v1/threads/19%3Anew-chat%40thread.v2',
        },
      })
    })

    const result = await client().teams.chats.create({
      selfMri: '8:orgid:self',
      members: ['8:orgid:other', { id: '8:orgid:guest', role: 'Guest', secondaryId: 'secondary' }],
      topic: 'Project chat',
    })

    expect(calls[0]?.url.pathname).toBe('/api/chatsvc/jp/v1/threads')
    expect(calls[0]?.init?.method).toBe('POST')
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer test-token')
    expect(bodyOf(calls[0]?.init)).toEqual({
      members: [
        { id: '8:orgid:self', role: 'Admin' },
        { id: '8:orgid:other', role: 'User' },
        { id: '8:orgid:guest', role: 'Guest', secondaryId: 'secondary' },
      ],
      properties: {
        threadType: 'chat',
        chatFilesIndexId: 2,
        fixedRoster: true,
        uniquerosterthread: true,
        topic: 'Project chat',
      },
    })
    expect(result.threadId).toBe('19:new-chat@thread.v2')
    expect(result.status).toBe(201)
    expect(scopes).toEqual([SCOPES.chats])
  })

  test('accepts the selfMri/members overload and a 207 response', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({}), {
          status: 207,
          headers: {
            location: 'https://teams.cloud.microsoft/api/chatsvc/jp/v1/threads/19%3Aother',
          },
        }),
    )
    const result = await client().teams.chats.create('8:orgid:self', ['8:orgid:other'])
    expect(result).toEqual({ threadId: '19:other', status: 207, response: {} })
  })

  test('sends a DM to an existing 1:1 chat instead of creating a thread', async () => {
    const paths: string[] = []
    mockFetch((url, init) => {
      paths.push(url.pathname)
      if (url.pathname.endsWith('/users/me')) {
        return json({
          teams: [],
          chats: [
            {
              id: '19:existing-dm@unq.gbl.spaces',
              isOneOnOne: true,
              members: [{ mri: '8:orgid:self' }, { mri: '8:orgid:other' }],
            },
          ],
          users: [],
          privateFeeds: [],
        })
      }
      if (url.pathname.endsWith('/threads')) throw new Error('Must not create a thread')
      expect(init?.method).toBe('POST')
      return messageResponse(
        'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/c/messages/4001',
      )
    })

    const result = await client().teams.chats.sendDirectMessage('8:orgid:other', 'Hi', {
      selfMri: '8:orgid:self',
    })

    expect(result.createdChat).toBe(false)
    expect(result.threadId).toBe('19:existing-dm@unq.gbl.spaces')
    expect(result.conversationId).toBe('19:existing-dm@unq.gbl.spaces')
    expect(paths).toEqual([
      '/api/csa/apac/api/v3/teams/users/me',
      '/api/chatsvc/jp/v1/users/ME/conversations/19%3Aexisting-dm%40unq.gbl.spaces/messages',
    ])
  })

  test('creates a chat then sends a DM when no existing chat is found', async () => {
    const requests: { path: string; body?: Record<string, unknown> }[] = []
    mockFetch((url, init) => {
      requests.push({
        path: url.pathname,
        body: init?.body ? bodyOf(init) : undefined,
      })
      if (url.pathname.endsWith('/users/me')) {
        return json({
          teams: [],
          chats: [],
          users: [{ mri: '8:orgid:self', isMe: true }],
          privateFeeds: [],
        })
      }
      if (url.pathname.endsWith('/threads')) {
        return new Response(JSON.stringify({}), {
          status: 201,
          headers: {
            location:
              'https://teams.cloud.microsoft/api/chatsvc/jp/v1/threads/19%3Anew%40thread.v2',
          },
        })
      }
      return messageResponse(
        'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/c/messages/5001',
      )
    })

    const result = await client().teams.chats.sendDirectMessage('8:orgid:other', 'Hello', {
      topic: 'Direct chat',
    })

    expect(result.createdChat).toBe(true)
    expect(result.threadId).toBe('19:new@thread.v2')
    expect(requests[1]?.path).toBe('/api/chatsvc/jp/v1/threads')
    expect(requests[1]?.body).toMatchObject({
      members: [
        { id: '8:orgid:self', role: 'Admin' },
        { id: '8:orgid:other', role: 'User' },
      ],
      properties: { topic: 'Direct chat' },
    })
    expect(requests[2]?.path).toBe(
      '/api/chatsvc/jp/v1/users/ME/conversations/19%3Anew%40thread.v2/messages',
    )
  })
})

describe('message CLI', () => {
  test('parses send/post/reply/dm and executes send with raw HTML', async () => {
    let body: Record<string, unknown> | undefined
    mockFetch((_url, init) => {
      body = bodyOf(init)
      return messageResponse()
    })

    expect(parseArgs(['send', '19:chat', 'hello']).command).toBe('send')
    expect(parseArgs(['post', 'team', '19:chan', 'hello']).command).toBe('post')
    expect(parseArgs(['reply', 'team', '19:chan', '1', 'hello']).command).toBe('reply')
    expect(parseArgs(['dm', '8:orgid:other', 'hello']).command).toBe('dm')

    const result = await executeMessageCommand(
      parseArgs(['send', '19:chat', 'hello', '--html']),
      client(),
    )
    expect(result.command).toBe('send')
    expect(body).toMatchObject({ content: 'hello', messagetype: 'RichText/Html' })
    expect(result.data).toMatchObject({ id: '1699', conversationId: '19:chat' })
  })

  test('returns command help without making a request', async () => {
    const mock = mockFetch(() => {
      throw new Error('Must not request')
    })
    expect(await executeMessageCommand(parseArgs(['send', '--help']), client())).toEqual({
      command: 'help',
      data: 'send',
    })
    expect(await executeMessageCommand(parseArgs(['dm']), client())).toEqual({
      command: 'help',
      data: 'dm',
    })
    expect(mock).not.toHaveBeenCalled()
  })
})
