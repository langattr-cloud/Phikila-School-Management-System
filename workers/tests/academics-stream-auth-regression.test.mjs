import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import app from '../src/index.ts'

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


test('stream endpoints require a verified school membership before reading or mutating data', async () => {
  const cases = [
    ['GET', '/api/v1/academics/years/1/grades/1/streams'],
    ['GET', '/api/v1/academics/levels/1/streams'],
    ['GET', '/api/v1/academics/streams/1'],
    ['POST', '/api/v1/academics/streams'],
    ['POST', '/api/v1/academics/streams/bulk'],
    ['PATCH', '/api/v1/academics/streams/1'],
    ['DELETE', '/api/v1/academics/streams/1'],
    ['GET', '/api/v1/academics/streams/1/students'],
    ['POST', '/api/v1/academics/streams/1/students'],
  ]
  for (const [method, path] of cases) {
    const response = await app.request(path, { method, headers: { 'Content-Type': 'application/json' }, body: method === 'GET' || method === 'DELETE' ? undefined : '{}' })
    assert.equal(response.status, 401, method + ' ' + path)
  }
})

test('stream queries are constrained to the verified school and validate academic-year and grade ownership', async () => {
  const source = await readFile(new URL('../src/routes/academics.ts', import.meta.url), 'utf8')
  assert.match(source, /async function requireAcademicSchoolAccess/)
  assert.match(source, /tt_memberships/)
  assert.match(source, /from\('tt_schools'\)/)
  assert.doesNotMatch(source, /from\('school_info'\)/)
  assert.match(source, /\['admin', 'super_admin'\]/)
  assert.match(source, /async function validateStreamScope/)
  assert.match(source, /\.eq\('school_id', access\.schoolId!\)/)
  assert.match(source, /selected academic year or grade is not available for this school/i)
})
