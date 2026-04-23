import { renderLayout, ctaButton, escapeHtml } from "./layout.ts";

interface OpportunityData {
  fullName?: string;
  title: string;
  location?: string | null;
  eventDate: string;
  startTime?: string | null;
  endTime?: string | null;
  description?: string | null;
  rolesNeeded?: string[];
  appUrl: string;
}

function formatDateBR(iso: string): string {
  try {
    const [y, m, d] = iso.split("-");
    return `${d}/${m}/${y}`;
  } catch {
    return iso;
  }
}

export function renderOpportunityEmail(d: OpportunityData) {
  const subject = `Nova oportunidade: ${d.title}`;
  const greeting = d.fullName
    ? `Olá, <strong>${escapeHtml(d.fullName)}</strong>!`
    : "Olá!";

  const horario = [d.startTime, d.endTime].filter(Boolean).join(" — ") || "A combinar";
  const rolesHtml = d.rolesNeeded && d.rolesNeeded.length
    ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Funções:</td><td style="padding:6px 0;font-size:14px;color:#1a202c;">${d.rolesNeeded.map(escapeHtml).join(", ")}</td></tr>`
    : "";

  const descBlock = d.description
    ? `<p style="margin:16px 0;font-size:14px;line-height:1.6;color:#475569;">${escapeHtml(d.description)}</p>`
    : "";

  const bodyHtml = `
    <h2 style="margin:0 0 12px;font-size:20px;color:#1a202c;">${greeting}</h2>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">
      Uma nova oportunidade foi publicada e você pode se inscrever:
    </p>
    <div style="background-color:#eff6ff;border-left:4px solid #1e88e5;padding:16px 20px;border-radius:6px;margin:0 0 20px;">
      <h3 style="margin:0 0 12px;font-size:17px;color:#0f4c81;">${escapeHtml(d.title)}</h3>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;width:90px;">Data:</td><td style="padding:6px 0;font-size:14px;color:#1a202c;font-weight:600;">${escapeHtml(formatDateBR(d.eventDate))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Horário:</td><td style="padding:6px 0;font-size:14px;color:#1a202c;">${escapeHtml(horario)}</td></tr>
        ${d.location ? `<tr><td style="padding:6px 0;color:#64748b;font-size:13px;">Local:</td><td style="padding:6px 0;font-size:14px;color:#1a202c;">${escapeHtml(d.location)}</td></tr>` : ""}
        ${rolesHtml}
      </table>
    </div>
    ${descBlock}
    ${ctaButton(`${d.appUrl}/opportunities`, "Ver oportunidade")}
    <p style="margin:20px 0 0;font-size:13px;color:#64748b;line-height:1.6;">
      As vagas são limitadas — inscreva-se rapidamente.
    </p>`;

  return {
    subject,
    html: renderLayout({ title: subject, preheader: `Nova oportunidade em ${formatDateBR(d.eventDate)}`, bodyHtml }),
  };
}
