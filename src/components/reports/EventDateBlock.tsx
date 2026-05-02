import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Calendar, Clock, ClipboardList, Activity, Stethoscope, Truck,
  Camera, UserRound, Car, Pill, Package
} from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import type {
  Patient, ChecklistItem, NursingEvolution, MedicalEvolution,
  TransportRecord, Profile
} from '@/types/database';

// Helpers compartilhados ----------------------------------------------------
const stripSignatureMetadata = (text: string | null): string => {
  if (!text) return '';
  return text.replace(/\s*<!--SIG:[\s\S]*?:SIG-->\s*$/g, '').trim();
};
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
const maskCpf = (cpf: string | null): string => {
  if (!cpf) return '---';
  const digits = cpf.replace(/\D/g, '');
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.***-${digits.slice(9, 11)}`;
};

const calcChecklistSummary = (items: ChecklistItem[]) => {
  const vtrItems = items.filter(i => {
    const t = i.item_type as string;
    return t !== 'uti' && t !== 'medications' && t !== 'psicotropicos' && t !== 'materiais' && t !== 'consumo_medicamentos' && t !== 'checklist_confirmed' && t !== 'uti_confirmed';
  });
  const utiItems = items.filter(i => (i.item_type as string) === 'uti');
  const medItems = items.filter(i => (i.item_type as string) === 'medications' || (i.item_type as string) === 'psicotropicos');
  const matItems = items.filter(i => (i.item_type as string) === 'materiais');
  const medConsItems = items.filter(i => (i.item_type as string) === 'consumo_medicamentos');

  const vtrChecked = vtrItems.filter(i => i.is_checked).length;
  const vtrPct = vtrItems.length > 0 ? Math.round((vtrChecked / vtrItems.length) * 100) : 0;

  return { vtrItems, utiItems, medItems, matItems, medConsItems, vtrChecked, vtrPct };
};

interface EventDateBlockProps {
  index: number;
  date: {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    location_override: string | null;
  };
  patients: Patient[];
  checklistItems: ChecklistItem[];
  nursingEvolutions: NursingEvolution[];
  medicalEvolutions: MedicalEvolution[];
  transportRecords: TransportRecord[];
  transportPhotos: Record<string, { name: string; url: string }[]>;
  signerProfiles: Record<string, Profile>;
  baseDeparture: string | null;
  baseArrival: string | null;
}

export function EventDateBlock({
  index, date, patients, checklistItems, nursingEvolutions,
  medicalEvolutions, transportRecords, transportPhotos, signerProfiles,
  baseDeparture, baseArrival,
}: EventDateBlockProps) {
  const cs = calcChecklistSummary(checklistItems);

  return (
    <Card className="rounded-2xl border-2 border-primary/30 overflow-hidden">
      <CardHeader className="bg-primary/5 pb-3">
        <CardTitle className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          Data #{index + 1} — {formatBR(date.date, "dd 'de' MMMM 'de' yyyy")}
        </CardTitle>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mt-2">
          <div>
            <span className="text-muted-foreground font-bold uppercase text-[9px]">Início</span>
            <p className="font-bold">{formatBR(date.start_time, 'HH:mm')}</p>
          </div>
          <div>
            <span className="text-muted-foreground font-bold uppercase text-[9px]">Término</span>
            <p className="font-bold">{formatBR(date.end_time, 'HH:mm')}</p>
          </div>
          <div>
            <span className="text-muted-foreground font-bold uppercase text-[9px]">Saída Base</span>
            <p>{baseDeparture ? formatBR(baseDeparture, 'dd/MM HH:mm') : '---'}</p>
          </div>
          <div>
            <span className="text-muted-foreground font-bold uppercase text-[9px]">Chegada Base</span>
            <p>{baseArrival ? formatBR(baseArrival, 'dd/MM HH:mm') : '---'}</p>
          </div>
          {date.location_override && (
            <div className="col-span-2 sm:col-span-4">
              <span className="text-muted-foreground font-bold uppercase text-[9px]">Local</span>
              <p>{date.location_override}</p>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        {/* Checklist resumo */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <ClipboardList className="h-3 w-3" /> Checklist
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="border rounded-lg p-2 flex items-center justify-between">
              <span className="flex items-center gap-1"><Car className="h-3 w-3" />Viatura</span>
              {cs.vtrItems.length > 0 ? (
                <Badge className={cs.vtrPct === 100 ? 'bg-green-600' : 'bg-amber-500'}>
                  {cs.vtrChecked}/{cs.vtrItems.length} ({cs.vtrPct}%)
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[9px]">—</Badge>
              )}
            </div>
            <div className="border rounded-lg p-2 flex items-center justify-between">
              <span className="flex items-center gap-1"><Truck className="h-3 w-3" />UTI</span>
              <Badge variant={cs.utiItems.length > 0 ? 'default' : 'outline'} className="text-[9px]">
                {cs.utiItems.length > 0 ? '✓' : '—'}
              </Badge>
            </div>
            <div className="border rounded-lg p-2 flex items-center justify-between">
              <span className="flex items-center gap-1"><Pill className="h-3 w-3" />Psicotrópicos</span>
              <Badge variant={cs.medItems.length > 0 ? 'default' : 'outline'} className="text-[9px]">
                {cs.medItems.length > 0 ? '✓' : '—'}
              </Badge>
            </div>
            <div className="border rounded-lg p-2 flex items-center justify-between">
              <span className="flex items-center gap-1"><Package className="h-3 w-3" />Consumo</span>
              <Badge variant={(cs.matItems.length + cs.medConsItems.length) > 0 ? 'default' : 'outline'} className="text-[9px]">
                {cs.matItems.length + cs.medConsItems.length} itens
              </Badge>
            </div>
          </div>
        </div>

        {/* Pacientes */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <UserRound className="h-3 w-3" /> Pacientes ({patients.length})
          </p>
          {patients.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum paciente nesta data.</p>
          ) : (
            <div className="space-y-2">
              {patients.map(p => (
                <div key={p.id} className="border rounded-lg p-2 text-xs">
                  <div className="flex justify-between">
                    <span className="font-bold">{maskName(p.name)}</span>
                    <span className="text-muted-foreground">{p.age ? `${p.age}a` : ''} {p.gender || ''}</span>
                  </div>
                  {p.main_complaint && <p className="text-muted-foreground mt-1">Queixa: {p.main_complaint}</p>}
                  {(p as any).cpf && <p className="text-muted-foreground">CPF: {maskCpf((p as any).cpf)}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Evoluções de enfermagem */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Activity className="h-3 w-3" /> Evoluções de Enfermagem ({nursingEvolutions.length})
          </p>
          {nursingEvolutions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhuma.</p>
          ) : (
            <div className="space-y-2">
              {nursingEvolutions.map(ev => {
                const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
                const patientName = patients.find(p => p.id === ev.patient_id)?.name;
                return (
                  <div key={ev.id} className="border rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span><Clock className="inline h-3 w-3 mr-1" />{formatBR(ev.created_at, 'dd/MM HH:mm')}</span>
                      {patientName && <span>{maskName(patientName)}</span>}
                    </div>
                    <p>
                      PA: {ev.blood_pressure_systolic || '--'}/{ev.blood_pressure_diastolic || '--'} •
                      FC: {ev.heart_rate || '--'} • SpO2: {ev.oxygen_saturation || '--'}% •
                      T: {ev.temperature || '--'}°
                    </p>
                    {ev.observations && <p className="text-muted-foreground">{ev.observations}</p>}
                    <p className="text-[9px] text-muted-foreground border-t pt-1">
                      {signer?.full_name || '---'} {signer?.professional_id ? `(${signer.professional_id})` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Evoluções médicas */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Stethoscope className="h-3 w-3" /> Evoluções Médicas ({medicalEvolutions.length})
          </p>
          {medicalEvolutions.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhuma.</p>
          ) : (
            <div className="space-y-2">
              {medicalEvolutions.map(ev => {
                const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
                const patientName = patients.find(p => p.id === ev.patient_id)?.name;
                return (
                  <div key={ev.id} className="border rounded-lg p-2 text-xs space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span><Clock className="inline h-3 w-3 mr-1" />{formatBR(ev.created_at, 'dd/MM HH:mm')}</span>
                      {patientName && <span>{maskName(patientName)}</span>}
                    </div>
                    {ev.medical_assessment && <p><strong>Avaliação:</strong> {ev.medical_assessment}</p>}
                    {ev.diagnosis && <p><strong>Diagnóstico:</strong> {ev.diagnosis}</p>}
                    {ev.conduct && <p><strong>Conduta:</strong> {ev.conduct}</p>}
                    {ev.prescription && <p><strong>Prescrição:</strong> {ev.prescription}</p>}
                    <p className="text-[9px] text-muted-foreground border-t pt-1">
                      {signer?.full_name || '---'} {signer?.professional_id ? `(${signer.professional_id})` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Transporte */}
        <div>
          <p className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1">
            <Truck className="h-3 w-3" /> Transporte ({transportRecords.length})
          </p>
          {transportRecords.length === 0 ? (
            <p className="text-xs text-muted-foreground italic">Nenhum registro.</p>
          ) : (
            <div className="space-y-2">
              {transportRecords.map(tr => {
                const signer = tr.created_by ? signerProfiles[tr.created_by] : null;
                const distance = (tr.initial_km != null && tr.final_km != null)
                  ? (tr.final_km - tr.initial_km).toFixed(1) : null;
                return (
                  <div key={tr.id} className="border rounded-lg p-2 text-xs space-y-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div><strong>Saída:</strong> {tr.departure_time ? formatBR(tr.departure_time, 'dd/MM HH:mm') : '---'}</div>
                      <div><strong>Chegada:</strong> {tr.arrival_time ? formatBR(tr.arrival_time, 'dd/MM HH:mm') : '---'}</div>
                      <div><strong>KM:</strong> {tr.initial_km ?? '--'} → {tr.final_km ?? '--'}</div>
                      <div><strong>Distância:</strong> {distance ? `${distance} km` : '---'}</div>
                    </div>
                    {transportPhotos[tr.id]?.length > 0 && (
                      <div className="grid grid-cols-4 gap-1 mt-1">
                        {transportPhotos[tr.id].map(photo => (
                          <a key={photo.url} href={photo.url} target="_blank" rel="noopener noreferrer">
                            <img src={photo.url} alt={photo.name} className="w-full aspect-square object-cover rounded border" />
                          </a>
                        ))}
                      </div>
                    )}
                    <p className="text-[9px] text-muted-foreground border-t pt-1">
                      {signer?.full_name || '---'} {tr.signed_at && `• ${formatBR(tr.signed_at, 'dd/MM HH:mm')}`}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
