import { renderLayout, ctaButton, escapeHtml } from "./layout.ts";

interface ResetData {
  fullName?: string;
  resetUrl: string;
}

export function renderPasswordResetEmail(d: ResetData) {
  const subject = "Redefinição de senha — SAPH";
  const greeting = d.fullName
    ? `Olá, <strong>${escapeHtml(d.fullName)}</strong>!`
    : `Olá!`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a202c;">${greeting}</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
      Recebemos uma solicitação para redefinir a senha da sua conta SAPH.
      Clique no botão abaixo para criar uma nova senha:
    </p>
    ${ctaButton(d.resetUrl, "Redefinir minha senha")}
    <div style="background-color:#fef2f2;border-left:4px solid #ef4444;padding:14px 16px;border-radius:6px;margin:20px 0;">
      <p style="margin:0;font-size:13px;color:#991b1b;">
        <strong>⏱ Este link expira em 1 hora.</strong>
      </p>
    </div>
    <p style="margin:16px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
      Se você não solicitou esta redefinição, ignore este e-mail. Sua senha permanecerá inalterada.
    </p>`;

  return {
    subject,
    html: renderLayout({ title: subject, preheader: "Redefina sua senha do SAPH", bodyHtml }),
  };
}
