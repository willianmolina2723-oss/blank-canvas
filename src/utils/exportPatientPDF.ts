import { supabase } from '@/integrations/supabase/client';
import { formatBR } from '@/utils/dateFormat';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { fetchLogoAsBase64, fetchOrgName } from '@/utils/logoStorage';
import type { Patient, Event, NursingEvolution, MedicalEvolution, DigitalSignature } from '@/types/database';

interface PatientWithEvent extends Patient {
  event?: Event;
}

const COLORS = {
  primary: [0, 102, 204] as [number, number, number],
  dark: [30, 30, 30] as [number, number, number],
  muted: [120, 120, 120] as [number, number, number],
  light: [240, 242, 245] as [number, number, number],
  white: [255, 255, 255] as [number, number, number],
  border: [210, 215, 220] as [number, number, number],
  success: [34, 139, 34] as [number, number, number],
};

function drawSectionHeader(doc: jsPDF, title: string, _icon: string, y: number, pageWidth: number): number {
  doc.setFillColor(...COLORS.primary);
  doc.roundedRect(14, y, pageWidth - 28, 8, 1.5, 1.5, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  doc.text(title, 18, y + 5.5);
  doc.setTextColor(...COLORS.dark);
  return y + 12;
}

function drawField(doc: jsPDF, label: string, value: string, x: number, y: number, maxWidth: number): number {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.muted);
  doc.text(label.toUpperCase(), x, y);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.dark);
  const lines = doc.splitTextToSize(value || '-', maxWidth);
  doc.text(lines, x, y + 4);
  return y + 4 + lines.length * 4;
}

function checkPageBreak(doc: jsPDF, yPos: number, needed: number): number {
  if (yPos + needed > doc.internal.pageSize.getHeight() - 20) {
    doc.addPage();
    return 20;
  }
  return yPos;
}

function stripSignatureMetadata(text: string | null): string {
  if (!text) return '';
  return text.replace(/\s*<!--SIG:[\s\S]*?:SIG-->\s*$/g, '').trim();
}

