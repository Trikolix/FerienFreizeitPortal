// Only run against an explicitly selected, disposable local test database.
// FFP_SQL_SMOKE=1 node backend/tests/sql-smoke.mjs http://127.0.0.1:18081
import assert from 'node:assert/strict';

const base = process.argv[2];
if (process.env.FFP_SQL_SMOKE !== '1' || !base || new URL(base).hostname !== '127.0.0.1') {
  throw new Error('Set FFP_SQL_SMOKE=1 and provide a loopback API backed by a disposable database.');
}
async function request(path, method = 'GET', data, auth = {}) {
  const response = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'FerienFreizeitPortal', ...auth },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  return { status: response.status, body: await response.json().catch(() => null), headers: response.headers };
}
async function login(name) {
  const response = await request('/api/login', 'POST', { username: name, password: name });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  return { Cookie: cookie.split(';')[0], 'X-CSRF-Token': response.body.csrf_token };
}

const club = await login('testverein');
const admin = await login('admin');
const before = await request('/api/camps?all=1', 'GET', undefined, admin);
assert.equal(before.status, 200);
const create = await request('/api/camps', 'POST', { title: 'SQL smoke draft' }, club);
assert.equal(create.status, 201, JSON.stringify(create.body));
const id = create.body.id;
assert.ok(Number(id) > 0);
assert.equal((await request(`/api/camps/${id}`)).status, 404);
assert.equal((await request(`/api/camps/${id}`, 'PUT', { title: 'Forgery' }, { Cookie: club.Cookie })).status, 403);
assert.equal((await request(`/api/camps/${id}`, 'PUT', { status: 'published' }, club)).status, 422);
const camp = { title: 'SQL smoke published', description: '<p onmouseover="alert(1)">Safe</p>', categories: ['Natur'], min_age: 8, max_age: 16, location_text: 'Zwickau', starts_at: '2035-08-01T10:00', ends_at: '2035-08-08T12:00', registration_deadline: '2035-07-01T12:00', price_eur: 0, status: 'published' };
assert.equal((await request(`/api/camps/${id}`, 'PUT', camp, club)).status, 200);
const detail = await request(`/api/camps/${id}`);
assert.equal(detail.status, 200);
assert.equal(detail.body.description, '<p>Safe</p>');
assert.equal(Object.hasOwn(detail.body, 'username'), false);
assert.equal((await request('/api/camps?types=Natur&age=10&start_date=2035-07-01&end_date=2035-09-01')).status, 200);
const booked = await request(`/api/camps/${id}`, 'PUT', { ...camp, status: 'fully_booked' }, admin);
assert.equal(booked.status, 200, JSON.stringify(booked.body));
const holiday = await request('/api/admin/holidays', 'POST', { name: 'SQL smoke holidays', starts_at: '2035-08-01', ends_at: '2035-08-15' }, admin);
assert.equal(holiday.status, 200, JSON.stringify(holiday.body));
assert.ok(Number(holiday.body.id) > 0);
assert.equal((await request('/api/admin/holidays', 'POST', { name: 'Overlap', starts_at: '2035-08-02', ends_at: '2035-08-08' }, admin)).status, 409);
assert.equal((await request(`/api/admin/holidays/${holiday.body.id}`, 'DELETE', undefined, admin)).status, 200);
assert.equal((await request(`/api/camps/${id}`, 'DELETE', undefined, club)).status, 200);
assert.equal((await request('/api/camps?all=1', 'GET', undefined, admin)).body.length, before.body.length);
for (const path of ['/database.sqlite', '/config.local.php', '/error.log', '/schema.sql', '/composer.json', '/vendor/autoload.php', '/tests/sql-smoke.mjs']) {
  assert.ok([403, 404].includes((await request(path)).status), path + ' must not be public');
}
assert.equal((await request('/api/logout', 'POST', undefined, club)).status, 200);
assert.equal((await request('/api/me', 'GET', undefined, club)).status, 401);
console.log('SQL/Apache smoke passed:', base);
