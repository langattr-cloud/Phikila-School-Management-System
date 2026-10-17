import test from 'node:test'
import assert from 'node:assert/strict'
import app from '../src/index.ts'

test('finance API rejects requests without a verified bearer token', async () => {
  const response = await app.request('/api/v1/finance/payments')
  assert.equal(response.status, 401)
  assert.match((await response.json()).detail, /Not authenticated/)
})

test('CORS preflight permits the explicit school context header', async () => {
  const response = await app.request('/api/v1/finance/payments', {
    method: 'OPTIONS',
    headers: {
      Origin: 'https://example.test',
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'authorization,x-school-id',
    },
  })
  assert.equal(response.status, 204)
  assert.match(response.headers.get('Access-Control-Allow-Headers') ?? '', /X-School-Id/i)
})
