import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import {
  ArrowLeft, Loader2, Download, FileText, Users, MapPin, Truck, Calendar,
  Stethoscope, Activity, ClipboardList, ShieldCheck, Clock, UserRound,
  CheckCircle2, Circle, AlertTriangle, Pill, Car, Package, Camera
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatBR } from '@/utils/dateFormat';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchLogoAsBase64, fetchOrgName } from '@/utils/logoStorage';
import type {
  Event, Ambulance, Patient, ChecklistItem, EventParticipant,
  Profile, NursingEvolution, MedicalEvolution, TransportRecord,
  DigitalSignature, STATUS_LABELS, ROLE_LABELS
} from '@/types/database';

// Strip signature metadata from brief_history
const stripSignatureMetadata = (text: string | null): string => {
  if (!text) return '';
  return text.replace(/\s*<!--SIG:[\s\S]*?:SIG-->\s*$/g, '').trim();
};

// Parse signature metadata from brief_history
const parseSignatureFromHistory = (history: string | null) => {
  if (!history) return null;
  const match = history.match(/\n<!--SIG:(.*?):SIG-->$/s);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
};

// Mask CPF for LGPD
const maskCpf = (cpf: string | null): string => {
  if (!cpf) return '---';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.***-${digits.slice(9, 11)}`;
};

// LGPD: Mask sensitive data
const maskName = (name: string): string => {
  if (!name || name.length <= 3) return name;
  const parts = name.split(' ');
  return parts.map((part, i) => {
    if (i === 0) return part;
    if (part.length <= 2) return part;
    return part[0] + '***';
  }).join(' ');
};

const maskDate = (date: string | null): string => {
  if (!date) return '---';
  const d = new Date(date);
  return `**/${formatBR(d, 'MM/yyyy')}`;
};

export default function EventReport() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [ambulance, setAmbulance] = useState<Ambulance | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [participants, setParticipants] = useState<(EventParticipant & { profile: Profile })[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [nursingEvolutions, setNursingEvolutions] = useState<NursingEvolution[]>([]);
  const [medicalEvolutions, setMedicalEvolutions] = useState<MedicalEvolution[]>([]);
  const [transportRecords, setTransportRecords] = useState<TransportRecord[]>([]);
  const [transportPhotos, setTransportPhotos] = useState<Record<string, { name: string; url: string }[]>>({});
  const [signatures, setSignatures] = useState<DigitalSignature[]>([]);
  const [signerProfiles, setSignerProfiles] = useState<Record<string, Profile>>({});
  const [baseDeparture, setBaseDeparture] = useState<string | null>(null);
  const [baseArrival, setBaseArrival] = useState<string | null>(null);
  const [costItemsMap, setCostItemsMap] = useState<Map<string, number>>(new Map());
  const [costItemNameMap, setCostItemNameMap] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (eventId) loadAllData();
  }, [eventId]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const db = supabase as any;
      const [
        eventRes, participantsRes, patientsRes, checklistRes,
        nursingRes, medicalRes, transportRes, signaturesRes, dispatchRes,
        costItemsRes
      ] = await Promise.all([
        supabase.from('events').select('*, ambulances(*)').eq('id', eventId!).single(),
        supabase.from('event_participants').select('*, profile:profiles(*)').eq('event_id', eventId!),
        supabase.from('patients').select('*').eq('event_id', eventId!).order('created_at'),
        supabase.from('checklist_items').select('*').eq('event_id', eventId!).order('item_type').order('created_at'),
        supabase.from('nursing_evolutions').select('*').eq('event_id', eventId!).order('created_at', { ascending: false }),
        supabase.from('medical_evolutions').select('*').eq('event_id', eventId!).order('created_at', { ascending: false }),
        supabase.from('transport_records').select('*').eq('event_id', eventId!).order('created_at', { ascending: false }),
        supabase.from('digital_signatures').select('*').eq('event_id', eventId!).order('signed_at'),
        supabase.from('dispatch_reports').select('base_departure, base_arrival').eq('event_id', eventId!).maybeSingle(),
        db.from('cost_items').select('id, name, unit_cost').eq('is_active', true),
      ]);

      if (eventRes.error) throw eventRes.error;

      const ev = eventRes.data as any;
      setEvent(ev as Event);
      setAmbulance(ev.ambulances as Ambulance || null);
      setParticipants((participantsRes.data || []) as any);
      setPatients((patientsRes.data || []) as Patient[]);
      setChecklistItems((checklistRes.data || []) as ChecklistItem[]);
      setNursingEvolutions((nursingRes.data || []) as NursingEvolution[]);
      setMedicalEvolutions((medicalRes.data || []) as MedicalEvolution[]);
      setTransportRecords((transportRes.data || []) as TransportRecord[]);
      setSignatures((signaturesRes.data || []) as DigitalSignature[]);
      setBaseDeparture(dispatchRes.data?.base_departure || null);
      setBaseArrival(dispatchRes.data?.base_arrival || null);

      // Build cost items maps for price lookup
      const ciData = (costItemsRes?.data || []) as any[];
      const idMap = new Map<string, number>();
      const nameMap = new Map<string, number>();
      ciData.forEach((ci: any) => {
        idMap.set(ci.id, Number(ci.unit_cost));
        nameMap.set(ci.name.toLowerCase(), Number(ci.unit_cost));
      });
      setCostItemsMap(idMap);
      setCostItemNameMap(nameMap);

      // Load transport photos
      const trs = (transportRes.data || []) as TransportRecord[];
      if (trs.length > 0) {
        const photosMap: Record<string, { name: string; url: string }[]> = {};
        await Promise.all(trs.map(async (tr) => {
          try {
            const { data } = await supabase.functions.invoke('transport-photos', {
              body: { action: 'list', transport_id: tr.id },
            });
            if (data?.photos?.length) photosMap[tr.id] = data.photos;
          } catch { /* ignore */ }
        }));
        setTransportPhotos(photosMap);
      }

      // Load profiles for all creators
      const allCreatorIds = [
        ...(nursingRes.data || []).map((e: any) => e.created_by),
        ...(medicalRes.data || []).map((e: any) => e.created_by),
        ...(transportRes.data || []).map((e: any) => e.created_by),
        ...(signaturesRes.data || []).map((e: any) => e.profile_id),
      ].filter(Boolean);
      const uniqueIds = [...new Set(allCreatorIds)] as string[];

      if (uniqueIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', uniqueIds);
        if (profiles) {
          const map: Record<string, Profile> = {};
          profiles.forEach((p: any) => { map[p.id] = p as Profile; });
          setSignerProfiles(map);
        }
      }
    } catch (err) {
      console.error('Error loading report data:', err);
      toast({ title: 'Erro', description: 'Não foi possível carregar os dados do relatório.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador',
    condutor: 'Condutor',
    enfermeiro: 'Enfermeiro(a)',
    tecnico: 'Técnico(a)',
    medico: 'Médico(a)',
  };

  const fmtCurrency = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const statusLabels: Record<string, string> = {
    ativo: 'Ativo',
    em_andamento: 'Em Andamento',
    finalizado: 'Finalizado',
    cancelado: 'Cancelado',
  };

  const sigTypeLabels: Record<string, string> = {
    enfermagem: 'Enfermagem',
    medica: 'Médica',
    transporte: 'Transporte',
    checklist: 'Checklist',
  };

  const generatePdf = async () => {
    if (!event) return;
    setIsGeneratingPdf(true);

    try {
      const doc = new jsPDF();
      let y = 15;

      // Try to load logo and org name
      const [logoBase64, orgName] = await Promise.all([fetchLogoAsBase64(), fetchOrgName()]);

      // Header with optional logo and org name
      if (logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', 14, y + 1, 60, 15);
          const titleX = 78;
          if (orgName) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(orgName.toUpperCase(), titleX, y + 5);
            doc.setFontSize(10);
            doc.text('RELATÓRIO DE ATENDIMENTO PRÉ-HOSPITALAR', titleX, y + 11);
          } else {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('RELATÓRIO DE ATENDIMENTO', titleX, y + 6);
            doc.text('PRÉ-HOSPITALAR', titleX, y + 12);
          }
          y += 18;
        } catch {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text(orgName || 'RELATÓRIO DE ATENDIMENTO PRÉ-HOSPITALAR', 105, y, { align: 'center' });
          y += 8;
        }
      } else {
        if (orgName) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(orgName.toUpperCase(), 105, y, { align: 'center' });
          y += 7;
          doc.setFontSize(11);
          doc.text('RELATÓRIO DE ATENDIMENTO PRÉ-HOSPITALAR', 105, y, { align: 'center' });
        } else {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text('RELATÓRIO DE ATENDIMENTO PRÉ-HOSPITALAR', 105, y, { align: 'center' });
        }
        y += 8;
      }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text('Documento gerado em conformidade com a LGPD (Lei 13.709/2018)', 105, y, { align: 'center' });
      y += 5;
      doc.text(`Gerado em: ${formatBR(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}`, 105, y, { align: 'center' });
      y += 10;

      // Event info
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('1. DADOS DO EVENTO', 14, y);
      y += 6;

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: [59, 130, 246] },
        body: [
          ['Código', event.code],
          ['Status', statusLabels[event.status] || event.status],
          ['Local', event.location || '---'],
          ['Descrição', event.description || '---'],
          ['Viatura', ambulance ? `${ambulance.code} ${ambulance.plate ? `(${ambulance.plate})` : ''}` : '---'],
          
          ['Saída da Base', baseDeparture ? formatBR(baseDeparture, "dd/MM/yyyy 'às' HH:mm") : '---'],
          ['Chegada à Base', baseArrival ? formatBR(baseArrival, "dd/MM/yyyy 'às' HH:mm") : '---'],
          ['Início do Evento', event.departure_time ? formatBR(event.departure_time, "dd/MM/yyyy 'às' HH:mm") : '---'],
          ['Término do Evento', event.arrival_time ? formatBR(event.arrival_time, "dd/MM/yyyy 'às' HH:mm") : '---'],
        ],
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
        margin: { left: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // Team
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('2. EQUIPE', 14, y);
      y += 6;

      if (participants.length > 0) {
        autoTable(doc, {
          startY: y,
          theme: 'grid',
          headStyles: { fillColor: [59, 130, 246] },
          head: [['Nome', 'Função', 'Registro Profissional']],
          body: participants.map(p => [
            p.profile?.full_name || '---',
            roleLabels[p.role] || p.role,
            p.profile?.professional_id || '---',
          ]),
          margin: { left: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhum participante registrado.', 14, y);
        y += 8;
      }

      // Patients
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('3. PACIENTES', 14, y);
      y += 6;

      if (patients.length > 0) {
        for (const patient of patients) {
          const patientRows: [string, string][] = [
            ['Nome', patient.name],
            ['Idade', patient.age ? `${patient.age} anos` : '---'],
            ['Gênero', patient.gender || '---'],
            ['CPF', (patient as any).cpf ? maskCpf((patient as any).cpf) : '---'],
            ['Data Nasc.', patient.birth_date ? formatBR(patient.birth_date, 'dd/MM/yyyy') : '---'],
            ['Queixa Principal', patient.main_complaint || '---'],
            ['Histórico', stripSignatureMetadata(patient.brief_history) || '---'],
            ['Alergias', patient.allergies || 'Nenhuma informada'],
            ['Medicamentos em Uso', patient.current_medications || 'Nenhum informado'],
          ];

          // Add LGPD consent info
          const sig = parseSignatureFromHistory(patient.brief_history);
          if (sig) {
            const signerLabel = sig.signerType === 'responsavel' ? `Responsável: ${sig.responsibleName || '---'}` : 'Paciente';
            const cpfLabel = sig.signerType === 'responsavel' ? maskCpf(sig.responsibleCpf) : maskCpf(sig.patientCpf || (patient as any).cpf);
            patientRows.push(['Consentimento LGPD', `Assinado por: ${signerLabel} | CPF: ${cpfLabel} | Data: ${sig.consentDate ? formatBR(sig.consentDate, "dd/MM/yyyy 'às' HH:mm") : '---'}`]);
          }

          autoTable(doc, {
            startY: y,
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129] },
            body: patientRows,
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 45 } },
            margin: { left: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;

          // Draw signature image in PDF if available
          if (sig?.signatureData) {
            if (y > 240) { doc.addPage(); y = 15; }
            doc.setFontSize(7);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(120, 120, 120);
            doc.text('Assinatura LGPD:', 14, y);
            y += 3;
            try {
              doc.addImage(sig.signatureData, 'PNG', 14, y, 50, 18);
            } catch { /* skip invalid */ }
            doc.setTextColor(30, 30, 30);
            y += 22;
          }
        }
        y += 4;
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhum paciente registrado.', 14, y);
        y += 8;
      }

      // Check page break
      if (y > 250) { doc.addPage(); y = 15; }

      // Checklist Summary
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('4. CHECKLISTS', 14, y);
      y += 6;

      // Calculate summaries for PDF using same logic
      const pdfVtrItems = checklistItems.filter((i) => {
        const t = i.item_type as string;
        return t !== 'uti' && t !== 'medications' && t !== 'psicotropicos' && t !== 'materiais' && t !== 'consumo_medicamentos' && t !== 'checklist_confirmed' && t !== 'uti_confirmed';
      });
      const pdfUtiItems = checklistItems.filter((i) => (i.item_type as string) === 'uti');
      const pdfMedItems = checklistItems.filter((i) => (i.item_type as string) === 'medications' || (i.item_type as string) === 'psicotropicos');
      const pdfMatItems = checklistItems.filter((i) => (i.item_type as string) === 'materiais');
      const pdfMedConsItems = checklistItems.filter((i) => (i.item_type as string) === 'consumo_medicamentos');

      const pdfVtrChecked = pdfVtrItems.filter((i: any) => i.is_checked).length;
      const pdfVtrPct = pdfVtrItems.length > 0 ? Math.round((pdfVtrChecked / pdfVtrItems.length) * 100) : 0;
      const pdfVtrStatus = pdfVtrItems.length === 0 ? 'Não preenchido' : pdfVtrPct === 100 ? '✓ CONFORME' : `INCOMPLETO`;

      let pdfUtiPct = 0;
      let pdfUtiStatus = 'Não preenchido';
      if (pdfUtiItems.length > 0) {
        try {
          const uData = JSON.parse(pdfUtiItems[0].notes || '{}');
          const uFields = Object.keys(uData);
          const uFilled = uFields.filter((k: string) => uData[k] !== '').length;
          pdfUtiPct = uFields.length > 0 ? Math.round((uFilled / uFields.length) * 100) : 0;
          const hasIssue = Object.values(uData).some((v: any) => v === 'I' || v === 'Mín.' || v === 'R' || v === 'Não');
          pdfUtiStatus = pdfUtiPct === 100 && !hasIssue ? '✓ CONFORME' : pdfUtiPct > 0 ? '⚠ ATENÇÃO' : 'Não preenchido';
        } catch { /* ignore */ }
      }

      let pdfMedPct = 0;
      let pdfMedStatus = 'Não preenchido';
      if (pdfMedItems.length > 0) {
        try {
          const meds = JSON.parse(pdfMedItems[0].notes || '[]');
          if (Array.isArray(meds)) {
            const mFilled = meds.filter((m: any) => m.quantity >= 1).length;
            pdfMedPct = meds.length > 0 ? Math.round((mFilled / meds.length) * 100) : 0;
          }
        } catch { /* ignore */ }
        pdfMedStatus = pdfMedPct === 100 ? '✓ CONFORME' : pdfMedPct > 0 ? 'INCOMPLETO' : (pdfMedItems[0].is_checked ? '✓ CONFORME' : 'Não preenchido');
      }

      // Materials summary for PDF
      const pdfMatStatus = pdfMatItems.length > 0 ? '✓ REGISTRADO' : 'Não preenchido';
      const pdfMedConsStatus = pdfMedConsItems.length > 0 ? '✓ REGISTRADO' : 'Não preenchido';

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11] },
        head: [['Checklist', 'Status', 'Percentual']],
        body: [
          ['Checklist da Viatura', pdfVtrStatus, `${pdfVtrPct}% (${pdfVtrChecked}/${pdfVtrItems.length})`],
          ['Condições da UTI', pdfUtiStatus, `${pdfUtiPct}%`],
          ['Controle de Psicotrópicos', pdfMedStatus, `${pdfMedPct}%`],
          ['Consumo de Materiais', pdfMatStatus, pdfMatItems.length > 0 ? `${pdfMatItems.length} itens` : '---'],
          ['Consumo de Medicamentos', pdfMedConsStatus, pdfMedConsItems.length > 0 ? `${pdfMedConsItems.length} itens` : '---'],
        ],
        margin: { left: 14 },
        bodyStyles: { fontSize: 9 },
      });
      y = (doc as any).lastAutoTable.finalY + 6;

      // Materials detail table in PDF
      if (pdfMatItems.length > 0) {
        const matRows = pdfMatItems.map((m: any) => {
          const qty = parseInt(m.notes || '0') || 0;
          const uc = m.cost_item_id ? (costItemsMap.get(m.cost_item_id) ?? 0) : (costItemNameMap.get(String(m.item_name || '').toLowerCase()) ?? 0);
          const total = uc * qty;
          return [m.item_name, String(qty), uc > 0 ? fmtCurrency(uc) : '-', uc > 0 ? fmtCurrency(total) : '-'];
        });
        const matTotal = pdfMatItems.reduce((s: number, m: any) => {
          const qty = parseInt(m.notes || '0') || 0;
          const uc = m.cost_item_id ? (costItemsMap.get(m.cost_item_id) ?? 0) : (costItemNameMap.get(String(m.item_name || '').toLowerCase()) ?? 0);
          return s + uc * qty;
        }, 0);
        if (matTotal > 0) matRows.push(['TOTAL', '', '', fmtCurrency(matTotal)]);
        autoTable(doc, {
          startY: y,
          theme: 'grid',
          headStyles: { fillColor: [217, 119, 6] },
          head: [['Material', 'Qtd', 'Custo Unit.', 'Total']],
          body: matRows,
          margin: { left: 14 },
          bodyStyles: { fontSize: 9 },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        y += 4;
      }

      // Medication Consumption detail table in PDF
      if (pdfMedConsItems.length > 0) {
        if (y > 200) { doc.addPage(); y = 15; }
        const medRows = pdfMedConsItems.map((m: any) => {
          const qty = parseInt(m.notes || '0') || 0;
          const uc = m.cost_item_id ? (costItemsMap.get(m.cost_item_id) ?? 0) : (costItemNameMap.get(String(m.item_name || '').toLowerCase()) ?? 0);
          const total = uc * qty;
          return [m.item_name, String(qty), uc > 0 ? fmtCurrency(uc) : '-', uc > 0 ? fmtCurrency(total) : '-'];
        });
        const medTotal = pdfMedConsItems.reduce((s: number, m: any) => {
          const qty = parseInt(m.notes || '0') || 0;
          const uc = m.cost_item_id ? (costItemsMap.get(m.cost_item_id) ?? 0) : (costItemNameMap.get(String(m.item_name || '').toLowerCase()) ?? 0);
          return s + uc * qty;
        }, 0);
        if (medTotal > 0) medRows.push(['TOTAL', '', '', fmtCurrency(medTotal)]);
        autoTable(doc, {
          startY: y,
          theme: 'grid',
          headStyles: { fillColor: [219, 39, 119] },
          head: [['Medicamento', 'Qtd', 'Custo Unit.', 'Total']],
          body: medRows,
          margin: { left: 14 },
          bodyStyles: { fontSize: 9 },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        y += 4;
      }

      // Page break
      if (y > 200) { doc.addPage(); y = 15; }

      // Nursing Evolutions
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('5. EVOLUÇÕES DE ENFERMAGEM', 14, y);
      y += 6;

      if (nursingEvolutions.length > 0) {
        for (const ev of nursingEvolutions) {
          if (y > 240) { doc.addPage(); y = 15; }
          const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
          const patientName = patients.find(p => p.id === ev.patient_id)?.name;

          autoTable(doc, {
            startY: y,
            theme: 'grid',
            headStyles: { fillColor: [6, 182, 212] },
            head: [[`Evolução - ${formatBR(ev.created_at, "dd/MM/yyyy HH:mm")}${patientName ? ` | Paciente: ${maskName(patientName)}` : ''}`]],
            body: [
              [`PA: ${ev.blood_pressure_systolic || '--'}/${ev.blood_pressure_diastolic || '--'} | FC: ${ev.heart_rate || '--'} | FR: ${ev.respiratory_rate || '--'} | SpO2: ${ev.oxygen_saturation || '--'}% | Temp: ${ev.temperature || '--'}°C | Glic: ${ev.blood_glucose || '--'}`],
              ...(ev.observations ? [[`Observações: ${ev.observations}`]] : []),
              ...(ev.procedures ? [[`Procedimentos: ${ev.procedures}`]] : []),
              ...(ev.medications_administered ? [[`Medicações: ${ev.medications_administered}`]] : []),
              [`Profissional: ${signer?.full_name || '---'} ${signer?.professional_id ? `(${signer.professional_id})` : ''} | Assinado: ${ev.signed_at ? formatBR(ev.signed_at, "dd/MM/yyyy HH:mm:ss") : 'Não assinado'}`],
            ],
            margin: { left: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 2;

          // Add signature image
          if (ev.signature_data) {
            try {
              if (y + 22 > 280) { doc.addPage(); y = 15; }
              doc.setFontSize(8);
              doc.setFont('helvetica', 'italic');
              doc.text('Assinatura:', 14, y + 4);
              doc.addImage(ev.signature_data, 'PNG', 40, y, 50, 18);
              y += 22;
            } catch (e) { console.warn('Signature image error:', e); }
          }
          y += 4;
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhuma evolução de enfermagem registrada.', 14, y);
        y += 8;
      }

      // Page break
      if (y > 200) { doc.addPage(); y = 15; }

      // Medical Evolutions
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('6. EVOLUÇÕES MÉDICAS', 14, y);
      y += 6;

      if (medicalEvolutions.length > 0) {
        for (const ev of medicalEvolutions) {
          if (y > 240) { doc.addPage(); y = 15; }
          const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
          const patientName = patients.find(p => p.id === ev.patient_id)?.name;

          autoTable(doc, {
            startY: y,
            theme: 'grid',
            headStyles: { fillColor: [139, 92, 246] },
            head: [[`Evolução Médica - ${formatBR(ev.created_at, "dd/MM/yyyy HH:mm")}${patientName ? ` | Paciente: ${maskName(patientName)}` : ''}`]],
            body: [
              ...(ev.medical_assessment ? [[`Avaliação: ${ev.medical_assessment}`]] : []),
              ...(ev.diagnosis ? [[`Diagnóstico: ${ev.diagnosis}`]] : []),
              ...(ev.conduct ? [[`Conduta: ${ev.conduct}`]] : []),
              ...(ev.prescription ? [[`Prescrição: ${ev.prescription}`]] : []),
              ...(ev.observations ? [[`Observações: ${ev.observations}`]] : []),
              [`Médico: ${signer?.full_name || '---'} ${signer?.professional_id ? `(${signer.professional_id})` : ''} | Assinado: ${ev.signed_at ? formatBR(ev.signed_at, "dd/MM/yyyy HH:mm:ss") : 'Não assinado'}`],
            ],
            margin: { left: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 2;

          // Add signature image
          if (ev.signature_data) {
            try {
              if (y + 22 > 280) { doc.addPage(); y = 15; }
              doc.setFontSize(8);
              doc.setFont('helvetica', 'italic');
              doc.text('Assinatura:', 14, y + 4);
              doc.addImage(ev.signature_data, 'PNG', 40, y, 50, 18);
              y += 22;
            } catch (e) { console.warn('Signature image error:', e); }
          }
          y += 4;
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhuma evolução médica registrada.', 14, y);
        y += 8;
      }

      // Page break
      if (y > 200) { doc.addPage(); y = 15; }

      // Transport
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('7. TRANSPORTE', 14, y);
      y += 6;

      if (transportRecords.length > 0) {
        for (const tr of transportRecords) {
          if (y > 240) { doc.addPage(); y = 15; }
          const signer = tr.created_by ? signerProfiles[tr.created_by] : null;
          // Parse reserve km from occurrences JSON
          let pdfOccText = tr.occurrences || '';
          let pdfResInitKm: string = '---';
          let pdfResFinalKm: string = '---';
          try {
            const parsed = JSON.parse(pdfOccText);
            if (parsed && typeof parsed === 'object' && 'occurrences' in parsed) {
              pdfOccText = parsed.occurrences || '';
              pdfResInitKm = parsed.reserve_initial_km?.toString() ?? '---';
              pdfResFinalKm = parsed.reserve_final_km?.toString() ?? '---';
            }
          } catch { /* plain text */ }
          const pdfDistance = (tr.initial_km != null && tr.final_km != null) ? `${(tr.final_km - tr.initial_km).toFixed(1)} km` : '---';
          const pdfResDistance = (pdfResInitKm !== '---' && pdfResFinalKm !== '---') ? `${(Number(pdfResFinalKm) - Number(pdfResInitKm)).toFixed(1)} km` : '---';

          const pdfBody: any[] = [
            ['Saída', tr.departure_time ? formatBR(tr.departure_time, "dd/MM/yyyy HH:mm") : '---'],
            ['Chegada', tr.arrival_time ? formatBR(tr.arrival_time, "dd/MM/yyyy HH:mm") : '---'],
            ['KM Inicial', tr.initial_km?.toString() || '---'],
            ['KM Final', tr.final_km?.toString() || '---'],
            ['Distância', pdfDistance],
          ];
          if (pdfResInitKm !== '---' || pdfResFinalKm !== '---') {
            pdfBody.push(['Reserva KM Inicial', pdfResInitKm]);
            pdfBody.push(['Reserva KM Final', pdfResFinalKm]);
            pdfBody.push(['Reserva Distância', pdfResDistance]);
          }
          pdfBody.push(['Ocorrências', pdfOccText || 'Nenhuma']);
          pdfBody.push(['Condutor', `${signer?.full_name || '---'} | Assinado: ${tr.signed_at ? formatBR(tr.signed_at, "dd/MM/yyyy HH:mm:ss") : 'Não assinado'}`]);

          autoTable(doc, {
            startY: y,
            theme: 'grid',
            headStyles: { fillColor: [100, 116, 139] },
            body: pdfBody,
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            margin: { left: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 2;

          // Add transport photos to PDF as images
          const trPhotos = transportPhotos[tr.id];
          if (trPhotos?.length > 0) {
            doc.setFontSize(8);
            doc.setFont('helvetica', 'italic');
            doc.text(`Fotos (${trPhotos.length}):`, 14, y + 4);
            y += 8;

            const photoWidth = 55;
            const photoHeight = 40;
            const cols = 3;
            const gap = 4;

            for (let i = 0; i < trPhotos.length; i++) {
              const col = i % cols;
              const x = 14 + col * (photoWidth + gap);

              if (col === 0 && i > 0) {
                y += photoHeight + gap;
              }

              if (y + photoHeight > 275) {
                doc.addPage();
                y = 15;
              }

              try {
                const imgRes = await fetch(trPhotos[i].url);
                const blob = await imgRes.blob();
                const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });
                doc.addImage(base64, 'JPEG', x, y, photoWidth, photoHeight);
              } catch (e) {
                console.warn('Photo embed error:', e);
                doc.setFontSize(7);
                doc.text('Foto indisponível', x + 5, y + 20);
              }
            }
            y += photoHeight + gap;
          }

          y += 4;
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhum registro de transporte.', 14, y);
        y += 8;
      }

      // Page break
      if (y > 200) { doc.addPage(); y = 15; }

      // Digital Signatures
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('8. ASSINATURAS DIGITAIS', 14, y);
      y += 6;

      if (signatures.length > 0) {
        for (const sig of signatures) {
          if (y > 230) { doc.addPage(); y = 15; }
          const sp = signerProfiles[sig.profile_id];
          autoTable(doc, {
            startY: y,
            theme: 'grid',
            headStyles: { fillColor: [59, 130, 246] },
            head: [[`${sigTypeLabels[sig.signature_type] || sig.signature_type} - ${sp?.full_name || '---'}`]],
            body: [
              [`Registro: ${sig.professional_id || sp?.professional_id || '---'} | Data: ${formatBR(sig.signed_at, "dd/MM/yyyy HH:mm:ss")}`],
            ],
            margin: { left: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 2;

          // Add signature image
          if (sig.signature_data) {
            try {
              if (y + 22 > 280) { doc.addPage(); y = 15; }
              doc.addImage(sig.signature_data, 'PNG', 14, y, 50, 18);
              y += 22;
            } catch (e) { console.warn('Signature image error:', e); }
          }
          y += 4;
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhuma assinatura digital registrada.', 14, y);
        y += 8;
      }

      // LGPD Footer
      if (y > 240) { doc.addPage(); y = 15; }
      doc.setDrawColor(200, 200, 200);
      doc.line(14, y, 196, y);
      y += 6;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      const lgpdText = [
        'AVISO DE CONFORMIDADE LGPD (Lei 13.709/2018)',
        'Este documento contém dados pessoais sensíveis protegidos pela Lei Geral de Proteção de Dados Pessoais.',
        'Dados de pacientes foram parcialmente anonimizados conforme Art. 18, inciso IV da LGPD.',
        'O tratamento de dados neste relatório tem base legal no Art. 7º, VIII (tutela da saúde) e Art. 11, II, "f" (proteção da vida).',
        'É proibida a reprodução, compartilhamento ou distribuição não autorizada deste documento.',
        'O responsável pelo tratamento dos dados se compromete a garantir a confidencialidade e integridade das informações.',
        `Documento gerado por: ${profile?.full_name || '---'} em ${formatBR(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}`,
      ];
      lgpdText.forEach(line => {
        doc.text(line, 105, y, { align: 'center' });
        y += 4;
      });

      doc.save(`Relatorio_${event.code}_${formatBR(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
      toast({ title: 'PDF gerado', description: 'O relatório foi baixado com sucesso.' });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({ title: 'Erro', description: 'Não foi possível gerar o PDF.', variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!event) {
    return (
      <MainLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground">Evento não encontrado.</p>
          <Button variant="outline" onClick={() => navigate(-1)} className="mt-4">Voltar</Button>
        </div>
      </MainLayout>
    );
  }

  // Checklist summary calculations - cast item_type to string for flexibility
  const vtrItems = checklistItems.filter(i => {
    const t = i.item_type as string;
    return t !== 'uti' && t !== 'medications' && t !== 'psicotropicos' && t !== 'materiais' && t !== 'consumo_medicamentos' && t !== 'checklist_confirmed' && t !== 'uti_confirmed';
  });
  const utiItems = checklistItems.filter(i => (i.item_type as string) === 'uti');
  const medItems = checklistItems.filter(i => (i.item_type as string) === 'medications' || (i.item_type as string) === 'psicotropicos');
  const materialItems = checklistItems.filter(i => (i.item_type as string) === 'materiais');
  const medConsItems = checklistItems.filter(i => (i.item_type as string) === 'consumo_medicamentos');

  const calcChecklist = (items: ChecklistItem[]) => {
    if (items.length === 0) return { total: 0, checked: 0, pct: 0, allOk: false, hasNonConform: false };
    const checked = items.filter(i => i.is_checked).length;
    const pct = Math.round((checked / items.length) * 100);
    // Check for non-conformities (items marked with 'X' via is_checked false but that exist)
    const hasNonConform = items.some(i => !i.is_checked);
    return { total: items.length, checked, pct, allOk: pct === 100, hasNonConform };
  };

  const calcUti = (items: ChecklistItem[]) => {
    if (items.length === 0) return { total: 0, filled: 0, pct: 0, allOk: false, details: {} as Record<string, string> };
    // UTI data is stored as JSON in notes
    const item = items[0];
    try {
      const data = JSON.parse(item.notes || '{}') as Record<string, string>;
      const fields = Object.keys(data);
      const filled = fields.filter(k => data[k] !== '').length;
      const total = fields.length || 9;
      const pct = Math.round((filled / total) * 100);
      const hasIssue = Object.values(data).some(v => v === 'I' || v === 'Mín.' || v === 'R' || v === 'Não');
      return { total, filled, pct, allOk: pct === 100 && !hasIssue, details: data };
    } catch {
      return { total: 9, filled: 0, pct: 0, allOk: false, details: {} };
    }
  };

  const vtrSummary = calcChecklist(vtrItems);
  const utiSummary = calcUti(utiItems);

  // For medications, we check if they were confirmed (stored as checklist items with notes as JSON)
  const calcMeds = (items: ChecklistItem[]) => {
    if (items.length === 0) return { total: 0, filled: 0, pct: 0, allOk: false };
    const item = items[0];
    try {
      const meds = JSON.parse(item.notes || '[]') as { name: string; quantity: number; checked: boolean }[];
      if (Array.isArray(meds)) {
        const filled = meds.filter(m => m.quantity >= 1).length;
        const total = meds.length;
        const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
        return { total, filled, pct, allOk: pct === 100 };
      }
    } catch { /* ignore */ }
    // Fallback: just check if item is marked
    return { total: 1, filled: item.is_checked ? 1 : 0, pct: item.is_checked ? 100 : 0, allOk: !!item.is_checked };
  };

  const medSummary = calcMeds(medItems);

  const renderStatusBadge = (pct: number, allOk: boolean) => {
    if (allOk) return <Badge className="bg-green-600 text-white text-[10px]">✓ CONFORME — {pct}%</Badge>;
    if (pct === 0) return <Badge variant="outline" className="text-muted-foreground text-[10px]">NÃO PREENCHIDO — 0%</Badge>;
    if (pct === 100) return <Badge className="bg-amber-500 text-white text-[10px]">⚠ ATENÇÃO — {pct}%</Badge>;
    return <Badge variant="destructive" className="text-[10px]">INCOMPLETO — {pct}%</Badge>;
  };

  return (
    <MainLayout>
      <div className="max-w-3xl mx-auto space-y-6 animate-fade-in pb-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-base font-black tracking-tight uppercase flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Relatório do Evento
              </h1>
              <p className="text-xs text-muted-foreground">{event.code}</p>
            </div>
          </div>
          <Button onClick={generatePdf} disabled={isGeneratingPdf} className="rounded-2xl font-bold uppercase text-xs">
            {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Baixar PDF
          </Button>
        </div>

        {/* LGPD Notice */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3">
          <ShieldCheck className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <p className="font-bold uppercase tracking-wider">Conformidade LGPD</p>
            <p>Dados pessoais de pacientes são parcialmente anonimizados neste relatório. O nome do paciente é mascarado a partir do sobrenome e a data de nascimento é ocultada parcialmente.</p>
          </div>
        </div>

        {/* Section 1: Event Info */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              1. Dados do Evento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Código</span><p className="font-bold">{event.code}</p></div>
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Status</span><p><Badge>{statusLabels[event.status]}</Badge></p></div>
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Local</span><p>{event.location || '---'}</p></div>
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Viatura</span><p>{ambulance?.code || '---'} {ambulance?.plate ? `(${ambulance.plate})` : ''}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground text-xs font-bold uppercase">Descrição</span><p>{event.description || '---'}</p></div>
              
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Saída da Base</span><p>{baseDeparture ? formatBR(baseDeparture, "dd/MM/yyyy HH:mm") : '---'}</p></div>
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Chegada à Base</span><p>{baseArrival ? formatBR(baseArrival, "dd/MM/yyyy HH:mm") : '---'}</p></div>
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Início do Evento</span><p>{event.departure_time ? formatBR(event.departure_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
              <div><span className="text-muted-foreground text-xs font-bold uppercase">Término do Evento</span><p>{event.arrival_time ? formatBR(event.arrival_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2: Team */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Users className="h-4 w-4" />
              2. Equipe ({participants.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {participants.length > 0 ? (
              <div className="space-y-2">
                {participants.map(p => (
                  <div key={p.id} className="flex items-center justify-between text-sm border rounded-xl p-3">
                    <div>
                      <p className="font-bold">{p.profile?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{p.profile?.professional_id || 'Sem registro'}</p>
                    </div>
                    <Badge variant="outline">{roleLabels[p.role]}</Badge>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhum participante.</p>}
          </CardContent>
        </Card>

        {/* Section 3: Patients */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <UserRound className="h-4 w-4" />
              3. Pacientes ({patients.length})
              <span className="text-[9px] text-amber-600 font-normal ml-2">LGPD: dados anonimizados</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {patients.length > 0 ? (
              <div className="space-y-4">
                {patients.map(p => (
                  <div key={p.id} className="border rounded-xl p-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground text-xs font-bold">Nome</span><p className="font-bold">{maskName(p.name)}</p></div>
                      <div><span className="text-muted-foreground text-xs font-bold">Idade</span><p>{p.age ? `${p.age} anos` : '---'}</p></div>
                      <div><span className="text-muted-foreground text-xs font-bold">Gênero</span><p>{p.gender || '---'}</p></div>
                      <div><span className="text-muted-foreground text-xs font-bold">Nasc.</span><p>{maskDate(p.birth_date)}</p></div>
                      {(p as any).cpf && (
                        <div><span className="text-muted-foreground text-xs font-bold">CPF</span><p>{maskCpf((p as any).cpf)}</p></div>
                      )}
                      <div className="col-span-2"><span className="text-muted-foreground text-xs font-bold">Queixa Principal</span><p>{p.main_complaint || '---'}</p></div>
                      <div className="col-span-2"><span className="text-muted-foreground text-xs font-bold">Histórico</span><p>{stripSignatureMetadata(p.brief_history) || '---'}</p></div>
                      <div className="col-span-2"><span className="text-muted-foreground text-xs font-bold">Alergias</span><p>{p.allergies || 'Nenhuma informada'}</p></div>
                      <div className="col-span-2"><span className="text-muted-foreground text-xs font-bold">Medicamentos em Uso</span><p>{p.current_medications || 'Nenhum informado'}</p></div>
                    </div>

                    {/* LGPD Signature Section */}
                    {(() => {
                      const sig = parseSignatureFromHistory(p.brief_history);
                      if (!sig) return null;
                      return (
                        <div className="border-t pt-3 mt-2">
                          <div className="flex items-center gap-2 mb-2">
                            <ShieldCheck className="h-4 w-4 text-primary" />
                            <span className="text-xs font-bold text-primary uppercase">Consentimento LGPD</span>
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <span className="text-muted-foreground text-xs font-bold">Assinado por</span>
                              <p>{sig.signerType === 'responsavel' ? `Responsável: ${sig.responsibleName || '---'}` : 'Paciente'}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs font-bold">CPF</span>
                              <p>{sig.signerType === 'responsavel' ? maskCpf(sig.responsibleCpf) : maskCpf(sig.patientCpf || (p as any).cpf)}</p>
                            </div>
                            <div>
                              <span className="text-muted-foreground text-xs font-bold">Data do Consentimento</span>
                              <p>{sig.consentDate ? formatBR(sig.consentDate, "dd/MM/yyyy 'às' HH:mm") : '---'}</p>
                            </div>
                          </div>
                          {sig.signatureData && (
                            <div className="mt-2">
                              <span className="text-muted-foreground text-xs font-bold">Assinatura</span>
                              <div className="border rounded-lg bg-white p-2 mt-1 max-w-[250px]">
                                <img src={sig.signatureData} alt="Assinatura do paciente/responsável" className="h-16 w-auto object-contain" />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhum paciente registrado.</p>}
          </CardContent>
        </Card>

        {/* Section 4: Checklists (Summary) */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              4. Checklists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* VTR Checklist */}
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  Checklist da Viatura
                </p>
                {renderStatusBadge(vtrSummary.pct, vtrSummary.allOk)}
              </div>
              {vtrSummary.total > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {vtrSummary.checked}/{vtrSummary.total} itens conferidos ({vtrSummary.pct}%)
                  {vtrSummary.allOk && ' — Todos os itens em conformidade.'}
                  {vtrSummary.hasNonConform && !vtrSummary.allOk && ' — Existem itens não conformes.'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Checklist não preenchido.</p>
              )}
            </div>

            {/* UTI Conditions */}
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  Condições da UTI
                </p>
                {renderStatusBadge(utiSummary.pct, utiSummary.allOk)}
              </div>
              {utiSummary.filled > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground">
                    {utiSummary.filled}/{utiSummary.total} campos preenchidos ({utiSummary.pct}%)
                    {utiSummary.allOk && ' — Veículo em boas condições.'}
                  </p>
                  {Object.keys(utiSummary.details).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {Object.entries(utiSummary.details).filter(([, v]) => v !== '').map(([k, v]) => {
                        const isIssue = v === 'I' || v === 'Mín.' || v === 'R' || v === 'Não';
                        return (
                          <Badge key={k} variant={isIssue ? 'destructive' : 'outline'} className="text-[9px]">
                            {k.replace(/_/g, ' ')}: {v}
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground italic">Condições da UTI não preenchidas.</p>
              )}
            </div>

            {/* Medications */}
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2">
                  <Pill className="h-4 w-4 text-muted-foreground" />
                  Controle de Psicotrópicos
                </p>
                {renderStatusBadge(medSummary.pct, medSummary.allOk)}
              </div>
              {medSummary.total > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {medSummary.filled}/{medSummary.total} medicamentos verificados ({medSummary.pct}%)
                  {medSummary.allOk && ' — Inventário clínico em conformidade.'}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Controle de psicotrópicos não preenchido.</p>
              )}
            </div>

            {/* Materials Consumption */}
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  Consumo de Materiais
                </p>
                {materialItems.length > 0 ? (
                  <Badge className="bg-green-600 text-white text-[10px]">✓ REGISTRADO — {materialItems.length} itens</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">NÃO PREENCHIDO</Badge>
                )}
              </div>
              {materialItems.length > 0 ? (
                <div className="space-y-1 mt-2">
                  {materialItems.map(m => {
                    const qty = parseInt(m.notes || '0') || 0;
                    const uc = (m as any).cost_item_id ? (costItemsMap.get((m as any).cost_item_id) ?? 0) : (costItemNameMap.get(m.item_name.toLowerCase()) ?? 0);
                    const total = uc * qty;
                    return (
                      <div key={m.id} className="flex justify-between text-xs">
                        <span>{m.item_name} × {qty}</span>
                        <span className="font-bold">{uc > 0 ? fmtCurrency(total) : `${qty} un`}</span>
                      </div>
                    );
                  })}
                  {(() => {
                    const totalMat = materialItems.reduce((s, m) => {
                      const qty = parseInt(m.notes || '0') || 0;
                      const uc = (m as any).cost_item_id ? (costItemsMap.get((m as any).cost_item_id) ?? 0) : (costItemNameMap.get(m.item_name.toLowerCase()) ?? 0);
                      return s + uc * qty;
                    }, 0);
                    return totalMat > 0 ? (
                      <div className="border-t pt-1 mt-1 flex justify-between text-xs font-bold">
                        <span>Total</span>
                        <span>{fmtCurrency(totalMat)}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Consumo de materiais não registrado.</p>
              )}
            </div>

            {/* Medication Consumption */}
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2">
                  <Pill className="h-4 w-4 text-muted-foreground" />
                  Consumo de Medicamentos
                </p>
                {medConsItems.length > 0 ? (
                  <Badge className="bg-pink-600 text-white text-[10px]">✓ REGISTRADO — {medConsItems.length} itens</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">NÃO PREENCHIDO</Badge>
                )}
              </div>
              {medConsItems.length > 0 ? (
                <div className="space-y-1 mt-2">
                  {medConsItems.map(m => {
                    const qty = parseInt(m.notes || '0') || 0;
                    const uc = (m as any).cost_item_id ? (costItemsMap.get((m as any).cost_item_id) ?? 0) : (costItemNameMap.get(m.item_name.toLowerCase()) ?? 0);
                    const total = uc * qty;
                    return (
                      <div key={m.id} className="flex justify-between text-xs">
                        <span>{m.item_name} × {qty}</span>
                        <span className="font-bold">{uc > 0 ? fmtCurrency(total) : `${qty} un`}</span>
                      </div>
                    );
                  })}
                  {(() => {
                    const totalMed = medConsItems.reduce((s, m) => {
                      const qty = parseInt(m.notes || '0') || 0;
                      const uc = (m as any).cost_item_id ? (costItemsMap.get((m as any).cost_item_id) ?? 0) : (costItemNameMap.get(m.item_name.toLowerCase()) ?? 0);
                      return s + uc * qty;
                    }, 0);
                    return totalMed > 0 ? (
                      <div className="border-t pt-1 mt-1 flex justify-between text-xs font-bold">
                        <span>Total</span>
                        <span>{fmtCurrency(totalMed)}</span>
                      </div>
                    ) : null;
                  })()}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Consumo de medicamentos não registrado.</p>
              )}
            </div>

            {checklistItems.length === 0 && (
              <p className="text-sm text-muted-foreground italic">Nenhum checklist registrado para este evento.</p>
            )}
          </CardContent>
        </Card>

        {/* Section 5: Nursing Evolutions */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Activity className="h-4 w-4" />
              5. Evoluções de Enfermagem ({nursingEvolutions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {nursingEvolutions.length > 0 ? (
              <div className="space-y-4">
                {nursingEvolutions.map(ev => {
                  const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
                  const patientName = patients.find(p => p.id === ev.patient_id)?.name;
                  return (
                    <div key={ev.id} className="border rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatBR(ev.created_at, "dd/MM/yyyy HH:mm")}</span>
                        {patientName && <span>Paciente: {maskName(patientName)}</span>}
                      </div>
                      <div className="grid grid-cols-6 gap-2 text-center">
                        {[
                          { l: 'PA', v: `${ev.blood_pressure_systolic || '--'}/${ev.blood_pressure_diastolic || '--'}` },
                          { l: 'FC', v: ev.heart_rate || '--' },
                          { l: 'FR', v: ev.respiratory_rate || '--' },
                          { l: 'SpO2', v: ev.oxygen_saturation ? `${ev.oxygen_saturation}` : '--' },
                          { l: 'TEMP', v: ev.temperature || '--' },
                          { l: 'GLIC', v: ev.blood_glucose || '--' },
                        ].map(vi => (
                          <div key={vi.l}>
                            <p className="text-[9px] uppercase font-bold text-muted-foreground">{vi.l}</p>
                            <p className="text-sm font-bold">{vi.v}</p>
                          </div>
                        ))}
                      </div>
                      {ev.observations && <p className="text-xs text-muted-foreground">{ev.observations}</p>}
                      <div className="text-[10px] text-muted-foreground border-t pt-2">
                        <span className="font-semibold">{signer?.full_name || '---'}</span>
                        {signer?.professional_id && <span> ({signer.professional_id})</span>}
                        {ev.signed_at && <span> • Assinado: {formatBR(ev.signed_at, "dd/MM/yyyy HH:mm:ss")}</span>}
                      </div>
                      {ev.signature_data && (
                        <img src={ev.signature_data} alt="Assinatura" className="h-12 rounded bg-white border mt-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhuma evolução de enfermagem.</p>}
          </CardContent>
        </Card>

        {/* Section 6: Medical Evolutions */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Stethoscope className="h-4 w-4" />
              6. Evoluções Médicas ({medicalEvolutions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {medicalEvolutions.length > 0 ? (
              <div className="space-y-4">
                {medicalEvolutions.map(ev => {
                  const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
                  const patientName = patients.find(p => p.id === ev.patient_id)?.name;
                  return (
                    <div key={ev.id} className="border rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{formatBR(ev.created_at, "dd/MM/yyyy HH:mm")}</span>
                        {patientName && <span>Paciente: {maskName(patientName)}</span>}
                      </div>
                      {ev.medical_assessment && <div className="text-sm"><span className="text-xs font-bold text-muted-foreground">Avaliação:</span><p>{ev.medical_assessment}</p></div>}
                      {ev.diagnosis && <div className="text-sm"><span className="text-xs font-bold text-muted-foreground">Diagnóstico:</span><p>{ev.diagnosis}</p></div>}
                      {ev.conduct && <div className="text-sm"><span className="text-xs font-bold text-muted-foreground">Conduta:</span><p>{ev.conduct}</p></div>}
                      {ev.prescription && <div className="text-sm"><span className="text-xs font-bold text-muted-foreground">Prescrição:</span><p>{ev.prescription}</p></div>}
                      {ev.observations && <div className="text-sm"><span className="text-xs font-bold text-muted-foreground">Observações:</span><p>{ev.observations}</p></div>}
                      <div className="text-[10px] text-muted-foreground border-t pt-2">
                        <span className="font-semibold">{signer?.full_name || '---'}</span>
                        {signer?.professional_id && <span> ({signer.professional_id})</span>}
                        {ev.signed_at && <span> • Assinado: {formatBR(ev.signed_at, "dd/MM/yyyy HH:mm:ss")}</span>}
                      </div>
                      {ev.signature_data && (
                        <img src={ev.signature_data} alt="Assinatura" className="h-12 rounded bg-white border mt-1" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhuma evolução médica.</p>}
          </CardContent>
        </Card>

        {/* Section 7: Transport */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Truck className="h-4 w-4" />
              7. Transporte ({transportRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transportRecords.length > 0 ? (
              <div className="space-y-3">
                {transportRecords.map(tr => {
                  const signer = tr.created_by ? signerProfiles[tr.created_by] : null;
                  // Parse reserve km from occurrences JSON
                  let occText = tr.occurrences || '';
                  let reserveInitialKm: number | null = null;
                  let reserveFinalKm: number | null = null;
                  try {
                    const parsed = JSON.parse(occText);
                    if (parsed && typeof parsed === 'object' && 'occurrences' in parsed) {
                      occText = parsed.occurrences || '';
                      reserveInitialKm = parsed.reserve_initial_km ?? null;
                      reserveFinalKm = parsed.reserve_final_km ?? null;
                    }
                  } catch { /* plain text */ }
                  const distance = (tr.initial_km != null && tr.final_km != null) ? (tr.final_km - tr.initial_km).toFixed(1) : null;
                  const reserveDistance = (reserveInitialKm != null && reserveFinalKm != null) ? (reserveFinalKm - reserveInitialKm).toFixed(1) : null;
                  return (
                    <div key={tr.id} className="border rounded-xl p-4 space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-xs font-bold text-muted-foreground">Saída</span><p>{tr.departure_time ? formatBR(tr.departure_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
                        <div><span className="text-xs font-bold text-muted-foreground">Chegada</span><p>{tr.arrival_time ? formatBR(tr.arrival_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
                      </div>
                      <Separator />
                      <p className="text-xs font-bold text-muted-foreground uppercase">Quilometragem</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div><span className="text-xs font-bold text-muted-foreground">KM Inicial</span><p>{tr.initial_km ?? '---'}</p></div>
                        <div><span className="text-xs font-bold text-muted-foreground">KM Final</span><p>{tr.final_km ?? '---'}</p></div>
                        <div><span className="text-xs font-bold text-muted-foreground">Distância</span><p className="font-semibold">{distance ? `${distance} km` : '---'}</p></div>
                      </div>
                      {(reserveInitialKm != null || reserveFinalKm != null) && (
                        <>
                          <Separator />
                          <p className="text-xs font-bold text-muted-foreground uppercase">Reserva</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div><span className="text-xs font-bold text-muted-foreground">KM Inicial</span><p>{reserveInitialKm ?? '---'}</p></div>
                            <div><span className="text-xs font-bold text-muted-foreground">KM Final</span><p>{reserveFinalKm ?? '---'}</p></div>
                            <div><span className="text-xs font-bold text-muted-foreground">Distância</span><p className="font-semibold">{reserveDistance ? `${reserveDistance} km` : '---'}</p></div>
                          </div>
                        </>
                      )}
                      {occText && (
                        <>
                          <Separator />
                          <p className="text-xs text-muted-foreground">Ocorrências: {occText}</p>
                        </>
                      )}
                      {transportPhotos[tr.id]?.length > 0 && (
                        <>
                          <Separator />
                          <p className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1">
                            <Camera className="h-3 w-3" /> Fotos ({transportPhotos[tr.id].length})
                          </p>
                          <div className="grid grid-cols-3 gap-2">
                            {transportPhotos[tr.id].map((photo) => (
                              <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer">
                                <img
                                  src={photo.url}
                                  alt={photo.name}
                                  className="w-full aspect-square object-cover rounded-md border"
                                />
                              </a>
                            ))}
                          </div>
                        </>
                      )}
                      <div className="text-[10px] text-muted-foreground border-t pt-2">
                        <span className="font-semibold">{signer?.full_name || '---'}</span>
                        {tr.signed_at && <span> • Assinado: {formatBR(tr.signed_at, "dd/MM/yyyy HH:mm:ss")}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhum registro de transporte.</p>}
          </CardContent>
        </Card>

        {/* Section 8: Digital Signatures */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              8. Assinaturas Digitais ({signatures.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {signatures.length > 0 ? (
              <div className="space-y-2">
                {signatures.map(sig => {
                  const sp = signerProfiles[sig.profile_id];
                  return (
                    <div key={sig.id} className="border rounded-xl p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold">{sp?.full_name || '---'}</p>
                          <p className="text-xs text-muted-foreground">{sig.professional_id || sp?.professional_id || '---'}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="outline" className="text-[10px]">{sigTypeLabels[sig.signature_type]}</Badge>
                          <p className="text-[10px] text-muted-foreground mt-1">{formatBR(sig.signed_at, "dd/MM/yyyy HH:mm:ss")}</p>
                        </div>
                      </div>
                      {sig.signature_data && (
                        <img src={sig.signature_data} alt="Assinatura" className="h-14 rounded bg-white border" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhuma assinatura digital.</p>}
          </CardContent>
        </Card>

        {/* LGPD Footer */}
        <div className="border-t pt-4 space-y-2 text-center">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">Conformidade LGPD (Lei 13.709/2018)</p>
          <p className="text-[9px] text-muted-foreground max-w-lg mx-auto">
            Este relatório contém dados pessoais sensíveis protegidos pela LGPD. O tratamento tem base legal no Art. 7º, VIII (tutela da saúde) e Art. 11, II, "f" (proteção da vida). É proibida a reprodução ou distribuição não autorizada.
          </p>
          <p className="text-[9px] text-muted-foreground">
            Gerado por: {profile?.full_name || '---'} em {formatBR(new Date(), "dd/MM/yyyy 'às' HH:mm")}
          </p>
        </div>
      </div>
    </MainLayout>
  );
}
