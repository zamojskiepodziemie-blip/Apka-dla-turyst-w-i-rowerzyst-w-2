/**
 * Auth Guard — dodaj <script src="/js/auth-guard.js"></script>
 * na stronach wymagających zalogowania.
 *
 * Jeśli użytkownik nie jest zalogowany, zostanie przekierowany
 * na /login.html z parametrem redirect wskazującym oryginalną stronę.
 */
(async function() {
  // Poczekaj na załadowanie auth.js
  if (typeof AuthService === 'undefined') {
    console.error('auth-guard: AuthService nie jest dostępny. Upewnij się, że auth.js jest załadowany przed auth-guard.js.');
    return;
  }

  const user = await AuthService.getUser();

  if (!user) {
    const redirect = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login.html?redirect=${redirect}`;
  }
})();
