import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Stethoscope, Save, Loader2, Plus, AlertTriangle, Clock, PenTool, ShieldCheck, UserRound, ChevronRight, Search, Pill, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { MedicalEvolution, Patient, Profile } from '@/types/database';
import { formatBR } from '@/utils/dateFormat';

interface CostItemMed {
  id: string;
  name: string;
  unit: string;
}

export default function MedicalEvolutionForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { toast } = useToast();
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<MedicalEvolution[]>([]);
  const [signerProfiles, setSignerProfiles] = useState<Record<string, Profile>>({});
  const [currentEvolution, setCurrentEvolution] = useState<Partial<MedicalEvolution>>({
    medical_assessment: '',
    diagnosis: '',
    conduct: '',
    prescription: '',
    observations: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCreatingNew, setIsCreatingNew] = useState(false);

  // Medication catalog for prescription
  const [medicationCatalog, setMedicationCatalog] = useState<CostItemMed[]>([]);
  const [medSearch, setMedSearch] = useState('');
  const [selectedMeds, setSelectedMeds] = useState<string[]>([]);

  // Signature canvas
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  const [eventRole, setEventRole] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && profile) {
      supabase.from('event_participants').select('role').eq('event_id', eventId).eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setEventRole(data?.role || null));
    }
  }, [eventId, profile]);

  const { canEditMedicalEvolution } = usePermissions({ eventRole: eventRole as any });
  const canEdit = canEditMedicalEvolution;

  useEffect(() => {
    if (eventId) {
      loadPatients();
      loadMedicationCatalog();
    }
  }, [eventId]);

  const loadMedicationCatalog = async () => {
    try {
      const { data, error } = await supabase
        .from('cost_items')
        .select('id, name, unit')
        .eq('category', 'medicamento')
        .eq('is_active', true)
        .order('name');
      if (!error && data) {
        setMedicationCatalog(data as CostItemMed[]);
      }
    } catch (err) {
      console.error('Error loading medication catalog:', err);
    }
  };

  // Init canvas when form opens
  useEffect(() => {
    if (isCreatingNew && canEdit) {
      setTimeout(initCanvas, 200);
    }
  }, [isCreatingNew, canEdit]);

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setPatients((data || []) as Patient[]);
    } catch (err) {
      console.error('Error loading patients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const selectPatient = async (patient: Patient) => {
    setSelectedPatient(patient);
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('medical_evolutions')
        .select('*')
        .eq('event_id', eventId)
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const evs = (data as MedicalEvolution[]) || [];
      setEvolutions(evs);

      // Load signer profiles
      const creatorIds = [...new Set(evs.map(e => e.created_by).filter(Boolean))] as string[];
      if (creatorIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', creatorIds);
        if (profiles) {
          const map: Record<string, Profile> = {};
          profiles.forEach((p: any) => { map[p.id] = p as Profile; });
          setSignerProfiles(map);
        }
      }

      if (evs.length === 0) {
        setIsCreatingNew(true);
      } else {
        setIsCreatingNew(false);
      }
    } catch (err) {
      console.error('Error loading evolutions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof MedicalEvolution, value: string) => {
    setCurrentEvolution(prev => ({ ...prev, [field]: value }));
  };

  // ─── Signature canvas logic ───
  const initCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#1a1a2e';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
  }, []);

  const getPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const stopDraw = () => { isDrawingRef.current = false; };
  const clearCanvas = () => initCanvas();

  const isCanvasBlank = () => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const blank = document.createElement('canvas');
    blank.width = canvas.width;
    blank.height = canvas.height;
    const ctx = blank.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, blank.width, blank.height);
    return canvas.toDataURL() === blank.toDataURL();
  };

  const saveEvolution = async () => {
    if (!selectedPatient) return;

    if (!currentEvolution.medical_assessment?.trim() && !currentEvolution.diagnosis?.trim()) {
      toast({
        title: 'Erro',
        description: 'Preencha ao menos a avaliação ou diagnóstico.',
        variant: 'destructive',
      });
      return;
    }

    if (isCanvasBlank()) {
      toast({
        title: 'Assinatura obrigatória',
        description: 'Desenhe sua assinatura antes de salvar a evolução.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    try {
      const signatureData = canvasRef.current!.toDataURL('image/png');
      const signedAt = new Date().toISOString();

      const { data, error } = await supabase
        .from('medical_evolutions')
        .insert({
          ...currentEvolution,
          event_id: eventId,
          patient_id: selectedPatient.id,
          created_by: profile?.id,
          empresa_id: profile?.empresa_id || null,
          signed_at: signedAt,
          signature_data: signatureData,
        })
        .select()
        .single();

      if (error) throw error;

      // Save to digital_signatures for legal audit
      if (profile) {
        await supabase.from('digital_signatures').insert({
          event_id: eventId!,
          profile_id: profile.id,
          signature_type: 'medica' as const,
          signature_data: signatureData,
          professional_id: profile.professional_id || null,
          signed_at: signedAt,
          ip_address: null,
          user_agent: navigator.userAgent,
          empresa_id: profile?.empresa_id || null,
        });

        setSignerProfiles(prev => ({ ...prev, [profile.id]: profile as unknown as Profile }));
      }

      setEvolutions([data as MedicalEvolution, ...evolutions]);
      setCurrentEvolution({
        medical_assessment: '',
        diagnosis: '',
        conduct: '',
        prescription: '',
        observations: '',
      });
      setSelectedMeds([]);
      setMedSearch('');
      setIsCreatingNew(false);
      clearCanvas();

      toast({
        title: 'Evolução registrada e assinada',
        description: `Assinado por ${profile?.full_name} em ${formatBR(signedAt, "dd/MM/yyyy 'às' HH:mm")}`,
      });
    } catch (err) {
      console.error('Error saving evolution:', err);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar a evolução.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading && !selectedPatient) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  // ─── Patient list view ───
  if (!selectedPatient) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-base font-black tracking-tight uppercase flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-primary" />
                Evolução Médica
              </h1>
              <p className="text-xs text-muted-foreground">Selecione um paciente</p>
            </div>
          </div>

          {patients.length === 0 ? (
            <div className="bg-muted/50 rounded-2xl p-8 text-center space-y-3">
              <UserRound className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhum paciente cadastrado neste evento.</p>
              {canEdit && (
                <Button variant="outline" onClick={() => navigate(`/patient/${eventId}`)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Cadastrar Paciente
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {patients.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPatient(p)}
                  className="w-full bg-card rounded-2xl border p-4 flex items-center justify-between hover:shadow-md transition-shadow text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <UserRound className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold text-sm">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.age ? `${p.age} anos` : ''}{p.gender ? ` • ${p.gender}` : ''}
                        {p.main_complaint ? ` • ${p.main_complaint}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              ))}
            </div>
          )}
        </div>
      </MainLayout>
    );
  }

  // ─── Patient evolution detail view ───
  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => { setSelectedPatient(null); setIsCreatingNew(false); }}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-black tracking-tight uppercase flex items-center gap-2">
              <Stethoscope className="h-5 w-5 text-primary" />
              Evolução Médica
            </h1>
            <p className="text-xs text-muted-foreground">{selectedPatient.name}</p>
          </div>
          {canEdit && !isCreatingNew && (
            <Button size="sm" onClick={() => setIsCreatingNew(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Evolução
            </Button>
          )}
        </div>

        {!canEdit && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-3">
              <p className="text-sm text-center flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Apenas médicos podem registrar evoluções médicas.
              </p>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Evolution History */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                Histórico do Paciente
              </p>
              {evolutions.length === 0 && !isCreatingNew ? (
                <div className="bg-muted/50 rounded-2xl p-6 text-center space-y-3">
                  <Stethoscope className="h-10 w-10 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground italic">Nenhuma evolução registrada.</p>
                  {canEdit && (
                    <Button onClick={() => setIsCreatingNew(true)}>
                      <Plus className="h-4 w-4 mr-2" />
                      Nova Evolução
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {evolutions.map((ev) => {
                    const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
                    return (
                      <div key={ev.id} className={`bg-card rounded-2xl border p-4 space-y-3 ${ev.signed_at ? 'border-emerald-500/30' : ''}`}>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatBR(ev.created_at, "dd/MM/yyyy 'às' HH:mm")}
                          </span>
                          {ev.signed_at && (
                            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                              <PenTool className="h-3 w-3" />
                              Assinado
                            </span>
                          )}
                        </div>

                        {ev.medical_assessment && (
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Avaliação</span>
                            <p className="text-sm">{ev.medical_assessment}</p>
                          </div>
                        )}
                        {ev.diagnosis && (
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Diagnóstico</span>
                            <p className="text-sm">{ev.diagnosis}</p>
                          </div>
                        )}
                        {ev.conduct && (
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Conduta</span>
                            <p className="text-sm">{ev.conduct}</p>
                          </div>
                        )}
                        {ev.prescription && (
                          <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Prescrição</span>
                            <p className="text-sm">{ev.prescription}</p>
                          </div>
                        )}

                        {/* Signature display */}
                        {ev.signed_at && (
                          <div className="border-t pt-2 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="font-semibold">
                                {signer ? signer.full_name : 'Profissional'}
                                {signer?.professional_id ? ` (CRM: ${signer.professional_id})` : ''}
                              </span>
                              <span>
                                {formatBR(ev.signed_at, "dd/MM/yyyy 'às' HH:mm:ss")}
                              </span>
                            </div>
                            {ev.signature_data && (
                              <img src={ev.signature_data} alt="Assinatura" className="h-12 rounded bg-white" />
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* New Evolution Form */}
            {isCreatingNew && canEdit && (
              <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Nova Evolução
                  </h2>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Protocolo Seguro
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="assessment">Avaliação</Label>
                    <Textarea
                      id="assessment"
                      value={currentEvolution.medical_assessment || ''}
                      onChange={(e) => handleChange('medical_assessment', e.target.value)}
                      placeholder="Descreva a avaliação médica do paciente..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="diagnosis">Diagnóstico</Label>
                    <Textarea
                      id="diagnosis"
                      value={currentEvolution.diagnosis || ''}
                      onChange={(e) => handleChange('diagnosis', e.target.value)}
                      placeholder="Hipótese diagnóstica ou diagnóstico definitivo..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="conduct">Conduta</Label>
                    <Textarea
                      id="conduct"
                      value={currentEvolution.conduct || ''}
                      onChange={(e) => handleChange('conduct', e.target.value)}
                      placeholder="Descreva a conduta terapêutica..."
                      rows={3}
                    />
                  </div>

                  <div className="space-y-3">
                    <Label htmlFor="prescription">Prescrição</Label>

                    {/* Medication catalog selector */}
                    {medicationCatalog.length > 0 && (
                      <div className="space-y-2">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar medicamento cadastrado..."
                            value={medSearch}
                            onChange={(e) => setMedSearch(e.target.value)}
                            className="pl-9 h-9 text-sm"
                          />
                        </div>

                        {medSearch.trim().length > 0 && (
                          <div className="max-h-36 overflow-y-auto rounded-lg border bg-popover">
                            {medicationCatalog
                              .filter(m =>
                                m.name.toLowerCase().includes(medSearch.toLowerCase()) &&
                                !selectedMeds.includes(m.name)
                              )
                              .map((med) => (
                                <button
                                  key={med.id}
                                  type="button"
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors flex items-center gap-2"
                                  onClick={() => {
                                    setSelectedMeds(prev => [...prev, med.name]);
                                    const current = currentEvolution.prescription || '';
                                    const separator = current.trim() ? '\n' : '';
                                    handleChange('prescription', current + separator + `• ${med.name}`);
                                    setMedSearch('');
                                  }}
                                >
                                  <Pill className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                                  {med.name}
                                  <span className="text-xs text-muted-foreground ml-auto">{med.unit}</span>
                                </button>
                              ))}
                            {medicationCatalog.filter(m =>
                              m.name.toLowerCase().includes(medSearch.toLowerCase()) &&
                              !selectedMeds.includes(m.name)
                            ).length === 0 && (
                              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum medicamento encontrado</p>
                            )}
                          </div>
                        )}

                        {selectedMeds.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {selectedMeds.map((name) => (
                              <Badge key={name} variant="secondary" className="text-xs gap-1">
                                <Pill className="h-3 w-3" />
                                {name}
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedMeds(prev => prev.filter(n => n !== name));
                                    const lines = (currentEvolution.prescription || '').split('\n');
                                    const filtered = lines.filter(l => !l.includes(name));
                                    handleChange('prescription', filtered.join('\n'));
                                  }}
                                  className="ml-0.5 hover:text-destructive"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <Textarea
                      id="prescription"
                      value={currentEvolution.prescription || ''}
                      onChange={(e) => handleChange('prescription', e.target.value)}
                      placeholder="Prescrição médica (digite livremente ou selecione medicamentos acima)..."
                      rows={4}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="observations">Observações</Label>
                    <Textarea
                      id="observations"
                      value={currentEvolution.observations || ''}
                      onChange={(e) => handleChange('observations', e.target.value)}
                      placeholder="Observações adicionais..."
                      rows={2}
                    />
                  </div>
                </div>

                {/* Signature section */}
                <div className="space-y-3 pt-2 border-t">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <PenTool className="h-4 w-4" />
                    Assinatura Digital
                  </h3>

                  <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                    <p><strong>Profissional:</strong> {profile?.full_name}</p>
                    <p><strong>CRM:</strong> {profile?.professional_id || 'Não informado'}</p>
                  </div>

                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Ao salvar, você confirma a veracidade das informações, em conformidade com a LGPD e a Lei 14.063/2020.
                  </p>

                  <div className="border-2 border-dashed rounded-lg overflow-hidden">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-40 cursor-crosshair touch-none"
                      onMouseDown={startDraw}
                      onMouseMove={draw}
                      onMouseUp={stopDraw}
                      onMouseLeave={stopDraw}
                      onTouchStart={startDraw}
                      onTouchMove={draw}
                      onTouchEnd={stopDraw}
                    />
                  </div>

                  <Button variant="ghost" size="sm" onClick={clearCanvas} className="w-full">
                    Limpar assinatura
                  </Button>
                </div>

                {/* Actions */}
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setIsCreatingNew(false)} className="flex-1">
                    Cancelar
                  </Button>
                  <Button onClick={saveEvolution} disabled={isSaving} className="flex-1">
                    {isSaving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Salvar e Assinar
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
