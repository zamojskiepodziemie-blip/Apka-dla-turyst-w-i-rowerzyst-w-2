require('dotenv').config();

const express = require('express');
const http = require('http');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const { Server } = require('socket.io');
const { migrate } = require('./db');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const { initChat } = require('./chat');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Socket.io
const io = new Server(server, {
  cors: {
    origin: process.env.APP_URL || `http://localhost:${PORT}`,
    credentials: true
  }
});

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: process.env.APP_URL || `http://localhost:${PORT}`,
  credentials: true
}));
app.use(express.json());
app.use(cookieParser());

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Serwuj pliki statyczne (index.html, login.html itd.)
app.use(express.static(path.join(__dirname, '..'), {
  extensions: ['html']
}));

// SPA fallback — zwróć index.html dla nieznanych ścieżek
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Nie znaleziono endpointu' });
  }
  res.sendFile(path.join(__dirname, '..', 'index.html'));
});

// Migracja bazy (async) i start serwera
(async () => {
  await migrate();
  initChat(io);
  server.listen(PORT, () => {
    console.log(`Serwer działa na ${process.env.APP_URL || `http://localhost:${PORT}`}`);
  });
})();
