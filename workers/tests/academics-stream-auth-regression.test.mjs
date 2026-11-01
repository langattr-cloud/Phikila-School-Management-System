import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('platform school access grants are scoped memberships and cannot elevate accounts to platform admins', async () => {
  const source = await readFile(new URL('../src/routes/platform.ts', import.meta.url), 'utf8')
  const schoolGrant = source.slice(source.indexOf("platformRoutes.post('/schools/:schoolId/administrators'"), source.indexOf("platformRoutes.delete('/schools/:schoolId/administrators/"))
  assert.match(source, /const GRANTABLE_ROLES = \[[^\]]*'librarian'/)
  assert.match(source, /const REQUESTABLE_ROLES = \[[^\]]*'librarian'/)
  assert.match(source, /from\('tt_memberships'\)\.upsert/)
  assert.match(schoolGrant, /from\('tt_memberships'\)\.upsert/)
  assert.doesNotMatch(schoolGrant, /tt_platform_admins/)
  assert.match(source, /from\('tt_schools'\)/)
  assert.match(source, /from\('tt_memberships'\)[\s\S]*?select\('user_id,email,phone,role,is_active,created_at'\)/)
  assert.match(source, /Teacher access must be approved through an access request/)
})

test('school membership removal does not delete a platform administrator account', async () => {
  const source = await readFile(new URL('../src/routes/platform.ts', import.meta.url), 'utf8')
  const removal = source.slice(source.indexOf("platformRoutes.delete('/schools/:schoolId/administrators/"), source.indexOf("platformRoutes.get('/administrators'"))
  assert.match(removal, /from\('tt_memberships'\)\.delete/)
  assert.doesNotMatch(removal, /tt_platform_admins/)
})