function parseSignatureFromHistory(history: string | null): any {
  if (!history) return null;
  const match = history.match(/<!--SIG:([\s\S]*?):SIG-->\s*$/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function maskCpf(cpf: string | null): string {
  if (!cpf) return '---';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.***-${digits.slice(9, 11)}`;
}

export async function exportPatientPDF(patient: PatientWithEvent) {
  const eventId = patient.event_id;

  const [nursingRes, medicalRes, signaturesRes] = await Promise.all([
    supabase.from('nursing_evolutions').select('*').eq('event_id', eventId),
    supabase.from('medical_evolutions').select('*').eq('event_id', eventId),
    supabase.from('digital_signatures').select('*, profile:profiles(full_name, professional_id)').eq('event_id', eventId),
  ]);

  const nursingList = (nursingRes.data || []) as NursingEvolution[];
  const medicalList = (medicalRes.data || []) as MedicalEvolution[];
  const signatures = (signaturesRes.data || []) as (DigitalSignature & { profile?: { full_name: string; professional_id: string | null } })[];

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const contentWidth = pageWidth - 28;
  let yPos = 15;

  // Try to load logo and org name
  const [logoBase64, orgName] = await Promise.all([fetchLogoAsBase64(), fetchOrgName()]);

  // ── Header Bar ──
  doc.setFillColor(...COLORS.primary);
  doc.rect(0, 0, pageWidth, 28, 'F');

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 6, 6, 60, 15);
    } catch { /* ignore */ }
  }

  doc.setFontSize(orgName ? 11 : 16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.white);
  if (orgName) {
    doc.text(orgName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('FICHA DO PACIENTE', pageWidth / 2, 16, { align: 'center' });
  } else {
    doc.text('FICHA DO PACIENTE', pageWidth / 2, 12, { align: 'center' });
  }

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Evento: ${patient.event?.code || 'N/A'}  •  Gerado em: ${formatBR(new Date(), "dd/MM/yyyy 'às' HH:mm")}`, pageWidth / 2, 23, { align: 'center' });

  yPos = 36;

  // ── Patient Identification ──
  yPos = drawSectionHeader(doc, 'IDENTIFICAÇÃO DO PACIENTE', '👤', yPos, pageWidth);

  // Card background
  doc.setFillColor(...COLORS.light);
  doc.roundedRect(14, yPos, contentWidth, 40, 2, 2, 'F');
  doc.setDrawColor(...COLORS.border);
  doc.roundedRect(14, yPos, contentWidth, 40, 2, 2, 'S');

  const colW = contentWidth / 2 - 6;
  let leftY = yPos + 5;
  let rightY = yPos + 5;

  leftY = drawField(doc, 'Nome Completo', patient.name, 18, leftY, colW);
  leftY = drawField(doc, 'CPF', (patient as any).cpf || 'Não informado', 18, leftY + 2, colW);
  leftY = drawField(doc, 'Data de Nascimento', patient.birth_date ? formatBR(patient.birth_date, 'dd/MM/yyyy') : 'Não informado', 18, leftY + 2, colW);
  leftY = drawField(doc, 'Queixa Principal', patient.main_complaint || '-', 18, leftY + 2, colW);

  const rightX = pageWidth / 2 + 4;
  rightY = drawField(doc, 'Idade / Sexo', `${patient.age || '-'} anos  •  ${patient.gender || '-'}`, rightX, rightY, colW);
  rightY = drawField(doc, 'Data de Nascimento', patient.birth_date ? formatBR(patient.birth_date, 'dd/MM/yyyy') : '-', rightX, rightY + 2, colW);
  rightY = drawField(doc, 'Alergias', patient.allergies || 'Nenhuma informada', rightX, rightY + 2, colW);

  yPos = Math.max(leftY, rightY) + 8;
  if (yPos < 76 + 5) yPos = 76 + 5; // min card height

  // History & Medications row
  if (patient.brief_history || patient.current_medications) {
    yPos = checkPageBreak(doc, yPos, 20);
    doc.setFillColor(...COLORS.light);
    doc.roundedRect(14, yPos, contentWidth, 16, 2, 2, 'F');
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(14, yPos, contentWidth, 16, 2, 2, 'S');
    drawField(doc, 'Histórico Clínico', stripSignatureMetadata(patient.brief_history), 18, yPos + 4, colW);
    drawField(doc, 'Medicamentos em Uso', patient.current_medications || 'Nenhum informado', rightX, yPos + 4, colW);
    yPos += 22;
  }

  // ── Nursing Evolutions ──
  if (nursingList.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);
    yPos = drawSectionHeader(doc, 'EVOLUÇÃO DE ENFERMAGEM', '🩺', yPos, pageWidth);

    for (const nursing of nursingList) {
      yPos = checkPageBreak(doc, yPos, 45);

      doc.setFillColor(...COLORS.light);
      doc.roundedRect(14, yPos, contentWidth, 36, 2, 2, 'F');
      doc.setDrawColor(...COLORS.border);
      doc.roundedRect(14, yPos, contentWidth, 36, 2, 2, 'S');

      // Vitals grid - 3 columns
      const vitalsY = yPos + 5;
      const col3 = contentWidth / 3 - 4;
      
      drawField(doc, 'Pressão Arterial', `${nursing.blood_pressure_systolic || '-'}/${nursing.blood_pressure_diastolic || '-'} mmHg`, 18, vitalsY, col3);
      drawField(doc, 'Freq. Cardíaca', `${nursing.heart_rate || '-'} bpm`, 18 + contentWidth / 3, vitalsY, col3);
      drawField(doc, 'Freq. Respiratória', `${nursing.respiratory_rate || '-'} irpm`, 18 + (contentWidth / 3) * 2, vitalsY, col3);

      const vitals2Y = vitalsY + 12;
      drawField(doc, 'SpO2', `${nursing.oxygen_saturation || '-'}%`, 18, vitals2Y, col3);
      drawField(doc, 'Temperatura', `${nursing.temperature || '-'}°C`, 18 + contentWidth / 3, vitals2Y, col3);
      drawField(doc, 'Glicemia', `${nursing.blood_glucose || '-'} mg/dL`, 18 + (contentWidth / 3) * 2, vitals2Y, col3);

      yPos += 40;

      // Extra text fields
      const textFields = [
        { label: 'Medicações Administradas', value: nursing.medications_administered },
        { label: 'Procedimentos', value: nursing.procedures },
        { label: 'Observações', value: nursing.observations },
      ].filter(f => f.value);

      for (const field of textFields) {
        yPos = checkPageBreak(doc, yPos, 14);
        yPos = drawField(doc, field.label, field.value!, 18, yPos, contentWidth - 8) + 2;
      }

      // Inline signature for nursing
      if (nursing.signature_data) {
        yPos = checkPageBreak(doc, yPos, 25);
        doc.setDrawColor(...COLORS.border);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(14, yPos, pageWidth - 14, yPos);
        doc.setLineDashPattern([], 0);
        yPos += 3;

        try {
          doc.addImage(nursing.signature_data, 'PNG', 18, yPos, 40, 15);
        } catch { /* skip if invalid */ }

        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text('Assinatura do Enfermeiro(a)', 62, yPos + 8);
        if (nursing.signed_at) {
          doc.text(`Assinado em: ${formatBR(nursing.signed_at, "dd/MM/yyyy 'às' HH:mm")}`, 62, yPos + 12);
        }
        doc.setTextColor(...COLORS.dark);
        yPos += 20;
      }

      yPos += 4;
    }
  }

  // ── Medical Evolutions ──
  if (medicalList.length > 0) {
    yPos = checkPageBreak(doc, yPos, 50);
    yPos = drawSectionHeader(doc, 'EVOLUÇÃO MÉDICA', '⚕️', yPos, pageWidth);

    for (const medical of medicalList) {
      yPos = checkPageBreak(doc, yPos, 30);

      const medFields = [
        { label: 'Avaliação Médica', value: medical.medical_assessment },
        { label: 'Diagnóstico', value: medical.diagnosis },
        { label: 'Conduta', value: medical.conduct },
        { label: 'Prescrição', value: medical.prescription },
        { label: 'Observações', value: medical.observations },
      ].filter(f => f.value);

      doc.setFillColor(...COLORS.light);
      const estimatedH = medFields.length * 12 + 4;
      doc.roundedRect(14, yPos, contentWidth, Math.max(estimatedH, 20), 2, 2, 'F');
      doc.setDrawColor(...COLORS.border);
      doc.roundedRect(14, yPos, contentWidth, Math.max(estimatedH, 20), 2, 2, 'S');

      let fieldY = yPos + 5;
      for (const field of medFields) {
        fieldY = drawField(doc, field.label, field.value!, 18, fieldY, contentWidth - 8) + 3;
      }

      yPos = fieldY + 4;

      // Inline signature for medical
      if (medical.signature_data) {
        yPos = checkPageBreak(doc, yPos, 25);
        doc.setDrawColor(...COLORS.border);
        doc.setLineDashPattern([2, 2], 0);
        doc.line(14, yPos, pageWidth - 14, yPos);
        doc.setLineDashPattern([], 0);
        yPos += 3;

        try {
          doc.addImage(medical.signature_data, 'PNG', 18, yPos, 40, 15);
        } catch { /* skip if invalid */ }

        doc.setFontSize(7);
        doc.setTextColor(...COLORS.muted);
        doc.text('Assinatura do Médico(a)', 62, yPos + 8);
        if (medical.signed_at) {
          doc.text(`Assinado em: ${formatBR(medical.signed_at, "dd/MM/yyyy 'às' HH:mm")}`, 62, yPos + 12);
        }
        doc.setTextColor(...COLORS.dark);
        yPos += 20;
      }

      yPos += 4;
    }
  }

  // ── LGPD Consent Signature ──
  const lgpdSig = parseSignatureFromHistory(patient.brief_history);
  if (lgpdSig) {
    yPos = checkPageBreak(doc, yPos, 60);
    yPos = drawSectionHeader(doc, 'CONSENTIMENTO LGPD', '🔒', yPos, pageWidth);

    doc.setFillColor(...COLORS.light);
    doc.roundedRect(14, yPos, contentWidth, 50, 2, 2, 'F');
    doc.setDrawColor(...COLORS.border);
    doc.roundedRect(14, yPos, contentWidth, 50, 2, 2, 'S');

    let consentY = yPos + 5;
    const signerLabel = lgpdSig.signerType === 'responsavel'
      ? `Responsável: ${lgpdSig.responsibleName || '---'}`
      : 'Paciente';
    const cpfLabel = lgpdSig.signerType === 'responsavel'
      ? maskCpf(lgpdSig.responsibleCpf)
      : maskCpf(lgpdSig.patientCpf || patient.cpf);

    consentY = drawField(doc, 'Assinado por', signerLabel, 18, consentY, colW);
    drawField(doc, 'CPF', cpfLabel, rightX, yPos + 5, colW);
    consentY = drawField(doc, 'Data do Consentimento', lgpdSig.consentDate ? formatBR(lgpdSig.consentDate, "dd/MM/yyyy 'às' HH:mm") : '---', 18, consentY + 2, colW);

    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text('Consentimento conforme Lei nº 13.709/2018 (LGPD)', 18, consentY + 4);
    doc.setTextColor(...COLORS.dark);

    yPos += 54;

    // Draw signature image
    if (lgpdSig.signatureData) {
      yPos = checkPageBreak(doc, yPos, 25);
      doc.setDrawColor(...COLORS.border);
      doc.setLineDashPattern([2, 2], 0);
      doc.line(14, yPos, pageWidth - 14, yPos);
      doc.setLineDashPattern([], 0);
      yPos += 3;

      try {
        doc.addImage(lgpdSig.signatureData, 'PNG', 18, yPos, 50, 18);
      } catch { /* skip if invalid */ }

      doc.setFontSize(7);
      doc.setTextColor(...COLORS.muted);
      doc.text('Assinatura do Paciente / Responsável', 72, yPos + 10);
      doc.setTextColor(...COLORS.dark);
      yPos += 22;
    }

    yPos += 4;
  }

  // ── Footer on every page ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(...COLORS.light);
    doc.rect(0, pageHeight - 12, pageWidth, 12, 'F');
    doc.setFontSize(7);
    doc.setTextColor(...COLORS.muted);
    doc.text('SAPH - Sistema de Atendimento Pré-Hospitalar', 14, pageHeight - 5);
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - 14, pageHeight - 5, { align: 'right' });
  }

  doc.save(`ficha-paciente-${patient.name.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
