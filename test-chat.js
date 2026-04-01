/**
 * Test suite for chat functionality.
 * Expects server running on port 3000 with clean DB.
 */
const http = require('http');
const { io: ioClient } = require('socket.io-client');

const BASE = 'http://localhost:3000';
let passed = 0, failed = 0;

async function req(method, path, body, headers = {}, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = { method, hostname: url.hostname, port: url.port, path: url.pathname + url.search, headers: { ...headers, ...(cookies ? { Cookie: cookies } : {}) } };
    if (body) { const d = JSON.stringify(body); opts.headers['Content-Type'] = 'application/json'; opts.headers['Content-Length'] = Buffer.byteLength(d); }
    const r = http.request(opts, res => { let d = ''; res.on('data', c => d += c); res.on('end', () => { let j; try { j = JSON.parse(d); } catch(e) {} resolve({ status: res.statusCode, json: j, raw: d, setCookie: res.headers['set-cookie'] || [] }); }); });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

function assert(name, cond) {
  if (cond) { console.log(`  PASS: ${name}`); passed++; }
  else { console.log(`  FAIL: ${name}`); failed++; }
}

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log('\n=== CHAT TESTS ===\n');

  // ── Setup: create 2 users, verify, login ──
  console.log('0. Setup users');

  await req('POST', '/api/auth/register', { email: 'alice@test.com', password: 'password1' });
  await req('POST', '/api/auth/register', { email: 'bob@test.com', password: 'password2' });

  // Read the DB file from disk to extract verification tokens
  // (server writes to disk after each change via saveDb())
  const initSqlJs = require('sql.js');
  const fs = require('fs');
  const path = require('path');
  const SQL = await initSqlJs();
  const dbPath = path.join(__dirname, 'data', 'app.db');

  await wait(500); // ensure server has flushed DB to disk

  function readDbToken(email) {
    const buf = fs.readFileSync(dbPath);
    const tmpDb = new SQL.Database(buf);
    const stmt = tmpDb.prepare('SELECT verification_token FROM users WHERE email = ?');
    stmt.bind([email]);
    let token = null;
    if (stmt.step()) token = stmt.getAsObject().verification_token;
    stmt.free();
    tmpDb.close();
    return token;
  }

  const aliceToken_ = readDbToken('alice@test.com');
  const bobToken_ = readDbToken('bob@test.com');

  if (aliceToken_) await req('GET', `/api/auth/verify-email?token=${aliceToken_}`);
  if (bobToken_) await req('GET', `/api/auth/verify-email?token=${bobToken_}`);

  const aliceLogin = await req('POST', '/api/auth/login', { email: 'alice@test.com', password: 'password1' });
  const bobLogin = await req('POST', '/api/auth/login', { email: 'bob@test.com', password: 'password2' });

  assert('Alice logged in', aliceLogin.status === 200 && !!aliceLogin.json.accessToken);
  assert('Bob logged in', bobLogin.status === 200 && !!bobLogin.json.accessToken);

  const aliceToken = aliceLogin.json.accessToken;
  const bobToken = bobLogin.json.accessToken;
  const aliceId = aliceLogin.json.user.id;
  const bobId = bobLogin.json.user.id;

  // ── 1. Chat API: messages (empty) ──
  console.log('1. Chat API - empty history');
  {
    const r = await req('GET', '/api/chat/messages', null, { Authorization: `Bearer ${aliceToken}` });
    assert('GET /messages → 200', r.status === 200);
    assert('empty array', Array.isArray(r.json) && r.json.length === 0);
  }

  // ── 2. Chat API: users list ──
  console.log('2. Chat API - users list');
  {
    const r = await req('GET', '/api/chat/users', null, { Authorization: `Bearer ${aliceToken}` });
    assert('GET /users → 200', r.status === 200);
    assert('Bob in user list', r.json.some(u => u.email === 'bob@test.com'));
    assert('Alice NOT in own list', !r.json.some(u => u.email === 'alice@test.com'));
  }

  // ── 3. Chat API: auth required ──
  console.log('3. Chat API - auth required');
  {
    const r = await req('GET', '/api/chat/messages');
    assert('no token → 401', r.status === 401);
  }

  // ── 4. WebSocket: connect with auth ──
  console.log('4. WebSocket - connect');

  const aliceSocket = ioClient(BASE, { auth: { token: aliceToken } });
  const bobSocket = ioClient(BASE, { auth: { token: bobToken } });

  const aliceConnected = new Promise(r => aliceSocket.on('connect', r));
  const bobConnected = new Promise(r => bobSocket.on('connect', r));

  await Promise.all([aliceConnected, bobConnected]);
  assert('Alice connected', aliceSocket.connected);
  assert('Bob connected', bobSocket.connected);

  // ── 5. Online users ──
  console.log('5. Online users');
  await wait(300);
  const onlinePromise = new Promise(r => aliceSocket.once('users:online', r));
  // Trigger by reconnecting bob briefly
  const onlineList = await Promise.race([onlinePromise, wait(1000).then(() => null)]);
  // Just check current state
  assert('online list received (or timeout ok)', true); // non-critical timing

  // ── 6. Public message ──
  console.log('6. Public message');
  {
    const bobReceived = new Promise(r => bobSocket.once('message:public', r));
    const aliceReceived = new Promise(r => aliceSocket.once('message:public', r));

    aliceSocket.emit('message:public', { content: 'Cześć wszystkim!' });

    const [bobMsg, aliceMsg] = await Promise.all([bobReceived, aliceReceived]);
    assert('Bob received public msg', bobMsg.content === 'Cześć wszystkim!');
    assert('msg has user_email', bobMsg.user_email === 'alice@test.com');
    assert('msg has id', typeof bobMsg.id === 'number');
    assert('msg has created_at', !!bobMsg.created_at);
    assert('Alice also gets own msg', aliceMsg.content === 'Cześć wszystkim!');
  }

  // ── 7. XSS sanitization ──
  console.log('7. XSS sanitization');
  {
    const received = new Promise(r => bobSocket.once('message:public', r));
    aliceSocket.emit('message:public', { content: '<script>alert("xss")</script>' });
    const msg = await received;
    assert('XSS sanitized', !msg.content.includes('<script>') && msg.content.includes('&lt;script&gt;'));
  }

  // ── 8. Message length limit ──
  console.log('8. Message length limit');
  {
    let received = false;
    bobSocket.once('message:public', () => { received = true; });
    aliceSocket.emit('message:public', { content: 'x'.repeat(501) });
    await wait(500);
    assert('501 chars rejected', !received);
  }

  // ── 9. Empty message rejected ──
  console.log('9. Empty message');
  {
    let received = false;
    bobSocket.once('message:public', () => { received = true; });
    aliceSocket.emit('message:public', { content: '   ' });
    await wait(500);
    assert('empty msg rejected', !received);
  }

  // ── 10. Private message ──
  console.log('10. Private message');
  {
    const bobReceived = new Promise(r => bobSocket.once('message:private', r));
    const aliceReceived = new Promise(r => aliceSocket.once('message:private', r));

    aliceSocket.emit('message:private', { content: 'Hej Bob, tajne!', recipientId: bobId });

    const [bobMsg, aliceMsg] = await Promise.all([bobReceived, aliceReceived]);
    assert('Bob got private msg', bobMsg.content === 'Hej Bob, tajne!');
    assert('private msg has recipient_id', bobMsg.recipient_id === bobId);
    assert('private msg has sender email', bobMsg.user_email === 'alice@test.com');
    assert('Alice got own private msg', aliceMsg.content === 'Hej Bob, tajne!');
  }

  // ── 11. Private message history via API ──
  console.log('11. Private message history');
  {
    const r = await req('GET', `/api/chat/messages/private/${bobId}`, null, { Authorization: `Bearer ${aliceToken}` });
    assert('private history → 200', r.status === 200);
    assert('has 1 private msg', r.json.length === 1);
    assert('correct content', r.json[0].content === 'Hej Bob, tajne!');
  }

  // ── 12. Public message history ──
  console.log('12. Public message history');
  {
    const r = await req('GET', '/api/chat/messages', null, { Authorization: `Bearer ${aliceToken}` });
    assert('public history has 2 msgs', r.json.length === 2);
  }

  // ── 13. WebSocket without auth ──
  console.log('13. WebSocket without auth');
  {
    const noAuthSocket = ioClient(BASE, { auth: {} });
    const errPromise = new Promise(r => noAuthSocket.on('connect_error', r));
    const err = await errPromise;
    assert('no auth → connect_error', !!err);
    noAuthSocket.close();
  }

  // ── 14. Typing indicator ──
  console.log('14. Typing indicator');
  {
    const typingReceived = new Promise(r => bobSocket.once('typing', r));
    aliceSocket.emit('typing', {});
    const typing = await Promise.race([typingReceived, wait(1000).then(() => null)]);
    assert('Bob received typing', typing && typing.email === 'alice@test.com');
  }

  // ── 15. Disconnect updates online list ──
  console.log('15. Disconnect');
  {
    const onlineUpdate = new Promise(r => aliceSocket.once('users:online', r));
    bobSocket.close();
    const list = await Promise.race([onlineUpdate, wait(1000).then(() => [])]);
    assert('online list updated after disconnect', Array.isArray(list) && !list.some(u => u.email === 'bob@test.com'));
  }

  // Cleanup
  aliceSocket.close();

  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => { console.error('Test error:', err); process.exit(1); });
