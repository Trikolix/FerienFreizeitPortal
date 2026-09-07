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
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAAC0lEQVQImWNgQAYAAA4AAbGa6gYAAAAASUVORK5CYII=', 'base64');
const uploadData = new FormData();
uploadData.append('images[]', new Blob([png], { type: 'image/png' }), 'test.png');
uploadData.append('upload_metadata', JSON.stringify([{ alt_text: 'Ein Testpixel', is_decorative: false }]));
const uploadResponse = await fetch(base + `/api/camps/${id}/images`, { method: 'POST', headers: { 'X-Requested-With': 'FerienFreizeitPortal', ...club }, body: uploadData });
const upload = await uploadResponse.json();
assert.equal(uploadResponse.status, 200, JSON.stringify(upload));
assert.equal(upload.image_metadata[0].alt_text, 'Ein Testpixel');
const imageId = upload.image_metadata[0].id;
assert.equal((await request(`/api/camps/${id}/images/${imageId}`, 'PUT', { alt_text: 'Testpixel & Beschreibung', is_decorative: false }, club)).status, 200);
assert.equal((await request(`/api/camps/${id}/images/${imageId}`, 'PUT', { alt_text: 'x'.repeat(501) }, club)).status, 422);
assert.equal((await request(`/api/camps/${id}`)).status, 404);
assert.equal((await request(`/api/camps/${id}`, 'PUT', { title: 'Forgery' }, { Cookie: club.Cookie })).status, 403);
assert.equal((await request(`/api/camps/${id}`, 'PUT', { status: 'published' }, club)).status, 422);
const camp = { title: 'SQL smoke published', description: '<p onmouseover="alert(1)">Safe</p>', categories: ['Natur'], min_age: 8, max_age: 16, location_text: 'Zwickau', starts_at: '2035-08-01T10:00', ends_at: '2035-08-08T12:00', registration_deadline: '2035-07-01T12:00', price_eur: 0, status: 'published', place_requests_enabled: true, allocation_method: 'request', capacity_total: 20, places_remaining: 6, waitlist_enabled: true, place_request_email: 'private-booking@example.test' };
assert.equal((await request(`/api/camps/${id}`, 'PUT', camp, club)).status, 200);
const detail = await request(`/api/camps/${id}`);
assert.equal(detail.status, 200);
assert.equal(detail.body.description, '<p>Safe</p>');
assert.equal(Object.hasOwn(detail.body, 'username'), false);
assert.equal(detail.body.availability_state, 'available');
assert.equal(detail.body.image_metadata[0].alt_text, 'Testpixel & Beschreibung');
assert.equal(detail.body.images[0], detail.body.image_metadata[0].image_url);
for (const field of ['capacity_total', 'places_remaining', 'place_request_email', 'place_requests_enabled']) assert.equal(Object.hasOwn(detail.body, field), false);
const noAuthAvailability = await request(`/api/camps/${id}/availability`, 'PUT', { places_remaining: 0 });
assert.equal(noAuthAvailability.status, 401);
const availability = await request(`/api/camps/${id}/availability`, 'PUT', { places_remaining: 0 }, club);
assert.equal(availability.status, 200, JSON.stringify(availability.body));
assert.equal((await request(`/api/camps/${id}`)).body.availability_state, 'waitlist');
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
