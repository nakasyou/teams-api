import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { TeamsClient } from '../src/client/TeamsClient'
import { MAX_CHANNEL_PAGE_SIZE } from '../src/rest/routes/channels'
import {
  conversationMessagesUrl,
  validateConversationBackwardLink,
} from '../src/rest/routes/conversations'
import type { ConversationMessage } from '../src/types'

const requests: { url: URL; method: string }[] = []
const mocks: { mockRestore(): void }[] = []

function client() {
  return new TeamsClient({
    async getTokenFromScope() {
      return 'test-token'
    },
  })
}

function mockFetch(handler: (url: URL, init?: RequestInit) => Response | Promise<Response>) {
  const mock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
        )
        requests.push({ url, method: init?.method ?? 'GET' })
        return handler(url, init)
      },
      { preconnect: fetch.preconnect },
    ),
  )
  mocks.push(mock)
  return mock
}

const json = (data: unknown) => Response.json(data)

function message(id: string): ConversationMessage {
  return { id, sequenceId: Number(id.replace(/\D/g, '')) || 1 }
}

afterEach(() => {
  for (const mock of mocks.splice(0)) mock.mockRestore()
  requests.length = 0
})

describe('conversation message pagination', () => {
  test('follows backwardLink until enough messages are scanned', async () => {
    const nextLink =
      'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages?view=msnp24Equivalent&pageSize=2&startTime=3&syncState=next'
    mockFetch((url) => {
      if (url.searchParams.get('syncState') === 'next') {
        return json({ messages: [message('3'), message('4')] })
      }
      return json({
        messages: [message('1'), message('2')],
        _metadata: { backwardLink: nextLink, syncState: 'next' },
      })
    })

    const result = await client().teams.conversations.fetchMessagePages('conv', {
      pageSize: 2,
      maxMessages: 3,
    })

    expect(result.messages.map((item) => item.id)).toEqual(['1', '2', '3'])
    expect(requests.map((request) => request.url.pathname)).toEqual([
      '/api/chatsvc/jp/v1/users/ME/conversations/conv/messages',
      '/api/chatsvc/jp/v1/users/ME/conversations/conv/messages',
    ])
    expect(requests[1]?.url.searchParams.get('syncState')).toBe('next')
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('does not request another page once the first page satisfies the limit', async () => {
    mockFetch(() =>
      json({
        messages: [message('1'), message('2')],
        _metadata: {
          backwardLink:
            'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages?syncState=unused',
        },
      }),
    )

    const result = await client().teams.conversations.fetchMessagePages('conv', {
      pageSize: 2,
      maxMessages: 2,
    })

    expect(result.messages).toHaveLength(2)
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('throws on a repeated backwardLink', async () => {
    const repeated =
      'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages?syncState=loop'
    mockFetch((url) =>
      json({
        messages: [message(url.searchParams.has('syncState') ? '2' : '1')],
        _metadata: { backwardLink: repeated, syncState: 'loop' },
      }),
    )

    await expect(
      client().teams.conversations.fetchMessagePages('conv', {
        pageSize: 1,
        maxMessages: 10,
      }),
    ).rejects.toThrow('Repeated conversation message pagination link')
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('stops at the max page cap instead of looping forever', async () => {
    let page = 0
    mockFetch(() => {
      page += 1
      return json({
        messages: [message(String(page))],
        _metadata: {
          backwardLink: `https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages?syncState=${page}`,
        },
      })
    })

    await expect(
      client().teams.conversations.fetchMessagePages('conv', {
        pageSize: 1,
        maxMessages: 10,
        maxPages: 2,
      }),
    ).rejects.toThrow('Conversation message pagination exceeded 2 pages')
    expect(requests).toHaveLength(2)
  })

  test('validates backwardLink scheme, host, credentials, and chatsvc path', () => {
    const original = conversationMessagesUrl('conv')
    expect(
      validateConversationBackwardLink(
        'https://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages?syncState=x',
        original,
      ).host,
    ).toBe('teams.cloud.microsoft')
    expect(() =>
      validateConversationBackwardLink(
        'http://teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages',
        original,
      ),
    ).toThrow('must be HTTPS')
    expect(() =>
      validateConversationBackwardLink(
        'https://evil.example/api/chatsvc/jp/v1/users/ME/conversations/conv/messages',
        original,
      ),
    ).toThrow('host is not allowed')
    expect(() =>
      validateConversationBackwardLink(
        'https://user:pass@teams.cloud.microsoft/api/chatsvc/jp/v1/users/ME/conversations/conv/messages',
        original,
      ),
    ).toThrow('must be HTTPS')
    expect(() =>
      validateConversationBackwardLink('https://teams.cloud.microsoft/not-chatsvc', original),
    ).toThrow('path is not allowed')
    expect(() => validateConversationBackwardLink('not a url', original)).toThrow('Invalid')
  })
})

describe('channel message pagination', () => {
  test('follows continuationToken across pages until hasMore is false', async () => {
    mockFetch((url) => {
      const token = url.searchParams.get('continuationToken')
      if (token === 'token-1') {
        return json({
          replyChains: [{ messages: [message('c3'), message('c4')] }],
          hasMore: false,
          continuationToken: null,
        })
      }
      return json({
        replyChains: [{ messages: [message('c1'), message('c2')] }],
        hasMore: true,
        continuationToken: 'token-1',
      })
    })

    const result = await client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
      pageSize: 2,
      maxMessages: 10,
    })

    expect(result.messages.map((item) => item.id)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(result.pages).toBe(2)
    expect(requests).toHaveLength(2)
    expect(requests[0]?.url.searchParams.get('continuationToken')).toBeNull()
    expect(requests[1]?.url.searchParams.get('continuationToken')).toBe('token-1')
    expect(requests[1]?.url.searchParams.get('pageSize')).toBe('2')
    expect(
      requests.some((request) =>
        request.url.searchParams.has('lastModifiedTimeOfLastReturnedReplyChain'),
      ),
    ).toBe(false)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('caps pageSize at 50 and paginates for maxMessages 120', async () => {
    mockFetch((url) => {
      const token = url.searchParams.get('continuationToken')
      const page = token ? Number(token.replace('token-', '')) : 0
      const start = page * MAX_CHANNEL_PAGE_SIZE
      const count = Math.min(MAX_CHANNEL_PAGE_SIZE, 120 - start)
      return json({
        replyChains: [
          {
            messages: Array.from({ length: count }, (_, index) => message(`c${start + index + 1}`)),
          },
        ],
        hasMore: start + count < 120,
        continuationToken: `token-${page + 1}`,
      })
    })

    const result = await client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
      pageSize: 120,
      maxMessages: 120,
    })

    expect(MAX_CHANNEL_PAGE_SIZE).toBe(50)
    expect(result.messages).toHaveLength(120)
    expect(result.pages).toBe(3)
    expect(requests).toHaveLength(3)
    expect(requests.map((request) => Number(request.url.searchParams.get('pageSize')))).toEqual([
      50, 50, 50,
    ])
    expect(
      requests.every((request) => Number(request.url.searchParams.get('pageSize')) <= 50),
    ).toBe(true)
    expect(requests.map((request) => request.url.searchParams.get('continuationToken'))).toEqual([
      null,
      'token-1',
      'token-2',
    ])
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('stops when hasMore is false even with a continuationToken', async () => {
    mockFetch(() =>
      json({
        replyChains: [{ messages: [message('c1')] }],
        hasMore: false,
        continuationToken: 'unused-token',
      }),
    )

    const result = await client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
      pageSize: 1,
      maxMessages: 10,
    })

    expect(result.messages.map((item) => item.id)).toEqual(['c1'])
    expect(result.pages).toBe(1)
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('stops when hasMore is true but continuationToken is missing', async () => {
    mockFetch(() =>
      json({
        replyChains: [{ messages: [message('c1')] }],
        hasMore: true,
      }),
    )

    const result = await client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
      pageSize: 1,
      maxMessages: 10,
    })

    expect(result.messages.map((item) => item.id)).toEqual(['c1'])
    expect(result.pages).toBe(1)
    expect(requests).toHaveLength(1)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('throws on a repeated continuationToken', async () => {
    mockFetch((url) =>
      json({
        replyChains: [
          { messages: [message(url.searchParams.has('continuationToken') ? 'c2' : 'c1')] },
        ],
        hasMore: true,
        continuationToken: 'same-token',
      }),
    )

    await expect(
      client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
        pageSize: 1,
        maxMessages: 10,
      }),
    ).rejects.toThrow('Repeated channel message pagination cursor')
    expect(requests).toHaveLength(2)
    expect(requests[1]?.url.searchParams.get('continuationToken')).toBe('same-token')
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('stops at the max page cap', async () => {
    let page = 0
    mockFetch(() => {
      page += 1
      return json({
        replyChains: [{ messages: [message(`c${page}`)] }],
        hasMore: true,
        continuationToken: `token-${page}`,
      })
    })

    await expect(
      client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
        pageSize: 1,
        maxMessages: 10,
        maxPages: 2,
      }),
    ).rejects.toThrow('Channel message pagination exceeded 2 pages')
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })

  test('deduplicates message ids across pages', async () => {
    mockFetch((url) =>
      url.searchParams.get('continuationToken') === 'token-1'
        ? json({
            replyChains: [{ messages: [message('c2'), message('c3')] }],
            hasMore: false,
            continuationToken: null,
          })
        : json({
            replyChains: [{ messages: [message('c1'), message('c2')] }],
            hasMore: true,
            continuationToken: 'token-1',
          }),
    )

    const result = await client().teams.channels.fetchMessagePages('team-1', 'channel-1', {
      pageSize: 2,
      maxMessages: 10,
    })

    expect(result.messages.map((item) => item.id)).toEqual(['c1', 'c2', 'c3'])
    expect(result.pages).toBe(2)
    expect(requests).toHaveLength(2)
    expect(requests.every((request) => request.method === 'GET')).toBe(true)
  })
})
