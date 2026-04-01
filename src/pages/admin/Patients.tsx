import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import { useAuth } from '@/contexts/AuthContext';
import {
  ArrowLeft, Search, FileDown, Loader2, UserRound, Calendar,
  ChevronDown, Activity, Stethoscope, AlertCircle, PenTool, Plus, ShieldCheck
} from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import type { Patient, Event, NursingEvolution, MedicalEvolution, DigitalSignature } from '@/types/database';
import { exportPatientPDF } from '@/utils/exportPatientPDF';

interface PatientWithEvent extends Patient {
  event?: Event;
}

// ── Create Patient Dialog ────────────────────────────────
function CreatePatientDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    age: '',
    gender: '',
    birth_date: '',
    cpf: '',
    main_complaint: '',
    allergies: '',
    current_medications: '',
    brief_history: '',
  });

  const resetForm = () =>
    setForm({ name: '', age: '', gender: '', birth_date: '', cpf: '', main_complaint: '', allergies: '', current_medications: '', brief_history: '' });

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Nome é obrigatório', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from('patients').insert({
        name: form.name.trim(),
        age: form.age ? parseInt(form.age) : null,
        gender: form.gender || null,
        birth_date: form.birth_date || null,
        cpf: form.cpf || null,
        main_complaint: form.main_complaint || null,
        allergies: form.allergies || null,
        current_medications: form.current_medications || null,
        brief_history: form.brief_history || null,
        created_by: profile?.id || null,
        empresa_id: profile?.empresa_id || null,
        event_id: null as any, // admin-created, no event
      } as any);
      if (error) throw error;
      toast({ title: 'Ficha criada com sucesso!' });
      resetForm();
      onOpenChange(false);
      onCreated();
    } catch (err: any) {
      console.error('Error creating patient:', err);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível criar a ficha.'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Nova Ficha (Administrador)
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nome do paciente *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome completo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Idade</Label>
              <Input type="number" value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="Ex: 35" />
            </div>
            <div className="space-y-2">
              <Label>Sexo</Label>
              <Select value={form.gender} onValueChange={(v) => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Data de nascimento</Label>
            <Input type="date" value={form.birth_date} onChange={(e) => setForm({ ...form, birth_date: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>CPF</Label>
            <Input value={form.cpf} onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, '').slice(0, 11);
              const formatted = digits
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d)/, '$1.$2')
                .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
              setForm({ ...form, cpf: formatted });
            }} placeholder="000.000.000-00" maxLength={14} />
          </div>
          <div className="space-y-2">
            <Label>Queixa principal</Label>
            <Textarea value={form.main_complaint} onChange={(e) => setForm({ ...form, main_complaint: e.target.value })} placeholder="Descreva a queixa principal" rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Alergias</Label>
            <Input value={form.allergies} onChange={(e) => setForm({ ...form, allergies: e.target.value })} placeholder="Alergias conhecidas" />
          </div>
          <div className="space-y-2">
            <Label>Medicações em uso</Label>
            <Input value={form.current_medications} onChange={(e) => setForm({ ...form, current_medications: e.target.value })} placeholder="Medicações atuais" />
          </div>
          <div className="space-y-2">
            <Label>Histórico clínico</Label>
            <Textarea value={form.brief_history} onChange={(e) => setForm({ ...form, brief_history: e.target.value })} placeholder="Histórico clínico resumido" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
            Criar Ficha
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Patient Evolutions Panel ─────────────────────────────
function PatientEvolutions({ patient, evolutions, loading }: {
  patient: PatientWithEvent;
  evolutions: { nursing: NursingEvolution[]; medical: MedicalEvolution[]; signatures: (DigitalSignature & { profile?: { full_name: string; professional_id: string | null } })[] } | undefined;
  loading: boolean;
}) {
  const stripSignatureMetadata = (text: string | null): string => {
    if (!text) return '';
    return text.replace(/\n<!--SIG:.*?:SIG-->$/s, '').trim();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!evolutions) return null;

  return (
    <div className="space-y-3">
      {/* Patient basic info */}
      <div className="grid gap-2 sm:grid-cols-2 text-sm">
        {patient.age && <p><span className="text-muted-foreground">Idade:</span> {patient.age} anos</p>}
        {patient.gender && <p><span className="text-muted-foreground">Sexo:</span> {patient.gender}</p>}
        {patient.birth_date && (
          <p><span className="text-muted-foreground">Nascimento:</span> {formatBR(patient.birth_date, 'dd/MM/yyyy')}</p>
        )}
        {patient.main_complaint && <p><span className="text-muted-foreground">Queixa:</span> {patient.main_complaint}</p>}
        {patient.allergies && (
          <p className="flex items-center gap-1">
            <AlertCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
            <span className="text-muted-foreground">Alergias:</span> {patient.allergies}
          </p>
        )}
        {patient.current_medications && <p><span className="text-muted-foreground">Medicações:</span> {patient.current_medications}</p>}
        {stripSignatureMetadata(patient.brief_history) && (
          <p className="sm:col-span-2"><span className="text-muted-foreground">Histórico:</span> {stripSignatureMetadata(patient.brief_history)}</p>
        )}
      </div>

      {/* Nursing evolutions */}
      {(evolutions.nursing || []).map((n, idx) => (
        <Card key={n.id} className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Activity className="h-4 w-4 text-primary" />
              Evolução de Enfermagem {(evolutions.nursing || []).length > 1 ? `#${idx + 1}` : ''}
            </p>
            <div className="grid gap-1 sm:grid-cols-3 text-xs text-muted-foreground">
              {n.blood_pressure_systolic && <span>PA: {n.blood_pressure_systolic}/{n.blood_pressure_diastolic} mmHg</span>}
              {n.heart_rate && <span>FC: {n.heart_rate} bpm</span>}
              {n.respiratory_rate && <span>FR: {n.respiratory_rate} irpm</span>}
              {n.oxygen_saturation && <span>SpO2: {n.oxygen_saturation}%</span>}
              {n.temperature && <span>Temp: {n.temperature}°C</span>}
              {n.blood_glucose && <span>Glicemia: {n.blood_glucose} mg/dL</span>}
            </div>
            {n.observations && <p className="text-xs mt-2 text-foreground">{n.observations}</p>}
          </CardContent>
        </Card>
      ))}

      {/* Medical evolutions */}
      {(evolutions.medical || []).map((m, idx) => (
        <Card key={m.id} className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-2">
              <Stethoscope className="h-4 w-4 text-primary" />
              Evolução Médica {(evolutions.medical || []).length > 1 ? `#${idx + 1}` : ''}
            </p>
            <div className="grid gap-1 text-xs text-muted-foreground">
              {m.diagnosis && <p><span className="font-medium text-foreground">Diagnóstico:</span> {m.diagnosis}</p>}
              {m.medical_assessment && <p><span className="font-medium text-foreground">Avaliação:</span> {m.medical_assessment}</p>}
              {m.conduct && <p><span className="font-medium text-foreground">Conduta:</span> {m.conduct}</p>}
              {m.prescription && <p><span className="font-medium text-foreground">Prescrição:</span> {m.prescription}</p>}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Signatures */}
      {(evolutions.signatures || []).length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-3">
            <p className="text-sm font-medium flex items-center gap-1.5 mb-3">
              <PenTool className="h-4 w-4 text-primary" />
              Assinaturas Digitais
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(evolutions.signatures || []).map((sig) => (
                <div key={sig.id} className="flex items-center gap-3 p-2 rounded-md border border-border/50 bg-background">
                  <img src={sig.signature_data} alt="Assinatura" className="h-10 w-auto bg-white rounded border" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-foreground truncate">{sig.profile?.full_name || 'Profissional'}</p>
                    <p className="text-xs text-muted-foreground">
                      {sig.signature_type === 'enfermagem' ? 'Enfermeiro(a)' : sig.signature_type === 'medica' ? 'Médico(a)' : sig.signature_type === 'transporte' ? 'Condutor' : 'Checklist'}
                      {sig.professional_id ? ` • ${sig.professional_id}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatBR(sig.signed_at, "dd/MM/yyyy 'às' HH:mm")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {(evolutions.nursing || []).length === 0 && (evolutions.medical || []).length === 0 && (evolutions.signatures || []).length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">Nenhuma evolução registrada.</p>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────
export default function PatientsPage() {
  const navigate = useNavigate();
  const { isAdmin, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [patients, setPatients] = useState<PatientWithEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evolutions, setEvolutions] = useState<Record<string, { nursing: NursingEvolution[]; medical: MedicalEvolution[]; signatures: (DigitalSignature & { profile?: { full_name: string; professional_id: string | null } })[] }>>({});
  const [loadingEvolutions, setLoadingEvolutions] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/');
  }, [isAdmin, authLoading, navigate]);

  useEffect(() => { fetchPatients(); }, []);

  const fetchPatients = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select(`*, event:events(*)`)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setPatients((data || []) as PatientWithEvent[]);
    } catch (error) {
      console.error('Error fetching patients:', error);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível carregar a lista de pacientes.'), variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvolutions = async (patient: PatientWithEvent) => {
    if (evolutions[patient.id]) return;
    if (!patient.event_id) {
      // Admin-created patient without event — no evolutions to load
      setEvolutions(prev => ({ ...prev, [patient.id]: { nursing: [], medical: [], signatures: [] } }));
      return;
    }
    setLoadingEvolutions(patient.id);
    try {
      const [nursingRes, medicalRes, sigRes] = await Promise.all([
        supabase.from('nursing_evolutions').select('*').eq('event_id', patient.event_id),
        supabase.from('medical_evolutions').select('*').eq('event_id', patient.event_id),
        supabase.from('digital_signatures').select('*, profile:profiles(full_name, professional_id)').eq('event_id', patient.event_id),
      ]);
      const nursingAll = (nursingRes.data || []) as NursingEvolution[];
      const medicalAll = (medicalRes.data || []) as MedicalEvolution[];
      setEvolutions(prev => ({
        ...prev,
        [patient.id]: {
          nursing: nursingAll.filter(n => !n.patient_id || n.patient_id === patient.id),
          medical: medicalAll.filter(m => !m.patient_id || m.patient_id === patient.id),
          signatures: (sigRes.data || []) as any,
        },
      }));
    } catch (err) {
      console.error('Error loading evolutions:', err);
    } finally {
      setLoadingEvolutions(null);
    }
  };

  const handleToggle = (patient: PatientWithEvent) => {
    if (expandedId === patient.id) {
      setExpandedId(null);
    } else {
      setExpandedId(patient.id);
      loadEvolutions(patient);
    }
  };

  const handleExportPDF = async (e: React.MouseEvent, patient: PatientWithEvent) => {
    e.stopPropagation();
    setExportingId(patient.id);
    try {
      await exportPatientPDF(patient);
      toast({ title: 'PDF exportado com sucesso!' });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      toast({ title: 'Erro', description: explainError(err, 'Não foi possível exportar o PDF.'), variant: 'destructive' });
    } finally {
      setExportingId(null);
    }
  };

  const filteredPatients = patients.filter(patient =>
    patient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.event?.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (authLoading || isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Pacientes</h1>
              <p className="text-sm text-muted-foreground">
                {filteredPatients.length} paciente{filteredPatients.length !== 1 ? 's' : ''} encontrado{filteredPatients.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <Button size="sm" onClick={() => setShowCreateDialog(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Nova Ficha
          </Button>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou evento..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Empty State */}
        {filteredPatients.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <div className="rounded-full bg-muted p-4 mb-4">
                <UserRound className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground font-medium">Nenhum paciente encontrado</p>
              <p className="text-sm text-muted-foreground mt-1">Tente buscar com outros termos</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredPatients.map((patient) => (
              <Collapsible
                key={patient.id}
                open={expandedId === patient.id}
                onOpenChange={() => handleToggle(patient)}
              >
                <Card className="overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="flex-shrink-0 h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserRound className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-foreground truncate">{patient.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            {patient.age && (
                              <span className="text-xs text-muted-foreground">{patient.age} anos</span>
                            )}
                            {patient.event?.code ? (
                              <Badge variant="secondary" className="text-xs font-mono">{patient.event.code}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">
                                <ShieldCheck className="h-3 w-3 mr-1" />
                                Criado pelo Administrador
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => handleExportPDF(e, patient)}
                          disabled={exportingId === patient.id}
                        >
                          {exportingId === patient.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <FileDown className="h-4 w-4 mr-1" />
                              PDF
                            </>
                          )}
                        </Button>
                        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${expandedId === patient.id ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                  </CollapsibleTrigger>

                  <CollapsibleContent>
                    <Separator />
                    <div className="p-4 space-y-4">
                      <PatientEvolutions
                        patient={patient}
                        evolutions={evolutions[patient.id]}
                        loading={loadingEvolutions === patient.id}
                      />
                      <p className="text-xs text-muted-foreground text-right">
                        Cadastrado em {formatBR(patient.created_at, "dd/MM/yyyy 'às' HH:mm")}
                      </p>
                    </div>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))}
          </div>
        )}

        {/* Create Patient Dialog */}
        <CreatePatientDialog
          open={showCreateDialog}
          onOpenChange={setShowCreateDialog}
          onCreated={fetchPatients}
        />
      </div>
    </MainLayout>
  );
}
