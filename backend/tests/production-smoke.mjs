// FFP_SQL_SMOKE=1 node backend/tests/production-smoke.mjs http://127.0.0.1:18083
// Requires a FRESH disposable SQL database and the test bootstrap credentials below.
import assert from 'node:assert/strict';
const base = process.argv[2];
if (process.env.FFP_SQL_SMOKE !== '1' || !base || new URL(base).hostname !== '127.0.0.1') throw new Error('Disposable local API required.');
const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'FerienFreizeitPortal' };
const demo = await fetch(base + '/api/login', { method: 'POST', headers, body: JSON.stringify({ username: 'admin', password: 'admin' }) });
assert.equal(demo.status, 401, 'Production must not seed demo accounts even with SEED_DEMO_DATA=1');
const login = await fetch(base + '/api/login', { method: 'POST', headers, body: JSON.stringify({ username: 'bootstrap@example.test', password: 'temporary-bootstrap-test-password' }) });
assert.equal(login.status, 200, await login.clone().text());
const cookie = login.headers.get('set-cookie');
assert.match(cookie, /^__Host-ffp_session=/);
assert.match(cookie, /; secure/i);
assert.match(cookie, /; HttpOnly/i);
assert.match(cookie, /; SameSite=Lax/i);
const data = await login.json();
assert.equal(data.user.role, 'master_admin');
const auth = { ...headers, Cookie: cookie.split(';')[0], 'X-CSRF-Token': data.csrf_token };
const users = await fetch(base + '/api/admin/users', { headers: auth });
assert.equal((await users.json()).length, 1);
const camps = await fetch(base + '/api/camps');
assert.deepEqual(await camps.json(), []);
const forged = await fetch(base + '/api/logout', { method: 'POST', headers: { ...auth, Origin: 'https://foreign.example.test' } });
assert.equal(forged.status, 403);
assert.equal((await fetch(base + '/api/logout', { method: 'POST', headers: auth })).status, 200);
assert.equal((await fetch(base + '/api/me', { headers: auth })).status, 401);
console.log('Production configuration, bootstrap and secure-cookie checks passed. HTTPS transport still requires deployment testing.');
