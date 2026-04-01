require('dotenv').config();

const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const cors = require('cors');
const { migrate } = require('./db');
const authRoutes = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

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
  app.listen(PORT, () => {
    console.log(`Serwer działa na ${process.env.APP_URL || `http://localhost:${PORT}`}`);
  });
})();
