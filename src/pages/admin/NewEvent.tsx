import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Plus, Loader2, Ambulance, MapPin, FileText, Users, Clock, Building2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { useAuth } from '@/contexts/AuthContext';
import type { Ambulance as AmbulanceType, Profile, AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { RoleScheduleEditor, buildDefaultRoleSchedules, type RoleScheduleEntry } from '@/components/events/RoleScheduleEditor';
import { EventDatesEditor, blankEventDate, buildEventDateTimestamps, type EventDateEntry } from '@/components/events/EventDatesEditor';
import { recomputeAllAssignmentsForEvent } from '@/utils/computePaidHours';

interface ParticipantSelection {
  profile: Profile;
  role: AppRole;
  selected: boolean;
}

interface Contractor {
  id: string;
  name: string;
  cnpj: string | null;
  phone: string | null;
  email: string | null;
}

export default function NewEventPage() {
  const navigate = useNavigate();
  const { profile, isReadOnly } = useAuth();
  const { toast } = useToast();

  const [code, setCode] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAmbulance, setSelectedAmbulance] = useState<string>('');
  const [eventDates, setEventDates] = useState<EventDateEntry[]>([blankEventDate()]);
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [participants, setParticipants] = useState<ParticipantSelection[]>([]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [selectedContractor, setSelectedContractor] = useState<string>('');
  const [contractorResponsible, setContractorResponsible] = useState('');
  const [contractorPhone, setContractorPhone] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [cobrarMateriaisMedicamentos, setCobrarMateriaisMedicamentos] = useState(false);
  const [roleSchedules, setRoleSchedules] = useState<Record<AppRole, RoleScheduleEntry>>({} as any);

  useEffect(() => {
    if (!isReadOnly) {
      loadData();
      generateEventCode();
    }
  }, [isReadOnly]);

  // Auto-fill responsible/phone when contractor changes
  useEffect(() => {
    if (selectedContractor) {
      const c = contractors.find(ct => ct.id === selectedContractor);
      if (c) {
        if (!contractorResponsible) setContractorResponsible(c.name);
        if (!contractorPhone && c.phone) setContractorPhone(c.phone);
      }
    }
  }, [selectedContractor]);

  // Sync role schedules with selected participants
  useEffect(() => {
    const sel = participants.filter(p => p.selected);
    const rolesInUse = Array.from(new Set(sel.map(p => p.role))) as AppRole[];
    const counts: Partial<Record<AppRole, number>> = {};
    for (const p of sel) counts[p.role] = (counts[p.role] ?? 0) + 1;
    setRoleSchedules(prev => buildDefaultRoleSchedules(prev, rolesInUse, counts));
  }, [participants]);

  // Redirect if read-only (after all hooks)
  if (isReadOnly) {
    return (
      <MainLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
          <h1 className="text-xl font-bold mb-2">Modo Somente Leitura</h1>
          <p className="text-muted-foreground mb-4">
            A assinatura da sua empresa está suspensa ou cancelada. Regularize para criar novos eventos.
          </p>
          <Button onClick={() => navigate('/dashboard')} variant="outline">Voltar ao Dashboard</Button>
        </div>
      </MainLayout>
    );
  }

  const generateEventCode = () => {
    const now = new Date();
    const year = now.getFullYear().toString().slice(-2);
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    setCode(`EVT-${year}${month}${day}-${random}`);
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [ambRes, profRes, rolesRes, contRes] = await Promise.all([
        supabase.from('ambulances').select('*').in('status', ['ativa', 'disponivel', 'ocupada']).order('code'),
        supabase.from('profiles').select('*').order('full_name'),
        supabase.from('user_roles').select('*'),
        supabase.from('contractors').select('*').eq('is_active', true).order('name'),
      ]);

      if (ambRes.error) throw ambRes.error;
      if (profRes.error) throw profRes.error;
      if (rolesRes.error) throw rolesRes.error;
      if (contRes.error) throw contRes.error;

      setAmbulances(ambRes.data as AmbulanceType[]);
      setContractors(contRes.data as Contractor[]);
      setProfiles(profRes.data as Profile[]);

      const participantsList: ParticipantSelection[] = [];
      (profRes.data || []).forEach((p: Profile) => {
        const userRoles = (rolesRes.data || [])
          .filter(r => r.user_id === p.user_id)
          .map(r => r.role as AppRole);
        userRoles
          .filter(role => role !== 'admin')
          .forEach(role => {
            participantsList.push({ profile: p, role, selected: false });
          });
      });
      setParticipants(participantsList);
    } catch (err) {
      console.error('Error loading data:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível carregar os dados.'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const toggleParticipant = (index: number) => {
    setParticipants(prev => prev.map((p, i) => i === index ? { ...p, selected: !p.selected } : p));
  };

  const createEvent = async () => {
    const errors: string[] = [];
    if (!code.trim()) errors.push('Código do evento');
    if (!selectedAmbulance) errors.push('Viatura');
    if (eventDates.length === 0) errors.push('Pelo menos uma data');
    eventDates.forEach((d, i) => {
      if (!d.date || !d.start_time || !d.end_time) {
        errors.push(`Data/hora da Data ${i + 1}`);
      }
    });
    if (!location.trim()) errors.push('Localização');
    if (!description.trim()) errors.push('Descrição');
    if (!selectedContractor) errors.push('Contratante');
    if (!contractorResponsible.trim()) errors.push('Responsável do contratante');
    if (!contractorPhone.trim()) errors.push('Telefone do responsável');
    if (!participants.some(p => p.selected)) errors.push('Pelo menos um participante');

    if (errors.length > 0) {
      toast({ title: 'Campos obrigatórios', description: `Preencha: ${errors.join(', ')}`, variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      // Ordena datas e calcula cache departure/arrival (primeira/última)
      const sortedDates = [...eventDates].sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
      const firstTs = buildEventDateTimestamps(sortedDates[0]);
      const lastTs = buildEventDateTimestamps(sortedDates[sortedDates.length - 1]);

      const insertData: Record<string, unknown> = {
          code: code.trim(),
          location: location.trim() || null,
          description: description.trim() || null,
          ambulance_id: selectedAmbulance || null,
          departure_time: firstTs?.start || null,
          arrival_time: lastTs?.end || null,
          contractor_id: selectedContractor || null,
          contractor_responsible: contractorResponsible.trim() || null,
          contractor_phone: contractorPhone.trim() || null,
          created_by: profile?.id,
          empresa_id: profile?.empresa_id || null,
          status: 'ativo',
          cobrar_materiais_medicamentos: cobrarMateriaisMedicamentos,
        };

      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .insert(insertData as any)
        .select()
        .single();

      if (eventError) throw eventError;

      // Insere event_dates
      const dateRows = sortedDates.map((d, idx) => {
        const ts = buildEventDateTimestamps(d)!;
        return {
          event_id: eventData.id,
          empresa_id: profile?.empresa_id || null,
          ordem: idx + 1,
          date: d.date,
          start_time: ts.start,
          end_time: ts.end,
          location_override: d.location_override?.trim() || null,
          notes: d.notes?.trim() || null,
          status: 'ativo',
        };
      });
      const { error: datesErr } = await (supabase as any).from('event_dates').insert(dateRows);
      if (datesErr) throw datesErr;

      const selectedParticipants = participants.filter(p => p.selected);
      if (selectedParticipants.length > 0) {
        const { error: participantsError } = await supabase
          .from('event_participants')
          .insert(selectedParticipants.map(p => ({
            event_id: eventData.id,
            profile_id: p.profile.id,
            role: p.role,
          })));
        if (participantsError) throw participantsError;
      }

      // Persist event_role_schedules
      const rolesInUse = Array.from(new Set(selectedParticipants.map(p => p.role)));
      const scheduleRows = rolesInUse.map(role => {
        const entry = roleSchedules[role];
        const useDefault = entry?.use_event_default ?? true;
        const qty = selectedParticipants.filter(p => p.role === role).length;
        return {
          event_id: eventData.id,
          role,
          quantity: qty,
          use_event_default: useDefault,
          start_time: useDefault ? null : (entry?.start_time || null),
          end_time: useDefault ? null : (entry?.end_time || null),
          empresa_id: profile?.empresa_id || null,
        };
      });
      if (scheduleRows.length > 0) {
        const { error: schedErr } = await (supabase as any).from('event_role_schedules').insert(scheduleRows);
        if (schedErr) console.error('event_role_schedules insert error:', schedErr);
      }

      // Recompute assignments
      try { await recomputeAllAssignmentsForEvent(eventData.id); } catch (e) { console.error(e); }

      toast({ title: 'Evento criado', description: `O evento ${code} foi criado com sucesso.` });
      navigate('/');
    } catch (err: any) {
      console.error('Error creating event:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível criar o evento.'), variant: 'destructive' });
    } finally {
      setIsSaving(false);
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

  const groupedParticipants = {
    condutor: participants.filter(p => p.role === 'condutor'),
    enfermeiro: participants.filter(p => p.role === 'enfermeiro'),
    tecnico: participants.filter(p => p.role === 'tecnico'),
    medico: participants.filter(p => p.role === 'medico'),
  };

  const selectedParticipantsList = participants.filter(p => p.selected);
  const rolesInUse = Array.from(new Set(selectedParticipantsList.map(p => p.role))) as AppRole[];
  const roleCounts: Partial<Record<AppRole, number>> = {};
  for (const p of selectedParticipantsList) roleCounts[p.role] = (roleCounts[p.role] ?? 0) + 1;

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground">Novo Evento</h1>
            <p className="text-muted-foreground">Crie um novo evento de atendimento</p>
          </div>
          <Button onClick={createEvent} disabled={isSaving}>
            {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
            Criar Evento
          </Button>
        </div>

        <Tabs defaultValue="dados" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="dados" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Dados
            </TabsTrigger>
            <TabsTrigger value="contratante" className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Contratante
            </TabsTrigger>
            <TabsTrigger value="equipe" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Equipe
            </TabsTrigger>
          </TabsList>

          {/* Tab: Dados do Evento */}
          <TabsContent value="dados">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Dados do Evento
                </CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="code">Código do Evento <span className="text-destructive">*</span></Label>
                  <Input id="code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EVT-XXXXXX-XXX" className="h-12" required />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ambulance">Viatura <span className="text-destructive">*</span></Label>
                  <Select value={selectedAmbulance} onValueChange={setSelectedAmbulance}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione uma viatura..." />
                    </SelectTrigger>
                    <SelectContent>
                      {ambulances.map((amb) => (
                        <SelectItem key={amb.id} value={amb.id}>
                          <div className="flex items-center gap-2">
                            <Ambulance className="h-4 w-4" />
                            <span>{amb.code}</span>
                            {amb.plate && <span className="text-muted-foreground">({amb.plate})</span>}
                            {amb.status === 'ocupada' && <Badge variant="secondary" className="ml-1 text-xs">Ocupada</Badge>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Datas do evento agora ficam em um card abaixo deste (EventDatesEditor) */}

                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="location">Localização <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Endereço ou local da ocorrência" className="h-12 pl-10" />
                  </div>
                </div>

                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="description">Descrição <span className="text-destructive">*</span></Label>
                  <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva brevemente a ocorrência..." rows={3} />
                </div>

                <div className="md:col-span-2 flex items-center gap-3 p-4 rounded-lg border bg-muted/30">
                  <Checkbox
                    id="cobrar-materiais"
                    checked={cobrarMateriaisMedicamentos}
                    onCheckedChange={(checked) => setCobrarMateriaisMedicamentos(checked === true)}
                  />
                  <div className="space-y-0.5">
                    <Label htmlFor="cobrar-materiais" className="cursor-pointer font-medium">
                      Cobrar materiais e medicamentos
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Se ativado, os materiais e medicamentos utilizados serão adicionados ao custo do evento e cobrados do contratante.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Contratante */}
          <TabsContent value="contratante">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  Contratante
                </CardTitle>
                <CardDescription>
                  Selecione o contratante e informe o responsável pelo evento
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="contractor">Contratante <span className="text-destructive">*</span></Label>
                  <Select value={selectedContractor} onValueChange={setSelectedContractor}>
                    <SelectTrigger className="h-12">
                      <SelectValue placeholder="Selecione um contratante..." />
                    </SelectTrigger>
                    <SelectContent>
                      {contractors.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4" />
                            <span>{c.name}</span>
                            {c.cnpj && <span className="text-muted-foreground">({c.cnpj})</span>}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="responsible">Responsável <span className="text-destructive">*</span></Label>
                  <Input
                    id="responsible"
                    value={contractorResponsible}
                    onChange={(e) => setContractorResponsible(e.target.value)}
                    placeholder="Nome do responsável"
                    className="h-12"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="contractor-phone">Telefone do Responsável <span className="text-destructive">*</span></Label>
                  <Input
                    id="contractor-phone"
                    value={contractorPhone}
                    onChange={(e) => setContractorPhone(e.target.value)}
                    placeholder="(00) 00000-0000"
                    className="h-12"
                  />
                </div>

                {selectedContractor && (
                  <div className="md:col-span-2 p-4 rounded-lg bg-muted/50 border">
                    {(() => {
                      const c = contractors.find(ct => ct.id === selectedContractor);
                      if (!c) return null;
                      return (
                        <div className="space-y-1 text-sm">
                          <p className="font-medium text-foreground">{c.name}</p>
                          {c.cnpj && <p className="text-muted-foreground">CNPJ: {c.cnpj}</p>}
                          {c.email && <p className="text-muted-foreground">Email: {c.email}</p>}
                          {c.phone && <p className="text-muted-foreground">Tel: {c.phone}</p>}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab: Equipe */}
          <TabsContent value="equipe">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Equipe do Atendimento
                </CardTitle>
                <CardDescription>
                  Selecione os profissionais que participarão deste evento
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {Object.entries(groupedParticipants).map(([role, roleParticipants]) => (
                  roleParticipants.length > 0 && (
                    <div key={role} className="space-y-3">
                      <h4 className="font-medium text-sm text-muted-foreground uppercase">
                        {ROLE_LABELS[role as AppRole]}
                      </h4>
                      <div className="grid gap-2 md:grid-cols-2">
                        {roleParticipants.map((participant) => {
                          const globalIndex = participants.findIndex(
                            p => p.profile.id === participant.profile.id && p.role === participant.role
                          );
                          return (
                            <div
                              key={`${participant.profile.id}-${participant.role}`}
                              className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                                participant.selected ? 'bg-primary/10 border-primary/30' : 'hover:bg-muted'
                              }`}
                              onClick={() => toggleParticipant(globalIndex)}
                            >
                              <Checkbox checked={participant.selected} onCheckedChange={() => toggleParticipant(globalIndex)} />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{participant.profile.full_name}</p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {participant.profile.email || participant.profile.professional_id || '-'}
                                </p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )
                ))}

                {participants.length === 0 && (
                  <p className="text-center text-muted-foreground py-4">
                    Nenhum profissional disponível. Cadastre usuários e atribua funções primeiro.
                  </p>
                )}

                {participants.filter(p => p.selected).length > 0 && (
                  <div className="pt-4 border-t">
                    <p className="text-sm text-muted-foreground mb-2">Equipe selecionada:</p>
                    <div className="flex flex-wrap gap-2">
                      {participants.filter(p => p.selected).map((p) => (
                        <Badge key={`${p.profile.id}-${p.role}`} variant="secondary">
                          {p.profile.full_name} ({ROLE_LABELS[p.role]})
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="mt-6">
              <RoleScheduleEditor
                rolesInUse={rolesInUse}
                value={roleSchedules}
                onChange={setRoleSchedules}
                eventDefaultStart={departureTime}
                eventDefaultEnd={arrivalTime}
              />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
