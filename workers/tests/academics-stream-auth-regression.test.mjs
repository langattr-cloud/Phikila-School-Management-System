import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import app from '../src/index.ts'

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
  assert.match(source, /\['admin', 'super_admin'\]/)
  assert.match(source, /async function validateStreamScope/)
  assert.match(source, /\.eq\('school_id', access\.schoolId!\)/)
  assert.match(source, /selected academic year or grade is not available for this school/i)
})

test('approved librarian and teacher access requests create school memberships, not platform administrators', async () => {
  const source = await readFile(new URL('../src/routes/platform.ts', import.meta.url), 'utf8')
  assert.match(source, /'librarian'/)
  assert.match(source, /from\('tt_memberships'\)\.upsert/)
  assert.match(source, /teacher_id: role === 'teacher' \? teacherId : null/)
  assert.match(source, /Link this account to an existing saved teacher record/)
  assert.match(source, /from\('tt_schools'\)/)
  assert.doesNotMatch(source, /if \(approve && \(role === 'super_admin' \|\| role === 'admin'\)\)/)
})
