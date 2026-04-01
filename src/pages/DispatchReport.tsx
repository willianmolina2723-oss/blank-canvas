import { useEffect, useState } from 'react';
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
  Activity, ClipboardList, ShieldCheck, Clock, UserRound,
  CheckCircle2, AlertTriangle, Pill, Car, Package, Camera, ListChecks
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { formatBR } from '@/utils/dateFormat';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fetchLogoAsBase64, fetchOrgName } from '@/utils/logoStorage';
import type {
  Event, Ambulance, ChecklistItem, EventParticipant,
  Profile, NursingEvolution, MedicalEvolution, TransportRecord,
  DigitalSignature
} from '@/types/database';

interface DispatchOccurrence {
  id: string;
  occurrence_name: string;
  quantity: number;
  observation: string | null;
  report_id: string;
  created_at: string;
}

interface DispatchReport {
  id: string;
  event_id: string;
  status: string;
  observations: string | null;
  base_departure: string | null;
  event_arrival: string | null;
  base_arrival: string | null;
  start_time: string | null;
  end_time: string | null;
  signed_at: string | null;
  created_at: string;
  updated_at: string;
}

export default function DispatchReportPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(true);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [event, setEvent] = useState<Event | null>(null);
  const [ambulance, setAmbulance] = useState<Ambulance | null>(null);
  const [participants, setParticipants] = useState<(EventParticipant & { profile: Profile })[]>([]);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [nursingEvolutions, setNursingEvolutions] = useState<NursingEvolution[]>([]);
  const [medicalEvolutions, setMedicalEvolutions] = useState<MedicalEvolution[]>([]);
  const [transportRecords, setTransportRecords] = useState<TransportRecord[]>([]);
  const [transportPhotos, setTransportPhotos] = useState<Record<string, { name: string; url: string }[]>>({});
  const [signatures, setSignatures] = useState<DigitalSignature[]>([]);
  const [signerProfiles, setSignerProfiles] = useState<Record<string, Profile>>({});
  const [dispatchReport, setDispatchReport] = useState<DispatchReport | null>(null);
  const [occurrences, setOccurrences] = useState<DispatchOccurrence[]>([]);

  useEffect(() => {
    if (eventId) loadAllData();
  }, [eventId]);

  const loadAllData = async () => {
    setIsLoading(true);
    try {
      const [
        eventRes, participantsRes, checklistRes,
        nursingRes, medicalRes, transportRes, signaturesRes, dispatchRes
      ] = await Promise.all([
        supabase.from('events').select('*, ambulances(*)').eq('id', eventId!).single(),
        supabase.from('event_participants').select('*, profile:profiles(*)').eq('event_id', eventId!),
        supabase.from('checklist_items').select('*').eq('event_id', eventId!).order('item_type').order('created_at'),
        supabase.from('nursing_evolutions').select('*').eq('event_id', eventId!).order('created_at', { ascending: false }),
        supabase.from('medical_evolutions').select('*').eq('event_id', eventId!).order('created_at', { ascending: false }),
        supabase.from('transport_records').select('*').eq('event_id', eventId!).order('created_at', { ascending: false }),
        supabase.from('digital_signatures').select('*').eq('event_id', eventId!).order('signed_at'),
        supabase.from('dispatch_reports').select('*').eq('event_id', eventId!).maybeSingle(),
      ]);

      if (eventRes.error) throw eventRes.error;

      const ev = eventRes.data as any;
      setEvent(ev as Event);
      setAmbulance(ev.ambulances as Ambulance || null);
      setParticipants((participantsRes.data || []) as any);
      setChecklistItems((checklistRes.data || []) as ChecklistItem[]);
      setNursingEvolutions((nursingRes.data || []) as NursingEvolution[]);
      setMedicalEvolutions((medicalRes.data || []) as MedicalEvolution[]);
      setTransportRecords((transportRes.data || []) as TransportRecord[]);
      setSignatures((signaturesRes.data || []) as DigitalSignature[]);

      const dr = dispatchRes.data as DispatchReport | null;
      setDispatchReport(dr);

      // Load occurrences if dispatch report exists
      if (dr) {
        const { data: occData } = await supabase
          .from('dispatch_occurrences')
          .select('*')
          .eq('report_id', dr.id)
          .order('created_at');
        setOccurrences((occData || []) as DispatchOccurrence[]);
      }

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

      // Load profiles for creators
      const allCreatorIds = [
        ...(nursingRes.data || []).map((e: any) => e.created_by),
        ...(medicalRes.data || []).map((e: any) => e.created_by),
        ...(transportRes.data || []).map((e: any) => e.created_by),
        ...(signaturesRes.data || []).map((e: any) => e.profile_id),
      ].filter(Boolean);
      const uniqueIds = [...new Set(allCreatorIds)] as string[];

      if (uniqueIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('*').in('id', uniqueIds);
        if (profiles) {
          const map: Record<string, Profile> = {};
          profiles.forEach((p: any) => { map[p.id] = p as Profile; });
          setSignerProfiles(map);
        }
      }
    } catch (err) {
      console.error('Error loading dispatch report data:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível carregar os dados do relatório de envio.'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const roleLabels: Record<string, string> = {
    admin: 'Administrador', condutor: 'Condutor', enfermeiro: 'Enfermeiro(a)', tecnico: 'Técnico(a)', medico: 'Médico(a)',
  };
  const statusLabels: Record<string, string> = {
    ativo: 'Ativo', em_andamento: 'Em Andamento', finalizado: 'Finalizado', cancelado: 'Cancelado',
  };
  const sigTypeLabels: Record<string, string> = {
    enfermagem: 'Enfermagem', medica: 'Médica', transporte: 'Transporte', checklist: 'Checklist',
  };

  const generatePdf = async () => {
    if (!event) return;
    setIsGeneratingPdf(true);

    try {
      const doc = new jsPDF();
      let y = 15;

      const [logoBase64, orgName] = await Promise.all([fetchLogoAsBase64(), fetchOrgName()]);

      // Header
      if (logoBase64) {
        try {
          doc.addImage(logoBase64, 'PNG', 14, y + 1, 60, 15);
          const titleX = 78;
          if (orgName) {
            doc.setFontSize(12);
            doc.setFont('helvetica', 'bold');
            doc.text(orgName.toUpperCase(), titleX, y + 5);
            doc.setFontSize(10);
            doc.text('RELATÓRIO DE ENVIO', titleX, y + 11);
          } else {
            doc.setFontSize(14);
            doc.setFont('helvetica', 'bold');
            doc.text('RELATÓRIO DE ENVIO', titleX, y + 8);
          }
          y += 18;
        } catch {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text(orgName || 'RELATÓRIO DE ENVIO', 105, y, { align: 'center' });
          y += 8;
        }
      } else {
        if (orgName) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(orgName.toUpperCase(), 105, y, { align: 'center' });
          y += 7;
        }
        doc.setFontSize(orgName ? 11 : 16);
        doc.setFont('helvetica', 'bold');
        doc.text('RELATÓRIO DE ENVIO', 105, y, { align: 'center' });
        y += 8;
      }

      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Gerado em: ${formatBR(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}`, 105, y, { align: 'center' });
      y += 10;

      // 1. Event info
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
          
          ['Saída da Base', dispatchReport?.base_departure ? formatBR(dispatchReport.base_departure, "dd/MM/yyyy 'às' HH:mm") : '---'],
          ['Chegada à Base', dispatchReport?.base_arrival ? formatBR(dispatchReport.base_arrival, "dd/MM/yyyy 'às' HH:mm") : '---'],
          ['Início do Evento', event.departure_time ? formatBR(event.departure_time, "dd/MM/yyyy 'às' HH:mm") : '---'],
          ['Término do Evento', event.arrival_time ? formatBR(event.arrival_time, "dd/MM/yyyy 'às' HH:mm") : '---'],
        ],
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
        margin: { left: 14 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // 2. Team
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

      // 3. Occurrences (instead of patients)
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('3. OCORRÊNCIAS', 14, y);
      y += 6;

      const groupedOcc = occurrences.reduce<Record<string, number>>((acc, o) => {
        acc[o.occurrence_name] = (acc[o.occurrence_name] || 0) + o.quantity;
        return acc;
      }, {});
      const groupedOccEntries = Object.entries(groupedOcc);

      if (groupedOccEntries.length > 0) {
        autoTable(doc, {
          startY: y,
          theme: 'grid',
          headStyles: { fillColor: [234, 88, 12] },
          head: [['Ocorrência', 'Qtd']],
          body: groupedOccEntries.map(([name, qty]) => [
            name,
            qty.toString(),
          ]),
          margin: { left: 14 },
        });
        y = (doc as any).lastAutoTable.finalY + 10;
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhuma ocorrência registrada.', 14, y);
        y += 8;
      }

      // 4. Checklists
      if (y > 250) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('4. CHECKLISTS', 14, y);
      y += 6;

      const vtrItems = checklistItems.filter(i => {
        const t = i.item_type as string;
        return t !== 'uti' && t !== 'medications' && t !== 'psicotropicos' && t !== 'materiais' && t !== 'consumo_medicamentos' && t !== 'checklist_confirmed' && t !== 'uti_confirmed';
      });
      const matItems = checklistItems.filter(i => (i.item_type as string) === 'materiais');
      const medConsItems = checklistItems.filter(i => (i.item_type as string) === 'consumo_medicamentos');

      const vtrChecked = vtrItems.filter(i => i.is_checked).length;
      const vtrPct = vtrItems.length > 0 ? Math.round((vtrChecked / vtrItems.length) * 100) : 0;

      autoTable(doc, {
        startY: y,
        theme: 'grid',
        headStyles: { fillColor: [245, 158, 11] },
        head: [['Checklist', 'Status', 'Percentual']],
        body: [
          ['Checklist da Viatura', vtrPct === 100 ? '✓ CONFORME' : vtrItems.length === 0 ? 'Não preenchido' : 'INCOMPLETO', `${vtrPct}% (${vtrChecked}/${vtrItems.length})`],
          ['Consumo de Materiais', matItems.length > 0 ? '✓ REGISTRADO' : 'Não preenchido', matItems.length > 0 ? `${matItems.length} itens` : '---'],
          ['Consumo de Medicamentos', medConsItems.length > 0 ? '✓ REGISTRADO' : 'Não preenchido', medConsItems.length > 0 ? `${medConsItems.length} itens` : '---'],
        ],
        margin: { left: 14 },
        bodyStyles: { fontSize: 9 },
      });
      y = (doc as any).lastAutoTable.finalY + 10;

      // 5. Transport
      if (y > 200) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('5. TRANSPORTE', 14, y);
      y += 6;

      if (transportRecords.length > 0) {
        for (const tr of transportRecords) {
          if (y > 240) { doc.addPage(); y = 15; }
          const signer = tr.created_by ? signerProfiles[tr.created_by] : null;
          let occText = tr.occurrences || '';
          try {
            const parsed = JSON.parse(occText);
            if (parsed && typeof parsed === 'object' && 'occurrences' in parsed) {
              occText = parsed.occurrences || '';
            }
          } catch { /* plain text */ }
          const distance = (tr.initial_km != null && tr.final_km != null) ? `${(tr.final_km - tr.initial_km).toFixed(1)} km` : '---';

          autoTable(doc, {
            startY: y,
            theme: 'grid',
            headStyles: { fillColor: [100, 116, 139] },
            body: [
              ['Saída', tr.departure_time ? formatBR(tr.departure_time, "dd/MM/yyyy HH:mm") : '---'],
              ['Chegada', tr.arrival_time ? formatBR(tr.arrival_time, "dd/MM/yyyy HH:mm") : '---'],
              ['KM Inicial', tr.initial_km?.toString() || '---'],
              ['KM Final', tr.final_km?.toString() || '---'],
              ['Distância', distance],
              ['Ocorrências', occText || 'Nenhuma'],
              ['Condutor', `${signer?.full_name || '---'} | Assinado: ${tr.signed_at ? formatBR(tr.signed_at, "dd/MM/yyyy HH:mm:ss") : 'Não assinado'}`],
            ],
            columnStyles: { 0: { fontStyle: 'bold', cellWidth: 40 } },
            margin: { left: 14 },
          });
          y = (doc as any).lastAutoTable.finalY + 6;

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
                const imageFormat: 'JPEG' | 'PNG' = blob.type.includes('png') ? 'PNG' : 'JPEG';
                doc.addImage(base64, imageFormat, x, y, photoWidth, photoHeight);
              } catch (e) {
                console.warn('Photo embed error:', e);
                doc.setFontSize(7);
                doc.text('Foto indisponível', x + 5, y + 20);
              }
            }

            y += photoHeight + gap;
          }
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhum registro de transporte.', 14, y);
        y += 8;
      }

      // 6. Signatures
      if (y > 200) { doc.addPage(); y = 15; }
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('6. ASSINATURAS DIGITAIS', 14, y);
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
          if (sig.signature_data) {
            try {
              if (y + 22 > 280) { doc.addPage(); y = 15; }
              doc.addImage(sig.signature_data, 'PNG', 14, y, 50, 18);
              y += 22;
            } catch { /* ignore */ }
          }
          y += 4;
        }
      } else {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(9);
        doc.text('Nenhuma assinatura digital registrada.', 14, y);
        y += 8;
      }

      // Footer
      if (y > 240) { doc.addPage(); y = 15; }
      doc.setDrawColor(200, 200, 200);
      doc.line(14, y, 196, y);
      y += 6;
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(120, 120, 120);
      doc.text(`Documento gerado por: ${profile?.full_name || '---'} em ${formatBR(new Date(), "dd/MM/yyyy 'às' HH:mm:ss")}`, 105, y, { align: 'center' });

      doc.save(`Envio_${event.code}_${formatBR(new Date(), 'yyyyMMdd_HHmmss')}.pdf`);
      toast({ title: 'PDF gerado', description: 'O relatório de envio foi baixado com sucesso.' });
    } catch (err) {
      console.error('Error generating PDF:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível gerar o PDF.'), variant: 'destructive' });
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  // Checklist helpers
  const calcChecklist = (items: ChecklistItem[]) => {
    if (items.length === 0) return { total: 0, checked: 0, pct: 0, allOk: false, hasNonConform: false };
    const checked = items.filter(i => i.is_checked).length;
    const pct = Math.round((checked / items.length) * 100);
    return { total: items.length, checked, pct, allOk: pct === 100, hasNonConform: items.some(i => !i.is_checked) };
  };

  const renderStatusBadge = (pct: number, allOk: boolean) => {
    if (allOk) return <Badge className="bg-green-600 text-white text-[10px]">✓ CONFORME — {pct}%</Badge>;
    if (pct === 0) return <Badge variant="outline" className="text-muted-foreground text-[10px]">NÃO PREENCHIDO — 0%</Badge>;
    return <Badge variant="destructive" className="text-[10px]">INCOMPLETO — {pct}%</Badge>;
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

  const vtrItems = checklistItems.filter(i => {
    const t = i.item_type as string;
    return t !== 'uti' && t !== 'medications' && t !== 'psicotropicos' && t !== 'materiais' && t !== 'consumo_medicamentos' && t !== 'checklist_confirmed' && t !== 'uti_confirmed';
  });
  const materialItems = checklistItems.filter(i => (i.item_type as string) === 'materiais');
  const medConsItems = checklistItems.filter(i => (i.item_type as string) === 'consumo_medicamentos');
  const vtrSummary = calcChecklist(vtrItems);

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
                <FileText className="h-5 w-5 text-orange-600" />
                Relatório de Envio
              </h1>
              <p className="text-xs text-muted-foreground">{event.code}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate(`/report/${eventId}`)} className="rounded-2xl text-xs">
              <FileText className="h-4 w-4 mr-1" />
              Rel. Evento
            </Button>
            <Button onClick={generatePdf} disabled={isGeneratingPdf} className="rounded-2xl font-bold uppercase text-xs">
              {isGeneratingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Baixar PDF
            </Button>
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
              <div><span className="text-xs font-bold text-muted-foreground">Código</span><p className="font-bold">{event.code}</p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Status</span><p><Badge variant="outline">{statusLabels[event.status] || event.status}</Badge></p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Local</span><p>{event.location || '---'}</p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Viatura</span><p>{ambulance ? `${ambulance.code} ${ambulance.plate ? `(${ambulance.plate})` : ''}` : '---'}</p></div>
              <div className="col-span-2"><span className="text-xs font-bold text-muted-foreground">Descrição</span><p>{event.description || '---'}</p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Saída da Base</span><p>{dispatchReport?.base_departure ? formatBR(dispatchReport.base_departure, "dd/MM/yyyy HH:mm") : '---'}</p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Chegada à Base</span><p>{dispatchReport?.base_arrival ? formatBR(dispatchReport.base_arrival, "dd/MM/yyyy HH:mm") : '---'}</p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Início do Evento</span><p>{event.departure_time ? formatBR(event.departure_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
              <div><span className="text-xs font-bold text-muted-foreground">Término do Evento</span><p>{event.arrival_time ? formatBR(event.arrival_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
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
                  <div key={p.id} className="flex items-center gap-3 border rounded-xl p-3">
                    <UserRound className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{p.profile?.full_name || '---'}</p>
                      <p className="text-xs text-muted-foreground">{roleLabels[p.role] || p.role}{p.profile?.professional_id ? ` • ${p.profile.professional_id}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhum participante.</p>}
          </CardContent>
        </Card>

        {/* Section 3: Occurrences (instead of Patients) */}
        {(() => {
          const grouped = occurrences.reduce<Record<string, number>>((acc, o) => {
            acc[o.occurrence_name] = (acc[o.occurrence_name] || 0) + o.quantity;
            return acc;
          }, {});
          const groupedEntries = Object.entries(grouped);
          return (
            <Card className="rounded-2xl border-orange-500/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2 text-orange-600">
                  <ListChecks className="h-4 w-4" />
                  3. Ocorrências ({groupedEntries.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {groupedEntries.length > 0 ? (
                  <div className="space-y-2">
                    {groupedEntries.map(([name, qty]) => (
                      <div key={name} className="border rounded-xl p-3 flex items-center justify-between">
                        <p className="text-sm font-semibold">{name}</p>
                        <Badge variant="outline" className="text-xs">Qtd: {qty}</Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic">Nenhuma ocorrência registrada.</p>
                )}
              </CardContent>
            </Card>
          );
        })()}

        {/* Section 4: Checklists */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              4. Checklists
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2"><Car className="h-4 w-4 text-muted-foreground" />Checklist da Viatura</p>
                {renderStatusBadge(vtrSummary.pct, vtrSummary.allOk)}
              </div>
              {vtrSummary.total > 0 ? (
                <p className="text-xs text-muted-foreground">{vtrSummary.checked}/{vtrSummary.total} itens conferidos ({vtrSummary.pct}%)</p>
              ) : (
                <p className="text-xs text-muted-foreground italic">Checklist não preenchido.</p>
              )}
            </div>

            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2"><Package className="h-4 w-4 text-muted-foreground" />Consumo de Materiais</p>
                {materialItems.length > 0 ? (
                  <Badge className="bg-green-600 text-white text-[10px]">✓ REGISTRADO — {materialItems.length} itens</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">NÃO PREENCHIDO</Badge>
                )}
              </div>
              {materialItems.length > 0 && (
                <div className="space-y-1 mt-2">
                  {materialItems.map(m => (
                    <div key={m.id} className="flex justify-between text-xs">
                      <span>{m.item_name}</span>
                      <span className="font-bold">{m.notes || '0'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="border rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-2"><Pill className="h-4 w-4 text-muted-foreground" />Consumo de Medicamentos</p>
                {medConsItems.length > 0 ? (
                  <Badge className="bg-pink-600 text-white text-[10px]">✓ REGISTRADO — {medConsItems.length} itens</Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground text-[10px]">NÃO PREENCHIDO</Badge>
                )}
              </div>
              {medConsItems.length > 0 && (
                <div className="space-y-1 mt-2">
                  {medConsItems.map(m => (
                    <div key={m.id} className="flex justify-between text-xs">
                      <span>{m.item_name}</span>
                      <span className="font-bold">{m.notes || '0'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Section 5: Transport */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <Truck className="h-4 w-4" />
              5. Transporte ({transportRecords.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {transportRecords.length > 0 ? (
              <div className="space-y-3">
                {transportRecords.map(tr => {
                  const signer = tr.created_by ? signerProfiles[tr.created_by] : null;
                  let occText = tr.occurrences || '';
                  try {
                    const parsed = JSON.parse(occText);
                    if (parsed && typeof parsed === 'object' && 'occurrences' in parsed) {
                      occText = parsed.occurrences || '';
                    }
                  } catch { /* plain text */ }
                  const distance = (tr.initial_km != null && tr.final_km != null) ? (tr.final_km - tr.initial_km).toFixed(1) : null;
                  return (
                    <div key={tr.id} className="border rounded-xl p-4 space-y-3 text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div><span className="text-xs font-bold text-muted-foreground">Saída</span><p>{tr.departure_time ? formatBR(tr.departure_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
                        <div><span className="text-xs font-bold text-muted-foreground">Chegada</span><p>{tr.arrival_time ? formatBR(tr.arrival_time, "dd/MM/yyyy HH:mm") : '---'}</p></div>
                      </div>
                      <Separator />
                      <div className="grid grid-cols-3 gap-2">
                        <div><span className="text-xs font-bold text-muted-foreground">KM Inicial</span><p>{tr.initial_km ?? '---'}</p></div>
                        <div><span className="text-xs font-bold text-muted-foreground">KM Final</span><p>{tr.final_km ?? '---'}</p></div>
                        <div><span className="text-xs font-bold text-muted-foreground">Distância</span><p className="font-semibold">{distance ? `${distance} km` : '---'}</p></div>
                      </div>
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

        {/* Section 6: Signatures */}
        <Card className="rounded-2xl">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              6. Assinaturas Digitais ({signatures.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {signatures.length > 0 ? (
              <div className="space-y-3">
                {signatures.map(sig => {
                  const sp = signerProfiles[sig.profile_id];
                  return (
                    <div key={sig.id} className="border rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <Badge variant="outline">{sigTypeLabels[sig.signature_type] || sig.signature_type}</Badge>
                        <span className="text-muted-foreground">{formatBR(sig.signed_at, "dd/MM/yyyy HH:mm:ss")}</span>
                      </div>
                      <p className="text-sm font-semibold">{sp?.full_name || '---'}</p>
                      {(sig.professional_id || sp?.professional_id) && (
                        <p className="text-xs text-muted-foreground">Registro: {sig.professional_id || sp?.professional_id}</p>
                      )}
                      {sig.signature_data && (
                        <img src={sig.signature_data} alt="Assinatura" className="h-12 rounded bg-white border" />
                      )}
                    </div>
                  );
                })}
              </div>
            ) : <p className="text-sm text-muted-foreground italic">Nenhuma assinatura digital.</p>}
          </CardContent>
        </Card>

        <p className="text-center text-[10px] text-muted-foreground tracking-widest uppercase pt-4">
          RELATÓRIO DE ENVIO • {event.code} • GERADO EM {formatBR(new Date(), "dd/MM/yyyy")}
        </p>
      </div>
    </MainLayout>
  );
}