// Shared email layout for SAPH transactional emails
export function escapeHtml(unsafe: string | null | undefined): string {
  if (unsafe === null || unsafe === undefined) return "";
  return String(unsafe)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface LayoutOptions {
  title: string;
  preheader?: string;
  bodyHtml: string;
}

export function renderLayout({ title, preheader, bodyHtml }: LayoutOptions): string {
  const safeTitle = escapeHtml(title);
  const safePre = escapeHtml(preheader || "");
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${safeTitle}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a202c;">
<div style="display:none;font-size:1px;color:#f4f6f8;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${safePre}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f6f8;padding:32px 16px;">
  <tr>
    <td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr>
          <td style="background:linear-gradient(135deg,#0f4c81 0%,#1e88e5 100%);padding:28px 32px;color:#ffffff;">
            <h1 style="margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">SAPH</h1>
            <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Sistema de Atendimento Pré-Hospitalar</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;">
            ${bodyHtml}
          </td>
        </tr>
        <tr>
          <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;text-align:center;">
            <p style="margin:0 0 6px;">Este é um e-mail automático, por favor não responda.</p>
            <p style="margin:0;">© ${new Date().getFullYear()} SAPH — Todos os direitos reservados.</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

export function ctaButton(url: string, label: string): string {
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0;">
  <tr>
    <td style="background-color:#0f4c81;border-radius:8px;">
      <a href="${escapeHtml(url)}" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;">${escapeHtml(label)}</a>
    </td>
  </tr>
</table>`;
}
