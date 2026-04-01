function verificationEmail(url) {
  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#1B5E3B;padding:28px 32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">Szlaki Lubelszczyzny</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1B4332;margin:0 0 12px;font-size:20px;">Potwierdź swój email</h2>
      <p style="color:#555;line-height:1.6;margin:0 0 24px;">
        Dziękujemy za rejestrację! Kliknij poniższy przycisk, aby aktywować swoje konto.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${url}" style="display:inline-block;background:#1B5E3B;color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
          Aktywuj konto
        </a>
      </div>
      <p style="color:#999;font-size:12px;line-height:1.5;margin:0;">
        Jeśli nie zakładałeś konta, zignoruj tę wiadomość.<br>
        Link wygasa po 24 godzinach.
      </p>
    </div>
    <div style="background:#f8f8f6;padding:16px 32px;text-align:center;">
      <p style="color:#aaa;font-size:11px;margin:0;">Szlaki Lubelszczyzny — odkryj piękno województwa lubelskiego</p>
    </div>
  </div>
</body>
</html>`;
}

function resetPasswordEmail(url) {
  return `
<!DOCTYPE html>
<html lang="pl">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#F5F5F0;font-family:'Segoe UI',Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;background:white;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    <div style="background:#1B5E3B;padding:28px 32px;text-align:center;">
      <h1 style="color:white;margin:0;font-size:22px;font-weight:700;">Szlaki Lubelszczyzny</h1>
    </div>
    <div style="padding:32px;">
      <h2 style="color:#1B4332;margin:0 0 12px;font-size:20px;">Reset hasła</h2>
      <p style="color:#555;line-height:1.6;margin:0 0 24px;">
        Otrzymaliśmy prośbę o zmianę hasła do Twojego konta. Kliknij przycisk poniżej, aby ustawić nowe hasło.
      </p>
      <div style="text-align:center;margin:28px 0;">
        <a href="${url}" style="display:inline-block;background:#E8913A;color:white;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;">
          Ustaw nowe hasło
        </a>
      </div>
      <p style="color:#999;font-size:12px;line-height:1.5;margin:0;">
        Jeśli nie prosiłeś o reset hasła, zignoruj tę wiadomość.<br>
        Link wygasa po 1 godzinie.
      </p>
    </div>
    <div style="background:#f8f8f6;padding:16px 32px;text-align:center;">
      <p style="color:#aaa;font-size:11px;margin:0;">Szlaki Lubelszczyzny — odkryj piękno województwa lubelskiego</p>
    </div>
  </div>
</body>
</html>`;
}

module.exports = { verificationEmail, resetPasswordEmail };
