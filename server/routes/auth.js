const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { queryOne, runSql } = require('../db');
const { authLimiter } = require('../middleware/rateLimit');
const { sendEmail } = require('../emails/sender');
const { verificationEmail, resetPasswordEmail } = require('../emails/templates');

const router = express.Router();

const SALT_ROUNDS = 12;
const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES = '7d';
const REFRESH_COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 dni w ms

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function generateAccessToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { id: user.id },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES }
  );
}

function setRefreshCookie(res, token) {
  res.cookie('refreshToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: REFRESH_COOKIE_MAX_AGE,
    path: '/api/auth'
  });
}

// ─── POST /api/auth/register ────────────────────────────────────
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email i hasło są wymagane' });
    }
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Nieprawidłowy format email' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków' });
    }

    const existing = queryOne('SELECT id FROM users WHERE email = ?', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Konto z tym adresem email już istnieje' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    runSql(
      `INSERT INTO users (email, password_hash, verification_token) VALUES (?, ?, ?)`,
      [email, passwordHash, verificationToken]
    );

    const verifyUrl = `${process.env.APP_URL}/api/auth/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: email,
      subject: 'Potwierdź swój email — Szlaki Lubelszczyzny',
      html: verificationEmail(verifyUrl)
    });

    res.status(201).json({ message: 'Konto utworzone. Sprawdź email, aby je aktywować.' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── POST /api/auth/login ───────────────────────────────────────
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email i hasło są wymagane' });
    }

    const user = queryOne('SELECT * FROM users WHERE email = ?', [email]);

    if (!user) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Nieprawidłowy email lub hasło' });
    }

    if (!user.is_verified) {
      return res.status(403).json({ error: 'Konto nie zostało aktywowane. Sprawdź swoją skrzynkę email.' });
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);
    setRefreshCookie(res, refreshToken);

    res.json({
      accessToken,
      user: { id: user.id, email: user.email }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── POST /api/auth/logout ──────────────────────────────────────
router.post('/logout', (req, res) => {
  res.clearCookie('refreshToken', { path: '/api/auth' });
  res.json({ message: 'Wylogowano pomyślnie' });
});

// ─── POST /api/auth/refresh ─────────────────────────────────────
router.post('/refresh', (req, res) => {
  const token = req.cookies.refreshToken;
  if (!token) {
    return res.status(401).json({ error: 'Brak refresh tokenu' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET);
    const user = queryOne('SELECT id, email FROM users WHERE id = ?', [decoded.id]);

    if (!user) {
      return res.status(401).json({ error: 'Użytkownik nie istnieje' });
    }

    const accessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);
    setRefreshCookie(res, newRefreshToken);

    res.json({ accessToken, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.clearCookie('refreshToken', { path: '/api/auth' });
    return res.status(401).json({ error: 'Refresh token wygasł' });
  }
});

// ─── GET /api/auth/verify-email ─────────────────────────────────
router.get('/verify-email', (req, res) => {
  const { token } = req.query;

  if (!token) {
    return res.status(400).send(verifyResultPage(false, 'Brak tokenu weryfikacji.'));
  }

  const user = queryOne('SELECT id FROM users WHERE verification_token = ?', [token]);

  if (!user) {
    return res.send(verifyResultPage(false, 'Link aktywacyjny jest nieprawidłowy lub już został użyty.'));
  }

  runSql(
    `UPDATE users SET is_verified = 1, verification_token = NULL, updated_at = datetime('now') WHERE id = ?`,
    [user.id]
  );

  res.send(verifyResultPage(true, 'Email został potwierdzony! Możesz się teraz zalogować.'));
});

// ─── POST /api/auth/forgot-password ─────────────────────────────
router.post('/forgot-password', authLimiter, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email jest wymagany' });
    }

    const user = queryOne('SELECT id FROM users WHERE email = ?', [email]);

    // Zawsze zwracaj sukces (nie ujawniaj czy email istnieje)
    if (!user) {
      return res.json({ message: 'Jeśli konto istnieje, wysłaliśmy link do resetu hasła.' });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1h

    runSql(
      `UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = datetime('now') WHERE id = ?`,
      [resetToken, expires, user.id]
    );

    const resetUrl = `${process.env.APP_URL}/reset-password.html?token=${resetToken}`;
    await sendEmail({
      to: email,
      subject: 'Reset hasła — Szlaki Lubelszczyzny',
      html: resetPasswordEmail(resetUrl)
    });

    res.json({ message: 'Jeśli konto istnieje, wysłaliśmy link do resetu hasła.' });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── POST /api/auth/reset-password ──────────────────────────────
router.post('/reset-password', authLimiter, async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token i nowe hasło są wymagane' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć minimum 8 znaków' });
    }

    const user = queryOne(
      `SELECT id FROM users WHERE reset_token = ? AND reset_token_expires > datetime('now')`,
      [token]
    );

    if (!user) {
      return res.status(400).json({ error: 'Link do resetu jest nieprawidłowy lub wygasł.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    runSql(
      `UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now') WHERE id = ?`,
      [passwordHash, user.id]
    );

    res.json({ message: 'Hasło zostało zmienione. Możesz się teraz zalogować.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ error: 'Błąd serwera' });
  }
});

// ─── GET /api/auth/me ───────────────────────────────────────────
const { verifyToken } = require('../middleware/auth');

router.get('/me', verifyToken, (req, res) => {
  const user = queryOne('SELECT id, email, created_at FROM users WHERE id = ?', [req.user.id]);
  if (!user) return res.status(404).json({ error: 'Użytkownik nie znaleziony' });
  res.json({ user });
});

// Helper: strona HTML z wynikiem weryfikacji
function verifyResultPage(success, message) {
  const color = success ? '#1B5E3B' : '#E53935';
  const icon = success ? '&#10003;' : '&#10007;';
  return `<!DOCTYPE html><html lang="pl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${success ? 'Email potwierdzony' : 'Błąd weryfikacji'}</title>
<style>body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#F5F5F0;font-family:'Segoe UI',sans-serif;}
.box{text-align:center;background:white;padding:48px;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:400px;}
.icon{font-size:48px;color:${color};margin-bottom:16px;}
h2{color:#1B4332;margin:0 0 12px;}p{color:#666;margin:0 0 24px;}
a{display:inline-block;background:#1B5E3B;color:white;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;}</style></head>
<body><div class="box"><div class="icon">${icon}</div><h2>${success ? 'Sukces!' : 'Błąd'}</h2><p>${message}</p>
${success ? '<a href="/login.html">Przejdź do logowania</a>' : '<a href="/">Strona główna</a>'}</div></body></html>`;
}

module.exports = router;
