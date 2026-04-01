/**
 * AuthService — zarządzanie sesją użytkownika (Vanilla JS).
 *
 * Access token przechowywany WYŁĄCZNIE w pamięci (zmienna).
 * Refresh token w HTTP-only cookie (obsługiwany przez serwer).
 */
const AuthService = (() => {
  let accessToken = null;
  let currentUser = null;
  let refreshTimer = null;

  const API = '/api/auth';

  // ── Helpers ──────────────────────────────────────────────

  async function request(url, options = {}) {
    const res = await fetch(url, {
      ...options,
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(options.headers || {})
      }
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Błąd serwera');
    return data;
  }

  function scheduleRefresh(token) {
    clearTimeout(refreshTimer);
    // Odczytaj exp z JWT payload (base64)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const expiresIn = payload.exp * 1000 - Date.now();
      // Odśwież 60 sekund przed wygaśnięciem
      const delay = Math.max(expiresIn - 60000, 5000);
      refreshTimer = setTimeout(() => refresh(), delay);
    } catch (e) {
      // fallback: odśwież za 13 minut
      refreshTimer = setTimeout(() => refresh(), 13 * 60 * 1000);
    }
  }

  function setSession(data) {
    accessToken = data.accessToken;
    currentUser = data.user;
    scheduleRefresh(accessToken);
  }

  function clearSession() {
    accessToken = null;
    currentUser = null;
    clearTimeout(refreshTimer);
  }

  // ── Public API ───────────────────────────────────────────

  async function login(email, password) {
    const data = await request(`${API}/login`, {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    setSession(data);
    dispatchAuthEvent('login');
    return data;
  }

  async function logout() {
    try {
      await request(`${API}/logout`, { method: 'POST' });
    } catch (e) { /* ignore */ }
    clearSession();
    dispatchAuthEvent('logout');
  }

  async function refresh() {
    try {
      const data = await request(`${API}/refresh`, { method: 'POST' });
      setSession(data);
      return data;
    } catch (e) {
      clearSession();
      return null;
    }
  }

  async function getUser() {
    if (currentUser) return currentUser;
    const result = await refresh();
    return result ? result.user : null;
  }

  function getAccessToken() {
    return accessToken;
  }

  function isLoggedIn() {
    return !!accessToken;
  }

  // Zdarzenie auth — inne skrypty mogą nasłuchiwać
  function dispatchAuthEvent(type) {
    window.dispatchEvent(new CustomEvent('auth', { detail: { type, user: currentUser } }));
  }

  // Próba przywrócenia sesji z refresh tokena przy załadowaniu strony
  async function init() {
    await refresh();
  }

  return {
    login,
    logout,
    refresh,
    getUser,
    getAccessToken,
    isLoggedIn,
    init
  };
})();
