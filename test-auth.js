/**
 * Test suite for auth API.
 * Run: node test-auth.js
 * Requires server to NOT be running (starts its own).
 */
require('dotenv').config();
process.env.RATE_LIMIT_MAX = '1000'; // disable rate limiting for tests

const http = require('http');
const path = require('path');

const BASE = 'http://localhost:3000';
let passed = 0;
let failed = 0;

async function req(method, urlPath, body = null, headers = {}, cookies = '') {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, BASE);
    const opts = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        ...headers,
        ...(cookies ? { Cookie: cookies } : {})
      }
    };
    if (body) {
      const data = JSON.stringify(body);
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(data);
    }
    const request = http.request(opts, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch(e) {}
        const setCookie = res.headers['set-cookie'] || [];
        resolve({ status: res.statusCode, json, raw, setCookie });
      });
    });
    request.on('error', reject);
    if (body) request.write(JSON.stringify(body));
    request.end();
  });
}

function assert(name, condition) {
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
    failed++;
  }
}

async function run() {
  // Clear DB
  const fs = require('fs');
  const dbPath = path.join(__dirname, 'data', 'app.db');
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

  // Start server
  const { migrate, getDb, queryOne } = require('./server/db');
  await migrate();

  const express = require('express');
  const cookieParser = require('cookie-parser');
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', require('./server/routes/auth'));

  const server = await new Promise(resolve => {
    const s = app.listen(3000, () => resolve(s));
  });

  console.log('\n=== AUTH API TESTS ===\n');

  // ── 1. Register ──
  console.log('1. Register');
  {
    const r = await req('POST', '/api/auth/register', { email: 'user@test.com', password: 'password123' });
    assert('returns 201', r.status === 201);
    assert('returns message', r.json && r.json.message && r.json.message.includes('Konto utworzone'));
  }

  // ── 2. Register - validation ──
  console.log('2. Register validation');
  {
    const r1 = await req('POST', '/api/auth/register', {});
    assert('missing fields → 400', r1.status === 400);

    const r2 = await req('POST', '/api/auth/register', { email: 'bad', password: 'password123' });
    assert('bad email → 400', r2.status === 400);

    const r3 = await req('POST', '/api/auth/register', { email: 'x@y.com', password: '123' });
    assert('short password → 400', r3.status === 400);
  }

  // ── 3. Register - duplicate ──
  console.log('3. Duplicate register');
  {
    const r = await req('POST', '/api/auth/register', { email: 'user@test.com', password: 'password123' });
    assert('duplicate → 409', r.status === 409);
  }

  // ── 4. Dev mode: auto-verified ──
  console.log('4. Dev mode: auto-verified on register');
  {
    const user = queryOne('SELECT is_verified, verification_token FROM users WHERE email = ?', ['user@test.com']);
    assert('is_verified = 1 (dev auto-verify)', user.is_verified === 1);
    assert('no verification_token (dev mode)', !user.verification_token);
  }

  // ── 5. Verify invalid token ──
  // ── 5. Verify invalid token ──
  console.log('5. Verify invalid token');
  {
    const r = await req('GET', '/api/auth/verify-email?token=invalidtoken');
    assert('invalid token shows error', r.raw.includes('nieprawidłowy'));
  }

  // ── 7. Login verified ──
  console.log('7. Login verified');
  let accessToken = '';
  let refreshCookie = '';
  {
    const r = await req('POST', '/api/auth/login', { email: 'user@test.com', password: 'password123' });
    assert('login → 200', r.status === 200);
    assert('returns accessToken', !!r.json.accessToken);
    assert('returns user', !!r.json.user && r.json.user.email === 'user@test.com');
    assert('sets refreshToken cookie', r.setCookie.some(c => c.includes('refreshToken')));
    assert('cookie is HttpOnly', r.setCookie.some(c => c.includes('HttpOnly')));

    accessToken = r.json.accessToken;
    const rc = r.setCookie.find(c => c.startsWith('refreshToken='));
    refreshCookie = rc ? rc.split(';')[0] : '';
  }

  // ── 8. Login wrong password ──
  console.log('8. Login wrong password');
  {
    const r = await req('POST', '/api/auth/login', { email: 'user@test.com', password: 'wrongpass' });
    assert('wrong password → 401', r.status === 401);
  }

  // ── 9. GET /me ──
  console.log('9. GET /me');
  {
    const r = await req('GET', '/api/auth/me', null, { Authorization: `Bearer ${accessToken}` });
    assert('/me → 200', r.status === 200);
    assert('/me returns user email', r.json && r.json.user && r.json.user.email === 'user@test.com');
  }

  // ── 10. GET /me without token ──
  console.log('10. GET /me without token');
  {
    const r = await req('GET', '/api/auth/me');
    assert('no token → 401', r.status === 401);
  }

  // ── 11. Refresh token ──
  console.log('11. Refresh token');
  {
    const r = await req('POST', '/api/auth/refresh', null, {}, refreshCookie);
    assert('refresh → 200', r.status === 200);
    assert('refresh returns new accessToken', !!r.json.accessToken);
    assert('refresh returns user', !!r.json.user);
  }

  // ── 12. Refresh without cookie ──
  console.log('12. Refresh without cookie');
  {
    const r = await req('POST', '/api/auth/refresh');
    assert('no cookie → 401', r.status === 401);
  }

  // ── 13. Forgot password ──
  console.log('13. Forgot password');
  {
    const r = await req('POST', '/api/auth/forgot-password', { email: 'user@test.com' });
    assert('forgot → 200', r.status === 200);
    assert('returns message', r.json && r.json.message);

    const user = queryOne('SELECT reset_token, reset_token_expires FROM users WHERE email = ?', ['user@test.com']);
    assert('reset_token set in DB', !!user.reset_token);
    assert('reset_token_expires set', !!user.reset_token_expires);
  }

  // ── 14. Forgot password non-existent ──
  console.log('14. Forgot password non-existent email');
  {
    const r = await req('POST', '/api/auth/forgot-password', { email: 'nobody@test.com' });
    assert('non-existent → still 200 (no leak)', r.status === 200);
  }

  // ── 15. Reset password ──
  console.log('15. Reset password');
  {
    const user = queryOne('SELECT reset_token FROM users WHERE email = ?', ['user@test.com']);
    const r = await req('POST', '/api/auth/reset-password', { token: user.reset_token, password: 'newpass456' });
    assert('reset → 200', r.status === 200);
    assert('reset success message', r.json && r.json.message && r.json.message.includes('zmienione'));

    const userAfter = queryOne('SELECT reset_token FROM users WHERE email = ?', ['user@test.com']);
    assert('reset_token cleared', !userAfter.reset_token);
  }

  // ── 16. Login with new password ──
  console.log('16. Login with new password');
  {
    const r = await req('POST', '/api/auth/login', { email: 'user@test.com', password: 'newpass456' });
    assert('login with new password → 200', r.status === 200);
    assert('returns accessToken', !!r.json.accessToken);
  }

  // ── 17. Login with old password ──
  console.log('17. Login with old password fails');
  {
    const r = await req('POST', '/api/auth/login', { email: 'user@test.com', password: 'password123' });
    assert('old password → 401', r.status === 401);
  }

  // ── 18. Reset with invalid token ──
  console.log('18. Reset with invalid token');
  {
    const r = await req('POST', '/api/auth/reset-password', { token: 'faketoken', password: 'whatever123' });
    assert('invalid reset token → 400', r.status === 400);
  }

  // ── 19. Logout ──
  console.log('19. Logout');
  {
    const r = await req('POST', '/api/auth/logout', null, {}, refreshCookie);
    assert('logout → 200', r.status === 200);
    assert('clears cookie', r.setCookie.some(c => c.includes('refreshToken=') && (c.includes('Max-Age=0') || c.includes('Expires=Thu, 01 Jan 1970'))));
  }

  // ── Summary ──
  console.log(`\n=== RESULTS: ${passed} passed, ${failed} failed ===\n`);

  server.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
