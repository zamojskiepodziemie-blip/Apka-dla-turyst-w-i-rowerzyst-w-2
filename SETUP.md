# Szlaki Lubelszczyzny — Instrukcja uruchomienia

## Wymagania
- **Node.js** v18+ (https://nodejs.org/)
- npm (instalowany razem z Node.js)

## 1. Instalacja zależności

```bash
npm install
```

## 2. Konfiguracja `.env`

Skopiuj przykładowy plik i uzupełnij wartości:

```bash
cp .env.example .env
```

Edytuj `.env`:

| Zmienna | Opis |
|---------|------|
| `JWT_SECRET` | Losowy ciąg min. 32 znaków (np. `openssl rand -hex 32`) |
| `JWT_REFRESH_SECRET` | Drugi losowy ciąg min. 32 znaków |
| `SMTP_HOST` | Host serwera SMTP (np. `smtp.gmail.com`) |
| `SMTP_PORT` | Port SMTP (`587` dla TLS, `465` dla SSL) |
| `SMTP_USER` | Adres email nadawcy |
| `SMTP_PASS` | Hasło aplikacji (dla Gmail: hasło aplikacji z 2FA) |
| `APP_URL` | URL aplikacji (np. `http://localhost:3000`) |
| `PORT` | Port serwera (domyślnie `3000`) |

> **Tryb dev bez SMTP:** Jeśli nie ustawisz `SMTP_HOST`, emaile będą logowane w konsoli serwera (linki aktywacyjne i resetujące pojawią się w terminalu).

## 3. Migracja bazy danych

```bash
npm run migrate
```

Tworzy plik `data/app.db` (SQLite) z tabelą `users`.

## 4. Uruchomienie serwera

**Produkcja:**
```bash
npm start
```

**Development (auto-restart):**
```bash
npm run dev
```

Serwer startuje na `http://localhost:3000` (lub port z `.env`).

## 5. Struktura plików

```
├── index.html              ← Główna aplikacja (mapa, szlaki)
├── login.html              ← Strona logowania
├── register.html           ← Strona rejestracji
├── forgot-password.html    ← Reset hasła — formularz emaila
├── reset-password.html     ← Reset hasła — nowe hasło
├── js/
│   ├── auth.js             ← AuthService (zarządzanie sesją)
│   └── auth-guard.js       ← Ochrona stron (przekierowanie na login)
├── server/
│   ├── index.js            ← Express + serwowanie statyczne
│   ├── db.js               ← SQLite (better-sqlite3)
│   ├── migrate.js          ← Skrypt migracji CLI
│   ├── routes/
│   │   └── auth.js         ← Endpointy REST API auth
│   ├── middleware/
│   │   ├── auth.js         ← Weryfikacja JWT (middleware)
│   │   └── rateLimit.js    ← Rate limiting (5 req/min)
│   └── emails/
│       ├── sender.js       ← Wysyłka email (nodemailer)
│       └── templates.js    ← Szablony HTML (weryfikacja + reset)
├── data/
│   └── app.db              ← Baza SQLite (generowana automatycznie)
├── package.json
├── .env.example
└── .env                    ← Twoja konfiguracja (nie commituj!)
```

## 6. Endpointy API

| Metoda | Endpoint | Opis |
|--------|----------|------|
| POST | `/api/auth/register` | Rejestracja (email + hasło) |
| POST | `/api/auth/login` | Logowanie → access token + refresh cookie |
| POST | `/api/auth/logout` | Wylogowanie (czyszczenie cookie) |
| POST | `/api/auth/refresh` | Odświeżenie access tokena |
| GET | `/api/auth/verify-email?token=...` | Aktywacja konta z emaila |
| POST | `/api/auth/forgot-password` | Żądanie resetu hasła |
| POST | `/api/auth/reset-password` | Ustawienie nowego hasła |
| GET | `/api/auth/me` | Dane zalogowanego użytkownika |

## 7. Ochrona stron (auth guard)

Aby wymagać logowania na dowolnej stronie, dodaj przed `</body>`:

```html
<script src="/js/auth.js"></script>
<script src="/js/auth-guard.js"></script>
```

Niezalogowani użytkownicy zostaną przekierowani na `/login.html`.

## 8. Bezpieczeństwo

- Hasła hashowane **bcrypt** (salt rounds: 12)
- Access token: **15 minut** (przechowywany w pamięci JS, nie w localStorage)
- Refresh token: **7 dni** (HTTP-only cookie, sameSite: strict)
- Rate limiting: **5 prób/minutę** na endpointach auth
- Helmet.js — nagłówki bezpieczeństwa HTTP
- Endpoint forgot-password nie ujawnia, czy email istnieje w bazie
