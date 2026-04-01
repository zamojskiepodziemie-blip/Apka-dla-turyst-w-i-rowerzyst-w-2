const jwt = require('jsonwebtoken');
const { queryOne, runSql } = require('./db');

// Sanityzacja HTML — ochrona przed XSS
function sanitize(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const MAX_MESSAGE_LENGTH = 500;

// Mapa online: socketId → { userId, email }
const onlineUsers = new Map();

function getOnlineList() {
  const seen = new Set();
  const list = [];
  for (const [, user] of onlineUsers) {
    if (!seen.has(user.userId)) {
      seen.add(user.userId);
      list.push({ id: user.userId, email: user.email });
    }
  }
  return list;
}

function initChat(io) {
  // Middleware: autoryzacja JWT przy połączeniu WebSocket
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Brak tokenu'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Token nieprawidłowy'));
    }
  });

  io.on('connection', (socket) => {
    const { id: userId, email } = socket.user;

    // Rejestruj użytkownika jako online
    onlineUsers.set(socket.id, { userId, email });
    io.emit('users:online', getOnlineList());

    // ── Wiadomość publiczna ──
    socket.on('message:public', (data) => {
      if (!data || !data.content || typeof data.content !== 'string') return;

      const content = sanitize(data.content.trim());
      if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) return;

      runSql(
        'INSERT INTO messages (user_id, content) VALUES (?, ?)',
        [userId, content]
      );

      const msg = queryOne(
        'SELECT id, content, created_at, user_id FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [userId]
      );

      io.emit('message:public', {
        id: msg.id,
        content: msg.content,
        created_at: msg.created_at,
        user_id: userId,
        user_email: email
      });
    });

    // ── Wiadomość prywatna ──
    socket.on('message:private', (data) => {
      if (!data || !data.content || typeof data.content !== 'string' || !data.recipientId) return;

      const content = sanitize(data.content.trim());
      if (content.length === 0 || content.length > MAX_MESSAGE_LENGTH) return;

      const recipientId = parseInt(data.recipientId, 10);
      if (isNaN(recipientId) || recipientId === userId) return;

      // Sprawdź czy odbiorca istnieje
      const recipient = queryOne('SELECT id, email FROM users WHERE id = ?', [recipientId]);
      if (!recipient) return;

      runSql(
        'INSERT INTO messages (user_id, recipient_id, content) VALUES (?, ?, ?)',
        [userId, recipientId, content]
      );

      const msg = queryOne(
        'SELECT id, content, created_at, user_id, recipient_id FROM messages WHERE user_id = ? ORDER BY id DESC LIMIT 1',
        [userId]
      );

      const payload = {
        id: msg.id,
        content: msg.content,
        created_at: msg.created_at,
        user_id: userId,
        user_email: email,
        recipient_id: recipientId,
        recipient_email: recipient.email
      };

      // Wyślij do nadawcy i odbiorcy
      socket.emit('message:private', payload);
      for (const [sid, u] of onlineUsers) {
        if (u.userId === recipientId && sid !== socket.id) {
          io.to(sid).emit('message:private', payload);
        }
      }
    });

    // ── Typing indicator ──
    socket.on('typing', (data) => {
      if (data && data.recipientId) {
        for (const [sid, u] of onlineUsers) {
          if (u.userId === parseInt(data.recipientId, 10)) {
            io.to(sid).emit('typing', { userId, email });
          }
        }
      } else {
        socket.broadcast.emit('typing', { userId, email });
      }
    });

    // ── Rozłączenie ──
    socket.on('disconnect', () => {
      onlineUsers.delete(socket.id);
      io.emit('users:online', getOnlineList());
    });
  });
}

module.exports = { initChat };
