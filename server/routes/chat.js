const express = require('express');
const { verifyToken } = require('../middleware/auth');
const { queryAll } = require('../db');

const router = express.Router();

// GET /api/chat/messages — historia publicznych wiadomości (ostatnie 100)
router.get('/messages', verifyToken, (req, res) => {
  const messages = queryAll(`
    SELECT m.id, m.content, m.created_at, m.user_id,
           u.email as user_email
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE m.recipient_id IS NULL
    ORDER BY m.created_at DESC
    LIMIT 100
  `);
  res.json(messages.reverse());
});

// GET /api/chat/messages/private/:userId — historia prywatnych z danym userem
router.get('/messages/private/:userId', verifyToken, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  const myId = req.user.id;

  const messages = queryAll(`
    SELECT m.id, m.content, m.created_at, m.user_id, m.recipient_id,
           u.email as user_email
    FROM messages m
    JOIN users u ON u.id = m.user_id
    WHERE (m.user_id = ? AND m.recipient_id = ?)
       OR (m.user_id = ? AND m.recipient_id = ?)
    ORDER BY m.created_at DESC
    LIMIT 100
  `, [myId, otherId, otherId, myId]);
  res.json(messages.reverse());
});

// GET /api/chat/users — lista zarejestrowanych użytkowników (do prywatnych wiadomości)
router.get('/users', verifyToken, (req, res) => {
  const users = queryAll(`
    SELECT id, email FROM users
    WHERE is_verified = 1 AND id != ?
    ORDER BY email
  `, [req.user.id]);
  res.json(users);
});

module.exports = router;
