import { renderLayout, ctaButton, escapeHtml } from "./layout.ts";

interface InviteData {
  fullName: string;
  email: string;
  setupUrl?: string;
  tempPassword?: string;
  appUrl: string;
  isResend?: boolean;
}

export function renderInviteEmail(d: InviteData) {
  const greeting = d.isResend
    ? `Olá, <strong>${escapeHtml(d.fullName)}</strong>! Reenviamos seu acesso ao SAPH.`
    : `Olá, <strong>${escapeHtml(d.fullName)}</strong>! Seu acesso ao SAPH foi criado.`;

  const subject = d.isResend
    ? "Reenvio do seu acesso ao SAPH"
    : "Bem-vindo(a) ao SAPH — Seu acesso foi criado";

  const passwordBlock = d.tempPassword
    ? `<div style="background-color:#fef3c7;border-left:4px solid #f59e0b;padding:16px;border-radius:6px;margin:20px 0;">
        <p style="margin:0 0 8px;font-size:13px;color:#92400e;font-weight:600;">Senha provisória:</p>
        <p style="margin:0;font-family:'Courier New',monospace;font-size:18px;font-weight:700;color:#1a202c;">${escapeHtml(d.tempPassword)}</p>
        <p style="margin:8px 0 0;font-size:12px;color:#92400e;">Você precisará alterá-la no primeiro login.</p>
      </div>`
    : "";

  const ctaBlock = d.setupUrl
    ? `<p style="margin:0 0 8px;font-size:14px;">Clique no botão abaixo para definir sua senha e acessar o sistema:</p>
       ${ctaButton(d.setupUrl, "Definir minha senha")}`
    : `<p style="margin:0 0 16px;font-size:14px;">Acesse o sistema para começar:</p>
       ${ctaButton(d.appUrl, "Entrar no SAPH")}`;

  const bodyHtml = `
    <h2 style="margin:0 0 16px;font-size:20px;color:#1a202c;">${greeting}</h2>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#475569;">
      Seu acesso ao Sistema SAPH foi ${d.isResend ? "reenviado" : "criado com sucesso"}.
      Use o e-mail abaixo para fazer login:
    </p>
    <div style="background-color:#f1f5f9;padding:14px 16px;border-radius:6px;margin:16px 0;">
      <p style="margin:0;font-size:13px;color:#64748b;">E-mail de login:</p>
      <p style="margin:4px 0 0;font-size:15px;font-weight:600;color:#1a202c;">${escapeHtml(d.email)}</p>
    </div>
    ${passwordBlock}
    ${ctaBlock}
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
      Se você não esperava este e-mail, por favor ignore.
    </p>`;

  return {
    subject,
    html: renderLayout({ title: subject, preheader: "Seu acesso ao SAPH está pronto", bodyHtml }),
  };
}
