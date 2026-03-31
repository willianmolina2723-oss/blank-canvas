import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, Loader2, Plus, PenTool, Clock, ShieldCheck, UserRound, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { NursingEvolution, Patient, Profile } from '@/types/database';
import { formatBR } from '@/utils/dateFormat';

export default function NursingEvolutionForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { toast } = useToast();

  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [evolutions, setEvolutions] = useState<NursingEvolution[]>([]);
  const [signerProfiles, setSignerProfiles] = useState<Record<string, Profile>>({});
  const [form, setForm] = useState({
    blood_pressure_systolic: '',
    blood_pressure_diastolic: '',
    heart_rate: '',
    respiratory_rate: '',
    oxygen_saturation: '',
    temperature: '',
    blood_glucose: '',
    observations: '',
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  const [eventRole, setEventRole] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && profile) {
      supabase.from('event_participants').select('role').eq('event_id', eventId).eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setEventRole(data?.role || null));
    }
  }, [eventId, profile]);

  const { canEditNursingEvolution } = usePermissions({ eventRole: eventRole as any });
  const canEdit = canEditNursingEvolution;

  useEffect(() => {
    if (eventId) loadPatients();
  }, [eventId]);

  useEffect(() => {
    if (selectedPatient && !isLoading && canEdit) {
      setTimeout(initCanvas, 200);
    }
  }, [selectedPatient, isLoading, canEdit]);

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('event_id', eventId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setPatients(data as Patient[]);
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
        .from('nursing_evolutions')
        .select('*')
        .eq('event_id', eventId)
        .eq('patient_id', patient.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const evs = (data as NursingEvolution[]) || [];
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
    } catch (err) {
      console.error('Error loading evolutions:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  // --- Signature canvas logic ---
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

  const getPos = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    if ('touches' in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: (e as React.MouseEvent).clientX - rect.left, y: (e as React.MouseEvent).clientY - rect.top };
  };

  const startDraw = (e: React.TouchEvent | React.MouseEvent) => {
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  };

  const endDraw = () => { isDrawingRef.current = false; };
  const clearCanvas = () => { initCanvas(); };

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

  const handleSubmit = async () => {
    if (!selectedPatient) return;
    if (isCanvasBlank()) {
      toast({ title: 'Atenção', description: 'Desenhe sua assinatura antes de registrar.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      const signatureData = canvasRef.current!.toDataURL('image/png');
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from('nursing_evolutions')
        .insert({
          event_id: eventId,
          patient_id: selectedPatient.id,
          blood_pressure_systolic: parseInt(form.blood_pressure_systolic) || null,
          blood_pressure_diastolic: parseInt(form.blood_pressure_diastolic) || null,
          heart_rate: parseInt(form.heart_rate) || null,
          respiratory_rate: parseInt(form.respiratory_rate) || null,
          oxygen_saturation: parseFloat(form.oxygen_saturation) || null,
          temperature: parseFloat(form.temperature) || null,
          blood_glucose: parseInt(form.blood_glucose) || null,
          observations: form.observations || null,
          created_by: profile?.id,
          empresa_id: profile?.empresa_id || null,
          signed_at: now,
          signature_data: signatureData,
        })
        .select()
        .single();

      if (error) throw error;

      // Save to digital_signatures for legal audit
      await supabase.from('digital_signatures').insert({
        event_id: eventId!,
        profile_id: profile!.id,
        signature_type: 'enfermagem' as const,
        signature_data: signatureData,
        professional_id: profile?.professional_id || null,
        user_agent: navigator.userAgent,
        empresa_id: profile?.empresa_id || null,
      });

      // Update local state with signer info
      if (profile) {
        setSignerProfiles(prev => ({ ...prev, [profile.id]: profile as unknown as Profile }));
      }

      setEvolutions([data as NursingEvolution, ...evolutions]);
      setForm({
        blood_pressure_systolic: '', blood_pressure_diastolic: '',
        heart_rate: '', respiratory_rate: '', oxygen_saturation: '',
        temperature: '', blood_glucose: '', observations: '',
      });
      clearCanvas();

      toast({
        title: 'Atendimento registrado',
        description: `Assinado por ${profile?.full_name} em ${formatBR(now, "dd/MM/yyyy 'às' HH:mm")}`,
      });
    } catch (err) {
      console.error('Error saving:', err);
      toast({ title: 'Erro', description: 'Não foi possível registrar.', variant: 'destructive' });
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

  // Patient list view
  if (!selectedPatient) {
    return (
      <MainLayout>
        <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-base font-black tracking-tight uppercase">
              Evolução de Enfermagem
            </h1>
          </div>

          <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
            Selecione um paciente
          </p>

          {patients.length === 0 ? (
            <div className="bg-muted/50 rounded-2xl p-8 text-center space-y-3">
              <UserRound className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Nenhum paciente cadastrado neste evento.</p>
              <Button variant="outline" onClick={() => navigate(`/patient/${eventId}`)}>
                <Plus className="h-4 w-4 mr-2" />
                Cadastrar Paciente
              </Button>
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

  // Patient evolution detail view
  return (
    <MainLayout>
      <div className="max-w-2xl mx-auto space-y-5 animate-fade-in pb-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedPatient(null)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-base font-black tracking-tight uppercase">
              Evolução de Enfermagem
            </h1>
            <p className="text-xs text-muted-foreground">{selectedPatient.name}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* History section */}
            <div>
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-2">
                Histórico do Paciente
              </p>
              {evolutions.length === 0 ? (
                <div className="bg-muted/50 rounded-2xl p-6 text-center">
                  <p className="text-sm text-muted-foreground italic">Nenhum registro encontrado.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {evolutions.map((ev) => {
                    const signer = ev.created_by ? signerProfiles[ev.created_by] : null;
                    return (
                      <div key={ev.id} className="bg-card rounded-2xl border p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatBR(ev.created_at, "dd/MM/yyyy 'às' HH:mm")}
                          </span>
                          {ev.signed_at && (
                            <span className="text-[10px] text-primary font-bold flex items-center gap-1">
                              <PenTool className="h-3 w-3" />
                              Assinado
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                          {[
                            { label: 'PA', value: `${ev.blood_pressure_systolic || '--'}/${ev.blood_pressure_diastolic || '--'}` },
                            { label: 'FR', value: ev.respiratory_rate || '--' },
                            { label: 'SpO2', value: ev.oxygen_saturation ? `${ev.oxygen_saturation}` : '--' },
                            { label: 'TEMP', value: ev.temperature || '--' },
                            { label: 'GLIC', value: ev.blood_glucose || '--' },
                          ].map((v) => (
                            <div key={v.label} className="text-center">
                              <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">{v.label}</p>
                              <p className="text-sm font-bold">{v.value}</p>
                            </div>
                          ))}
                        </div>
                        {ev.observations && (
                          <p className="text-xs text-muted-foreground">{ev.observations}</p>
                        )}
                        {/* Signature info: who signed, date, time */}
                        {ev.signed_at && (
                          <div className="border-t pt-2 space-y-1">
                            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                              <span className="font-semibold">
                                {signer ? signer.full_name : 'Profissional'}
                                {signer?.professional_id ? ` (${signer.professional_id})` : ''}
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

            {/* Register form */}
            {canEdit && (
              <div className="bg-card rounded-2xl border shadow-sm p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-tight flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Registrar Missão
                  </h2>
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">
                    Protocolo Seguro
                  </span>
                </div>

                {/* Vitals grid */}
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {[
                    { key: 'blood_pressure_systolic', label: 'PA', placeholder: '12/8', isBP: true },
                    { key: 'respiratory_rate', label: 'FR', placeholder: '16' },
                    { key: 'oxygen_saturation', label: 'SPO2', placeholder: '98' },
                    { key: 'temperature', label: 'TEMP', placeholder: '36' },
                    { key: 'blood_glucose', label: 'GLIC', placeholder: '100' },
                  ].map((vital) => (
                    <div key={vital.key} className="text-center">
                      <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">
                        {vital.label}
                      </p>
                      {vital.isBP ? (
                        <div className="flex items-center gap-0.5">
                          <Input
                            type="number"
                            value={form.blood_pressure_systolic}
                            onChange={(e) => handleChange('blood_pressure_systolic', e.target.value)}
                            placeholder="12"
                            className="h-8 text-center text-xs font-bold px-1 rounded-lg"
                          />
                          <span className="text-xs font-bold">/</span>
                          <Input
                            type="number"
                            value={form.blood_pressure_diastolic}
                            onChange={(e) => handleChange('blood_pressure_diastolic', e.target.value)}
                            placeholder="8"
                            className="h-8 text-center text-xs font-bold px-1 rounded-lg"
                          />
                        </div>
                      ) : (
                        <Input
                          type="number"
                          value={form[vital.key as keyof typeof form]}
                          onChange={(e) => handleChange(vital.key, e.target.value)}
                          placeholder={vital.placeholder}
                          className="h-8 text-center text-xs font-bold px-1 rounded-lg"
                        />
                      )}
                    </div>
                  ))}
                </div>

                {/* Clinical description */}
                <div className="space-y-1">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                    Descrição Clínica da Evolução
                  </p>
                  <Textarea
                    value={form.observations}
                    onChange={(e) => handleChange('observations', e.target.value)}
                    placeholder="Descreva detalhadamente o quadro e intervenções..."
                    rows={4}
                    className="rounded-xl resize-none"
                  />
                </div>

                {/* Signature area */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" />
                      Assinatura Digital do Autor
                    </p>
                    <button
                      onClick={clearCanvas}
                      className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground font-bold"
                    >
                      Limpar Traço
                    </button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    className="w-full h-32 border rounded-xl cursor-crosshair touch-none bg-white"
                    onMouseDown={startDraw}
                    onMouseMove={draw}
                    onMouseUp={endDraw}
                    onMouseLeave={endDraw}
                    onTouchStart={startDraw}
                    onTouchMove={draw}
                    onTouchEnd={endDraw}
                  />
                </div>

                {/* Submit */}
                <Button
                  onClick={handleSubmit}
                  disabled={isSaving}
                  className="w-full rounded-2xl py-6 text-sm font-black uppercase tracking-widest"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <PenTool className="h-4 w-4 mr-2" />
                  )}
                  Assinar e Registrar Atendimento
                </Button>
              </div>
            )}

            {!canEdit && (
              <div className="bg-muted/50 rounded-2xl p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Apenas enfermeiros, técnicos e médicos podem registrar evoluções.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </MainLayout>
  );
}
