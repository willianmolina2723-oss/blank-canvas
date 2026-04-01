import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, UserRound, Save, Loader2, AlertTriangle, Plus, Edit2, ClipboardList, PenTool, Eraser, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { explainError } from '@/utils/explainError';
import type { Patient } from '@/types/database';

const OCCURRENCE_OPTIONS = [
  'ADM medicação inalatória',
  'ADM medicação intramuscular',
  'ADM medicação intravenosa',
  'ADM medicação subcutânea',
  'ADM medicação tópica',
  'ADM medicação via oral',
  'Alergias',
  'Amigdalite / Odinofagia',
  'Bradicardia',
  'Câimbras',
  'Cefaleia',
  'Cólica Menstrual',
  'Contenção de hemorragia',
  'Controle sinais vitais',
  'Crises de ansiedade',
  'Convulsões',
  'Curativo / Bandagem',
  'Desidratação',
  'Dispneia',
  'Dor abdominal',
  'Dor Epigástrica',
  'Entorses / Fratura',
  'Escoriações / Laceração',
  'HGT',
  'Hidratação venosa',
  'Hipertensão',
  'Hipotensão',
  'Hipertermia / Hipotermia',
  'Imobilização cervical + maca rígida',
  'Imobilização membros',
  'Infarto / AVC',
  'Intoxicação exógena (Álcool e Entorpecente)',
  'Intubação',
  'Lombalgia',
  'Náuseas / Êmese',
  'Nebulização',
  'Orientações',
  'Otite / Otalgia',
  'Oxigenoterapia máscara ou cateter',
  'PCR',
  'Picada de água viva',
  'Queda',
  'Síncope (Desmaio)',
  'Sutura',
  'Taquicardia',
  'TCE',
  'Terapia com calor ou frio',
  'Transferência Hospitalar',
];

export default function PatientForm() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { toast } = useToast();
  
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patient, setPatient] = useState<Partial<Patient>>({
    name: '',
    birth_date: '',
    age: undefined,
    gender: '',
    cpf: '',
    main_complaint: '',
    brief_history: '',
    allergies: '',
    current_medications: '',
  });
  const [selectedOccurrences, setSelectedOccurrences] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingPatientId, setEditingPatientId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [lgpdConsent, setLgpdConsent] = useState(false);

  // Signature state
  const [signerType, setSignerType] = useState<'paciente' | 'responsavel'>('paciente');
  const [responsibleName, setResponsibleName] = useState('');
  const [responsibleCpf, setResponsibleCpf] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);

  const [eventRole, setEventRole] = useState<string | null>(null);

  useEffect(() => {
    if (eventId && profile) {
      supabase.from('event_participants').select('role').eq('event_id', eventId).eq('profile_id', profile.id).maybeSingle()
        .then(({ data }) => setEventRole(data?.role || null));
    }
  }, [eventId, profile]);

  const { canCreatePatientRecord } = usePermissions({ eventRole: eventRole as any });
  const canEdit = canCreatePatientRecord;

  // Redraw signature on canvas when editing
  useEffect(() => {
    if (signatureData && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        ctx.clearRect(0, 0, canvasRef.current!.width, canvasRef.current!.height);
        ctx.drawImage(img, 0, 0);
      };
      img.src = signatureData;
    }
  }, [showForm, editingPatientId]);

  useEffect(() => {
    if (eventId) {
      loadPatients();
    }
  }, [eventId]);

  const loadPatients = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('patients')
        .select('*')
        .eq('event_id', eventId)
        .order('created_at', { ascending: true });

      if (error) throw error;

      const list = (data || []) as Patient[];
      setPatients(list);
      
      if (list.length === 0) {
        setShowForm(true);
      }
    } catch (err) {
      console.error('Error loading patients:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: keyof Patient, value: string | number | null) => {
    setPatient(prev => ({ ...prev, [field]: value }));
  };

  const calculateAge = (birthDate: string) => {
    if (!birthDate) return null;
    const today = new Date();
    const birth = new Date(birthDate);
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }
    return age;
  };

  const handleBirthDateChange = (value: string) => {
    handleChange('birth_date', value);
    const age = calculateAge(value);
    if (age !== null) {
      handleChange('age', age);
    }
  };

  const toggleOccurrence = (occ: string) => {
    setSelectedOccurrences(prev =>
      prev.includes(occ) ? prev.filter(o => o !== occ) : [...prev, occ]
    );
  };

  const resetForm = () => {
    setPatient({
      name: '',
      birth_date: '',
      age: undefined,
      gender: '',
      cpf: '',
      main_complaint: '',
      brief_history: '',
      allergies: '',
      current_medications: '',
    });
    setSelectedOccurrences([]);
    setEditingPatientId(null);
    setShowForm(false);
    setSignerType('paciente');
    setResponsibleName('');
    setResponsibleCpf('');
    setSignatureData(null);
    setLgpdConsent(false);
    clearCanvas();
  };

  // Canvas signature helpers
  const getCanvasPoint = (e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  };

  const startDrawing = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    isDrawingRef.current = true;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    if (!isDrawingRef.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = getCanvasPoint(e);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#000';
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const isCanvasBlank = (canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    const pixelData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < pixelData.length; i += 4) {
      if (pixelData[i] !== 0) return false;
    }
    return true;
  };

  const stopDrawing = () => {
    isDrawingRef.current = false;
    if (canvasRef.current) {
      if (isCanvasBlank(canvasRef.current)) {
        setSignatureData(null);
      } else {
        setSignatureData(canvasRef.current.toDataURL('image/png'));
      }
    }
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignatureData(null);
  };

  const formatCpf = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  };

  const editPatient = (p: Patient) => {
    const { text, sig } = parseSignatureFromHistory(p.brief_history);
    setPatient({ ...p, brief_history: text });
    setSelectedOccurrences([]);
    setEditingPatientId(p.id);
    setShowForm(true);
    if (sig) {
      setSignerType(sig.signerType || 'paciente');
      setResponsibleName(sig.responsibleName || '');
      setResponsibleCpf(sig.responsibleCpf || '');
      setSignatureData(sig.signatureData || null);
      setLgpdConsent(sig.lgpdConsent || false);
    } else {
      setSignerType('paciente');
      setResponsibleName('');
      setResponsibleCpf('');
      setSignatureData(null);
      setLgpdConsent(false);
    }
  };

  const getOrCreateDispatchReport = async (): Promise<string | null> => {
    const { data: existingReport } = await supabase
      .from('dispatch_reports')
      .select('id')
      .eq('event_id', eventId!)
      .maybeSingle();

    if (existingReport) return existingReport.id;

    const { data: newReport, error: reportErr } = await supabase
      .from('dispatch_reports')
      .insert({
        event_id: eventId!,
        created_by: profile?.id || null,
        status: 'rascunho',
        empresa_id: profile?.empresa_id || null,
      })
      .select('id')
      .single();

    if (!reportErr && newReport) return newReport.id;
    return null;
  };

  const saveOccurrences = async (reportId: string, patientName: string) => {
    if (selectedOccurrences.length === 0) return;

    const rows = selectedOccurrences.map(occ => ({
      report_id: reportId,
      occurrence_name: occ,
      quantity: 1,
      observation: patientName,
    }));

    await supabase.from('dispatch_occurrences').insert(rows);
  };

  // Build brief_history with embedded signature metadata
  const buildBriefHistoryWithSignature = () => {
    const historyText = patient.brief_history || '';
    const sigMeta = {
      __sig: true,
      signerType,
      responsibleName: signerType === 'responsavel' ? responsibleName : null,
      responsibleCpf: signerType === 'responsavel' ? responsibleCpf : null,
      patientCpf: patient.cpf || null,
      signatureData: signatureData || null,
      lgpdConsent: true,
      consentDate: new Date().toISOString(),
    };
    return historyText + '\n<!--SIG:' + JSON.stringify(sigMeta) + ':SIG-->';
  };

  // Parse signature metadata from brief_history
  const parseSignatureFromHistory = (history: string | null) => {
    if (!history) return { text: '', sig: null };
    const match = history.match(/\n<!--SIG:(.*?):SIG-->$/s);
    if (!match) return { text: history, sig: null };
    try {
      const sig = JSON.parse(match[1]);
      const text = history.replace(/\n<!--SIG:.*?:SIG-->$/s, '');
      return { text, sig };
    } catch {
      return { text: history, sig: null };
    }
  };

  const savePatient = async () => {
    if (!patient.name?.trim()) {
      toast({ title: 'Erro', description: 'O nome do paciente é obrigatório.', variant: 'destructive' });
      return;
    }

    if (!signatureData) {
      toast({ title: 'Erro', description: 'A assinatura é obrigatória para salvar a ficha.', variant: 'destructive' });
      return;
    }

    if (!lgpdConsent) {
      toast({ title: 'Erro', description: 'É necessário aceitar o termo de consentimento LGPD.', variant: 'destructive' });
      return;
    }

    if (signerType === 'responsavel') {
      if (!responsibleName.trim()) {
        toast({ title: 'Erro', description: 'O nome do responsável é obrigatório.', variant: 'destructive' });
        return;
      }
      const cpfDigits = responsibleCpf.replace(/\D/g, '');
      if (cpfDigits.length !== 11) {
        toast({ title: 'Erro', description: 'O CPF do responsável deve ter 11 dígitos.', variant: 'destructive' });
        return;
      }
    }

    const briefHistoryWithSig = buildBriefHistoryWithSignature();

    setIsSaving(true);
    try {
      if (editingPatientId) {
        const { error } = await supabase
          .from('patients')
          .update({
            name: patient.name,
            birth_date: patient.birth_date || null,
            age: patient.age || null,
            gender: patient.gender || null,
            cpf: patient.cpf || null,
            main_complaint: patient.main_complaint || null,
            brief_history: briefHistoryWithSig,
            allergies: patient.allergies || null,
            current_medications: patient.current_medications || null,
          } as any)
          .eq('id', editingPatientId);
        if (error) throw error;

        if (selectedOccurrences.length > 0) {
          try {
            const reportId = await getOrCreateDispatchReport();
            if (reportId) await saveOccurrences(reportId, patient.name!);
          } catch (occErr) {
            console.warn('Could not create dispatch occurrences:', occErr);
          }
        }
      } else {
        const { error } = await supabase
          .from('patients')
          .insert({
            event_id: eventId!,
            name: patient.name!,
            birth_date: patient.birth_date || null,
            age: patient.age || null,
            gender: patient.gender || null,
            cpf: patient.cpf || null,
            main_complaint: patient.main_complaint || null,
            brief_history: briefHistoryWithSig,
            allergies: patient.allergies || null,
            current_medications: patient.current_medications || null,
            created_by: profile?.id || null,
            empresa_id: profile?.empresa_id || null,
          } as any);
        if (error) throw error;

        try {
          const reportId = await getOrCreateDispatchReport();
          if (reportId) {
            await saveOccurrences(reportId, patient.name!);
          }
        } catch (occErr) {
          console.warn('Could not create dispatch occurrences:', occErr);
        }
      }

      toast({ title: 'Sucesso', description: 'Dados do paciente salvos com sucesso.' });
      resetForm();
      await loadPatients();
    } catch (err) {
      console.error('Error saving patient:', err);
      toast({ title: 'Erro', description: 'Não foi possível salvar os dados do paciente.', variant: 'destructive' });
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

  return (
    <MainLayout>
      <div className="space-y-4 animate-fade-in">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => showForm && patients.length > 0 ? resetForm() : navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-base font-bold text-foreground flex items-center gap-2">
              <UserRound className="h-5 w-5 text-primary" />
              {showForm ? (editingPatientId ? 'Editar Paciente' : 'Novo Paciente') : 'Pacientes'}
            </h1>
          </div>
          {!showForm && canEdit && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="h-4 w-4 mr-1" /> Novo
            </Button>
          )}
        </div>

        {!canEdit && (
          <Card className="border-warning bg-warning/10">
            <CardContent className="py-3">
              <p className="text-sm text-center flex items-center justify-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Apenas enfermeiros podem editar os dados do paciente.
              </p>
            </CardContent>
          </Card>
        )}

        {!showForm ? (
          /* Patient List */
          <div className="space-y-2">
            {patients.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  Nenhum paciente cadastrado neste evento.
                </CardContent>
              </Card>
            ) : (
              patients.map((p) => (
                <Card key={p.id} className="cursor-pointer hover:bg-accent/50 transition-colors" onClick={() => editPatient(p)}>
                  <CardContent className="py-3 flex items-center gap-3">
                    <UserRound className="h-5 w-5 text-primary shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {p.age ? `${p.age} anos` : ''}{p.gender ? ` • ${p.gender}` : ''}{p.main_complaint ? ` • ${p.main_complaint.substring(0, 40)}...` : ''}
                      </p>
                    </div>
                    <Edit2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        ) : (
          /* Patient Form */
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Identificação</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2 space-y-2">
                  <Label htmlFor="name">Nome Completo *</Label>
                  <Input id="name" value={patient.name || ''} onChange={(e) => handleChange('name', e.target.value)} disabled={!canEdit} placeholder="Nome do paciente" className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="birth_date">Data de Nascimento</Label>
                  <Input id="birth_date" type="date" value={patient.birth_date || ''} onChange={(e) => handleBirthDateChange(e.target.value)} disabled={!canEdit} className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Idade</Label>
                  <Input id="age" type="number" value={patient.age || ''} onChange={(e) => handleChange('age', parseInt(e.target.value) || null)} disabled={!canEdit} placeholder="Anos" className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gender">Sexo</Label>
                  <Select value={patient.gender || ''} onValueChange={(value) => handleChange('gender', value)} disabled={!canEdit}>
                    <SelectTrigger className="h-12"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="masculino">Masculino</SelectItem>
                      <SelectItem value="feminino">Feminino</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cpf">CPF do Paciente</Label>
                  <Input
                    id="cpf"
                    value={patient.cpf || ''}
                    onChange={(e) => handleChange('cpf', formatCpf(e.target.value))}
                    disabled={!canEdit}
                    placeholder="000.000.000-00"
                    maxLength={14}
                    className="h-12"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-base">Queixa Principal</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="main_complaint">Queixa Principal</Label>
                  <Textarea id="main_complaint" value={patient.main_complaint || ''} onChange={(e) => handleChange('main_complaint', e.target.value)} disabled={!canEdit} placeholder="Descreva a queixa principal do paciente..." rows={3} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="brief_history">Histórico Breve</Label>
                  <Textarea id="brief_history" value={patient.brief_history || ''} onChange={(e) => handleChange('brief_history', e.target.value)} disabled={!canEdit} placeholder="Histórico médico relevante..." rows={3} />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base text-destructive">Alergias</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={patient.allergies || ''} onChange={(e) => handleChange('allergies', e.target.value)} disabled={!canEdit} placeholder="Liste as alergias conhecidas..." rows={4} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3"><CardTitle className="text-base">Medicações em Uso</CardTitle></CardHeader>
                <CardContent>
                  <Textarea value={patient.current_medications || ''} onChange={(e) => handleChange('current_medications', e.target.value)} disabled={!canEdit} placeholder="Liste as medicações em uso..." rows={4} />
                </CardContent>
              </Card>
            </div>

            {/* Occurrences Checklist */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-primary" />
                  Lista de Ocorrências
                  {selectedOccurrences.length > 0 && (
                    <span className="text-xs font-normal text-muted-foreground">
                      ({selectedOccurrences.length} selecionada{selectedOccurrences.length > 1 ? 's' : ''})
                    </span>
                  )}
                </CardTitle>
                <p className="text-xs text-muted-foreground">Selecione as ocorrências para o Relatório de Envio</p>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select
                  disabled={!canEdit}
                  onValueChange={(value) => {
                    if (!selectedOccurrences.includes(value)) {
                      setSelectedOccurrences(prev => [...prev, value]);
                    }
                  }}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Selecione uma ocorrência..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {OCCURRENCE_OPTIONS.map((occ) => (
                      <SelectItem key={occ} value={occ} disabled={selectedOccurrences.includes(occ)}>
                        {occ}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {selectedOccurrences.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedOccurrences.map((occ) => (
                      <span
                        key={occ}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20"
                      >
                        {occ}
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => setSelectedOccurrences(prev => prev.filter(o => o !== occ))}
                            className="ml-0.5 hover:text-destructive transition-colors"
                          >
                            ×
                          </button>
                        )}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* LGPD Consent + Signature Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Consentimento LGPD e Assinatura *
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* LGPD Consent */}
                <div className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Em conformidade com a <strong>Lei Geral de Proteção de Dados (Lei nº 13.709/2018)</strong>, declaro que autorizo a coleta e o tratamento dos meus dados pessoais e de saúde aqui registrados, exclusivamente para fins de atendimento médico/enfermagem durante este evento. Os dados serão armazenados de forma segura e não serão compartilhados com terceiros, exceto quando exigido por lei ou para continuidade do atendimento de saúde.
                  </p>
                  <div className="flex items-start space-x-3">
                    <Checkbox
                      id="lgpd-consent"
                      checked={lgpdConsent}
                      onCheckedChange={(checked) => setLgpdConsent(checked === true)}
                    />
                    <Label htmlFor="lgpd-consent" className="text-sm font-medium cursor-pointer leading-relaxed">
                      Li e concordo com o termo de consentimento acima para coleta e tratamento dos meus dados pessoais e de saúde.
                    </Label>
                  </div>
                </div>

                {/* Signer Type */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Quem está assinando?</Label>
                  <RadioGroup
                    value={signerType}
                    onValueChange={(v) => setSignerType(v as 'paciente' | 'responsavel')}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="paciente" id="signer-paciente" />
                      <Label htmlFor="signer-paciente" className="cursor-pointer">Paciente</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="responsavel" id="signer-responsavel" />
                      <Label htmlFor="signer-responsavel" className="cursor-pointer">Responsável Legal</Label>
                    </div>
                  </RadioGroup>
                </div>

                {signerType === 'responsavel' && (
                  <div className="grid gap-3 sm:grid-cols-2 p-3 rounded-lg border border-border bg-muted/20">
                    <div className="space-y-2">
                      <Label htmlFor="resp-name">Nome Completo do Responsável *</Label>
                      <Input
                        id="resp-name"
                        value={responsibleName}
                        onChange={(e) => setResponsibleName(e.target.value)}
                        placeholder="Nome completo"
                        className="h-12"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="resp-cpf">CPF do Responsável *</Label>
                      <Input
                        id="resp-cpf"
                        value={responsibleCpf}
                        onChange={(e) => setResponsibleCpf(formatCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className="h-12"
                      />
                    </div>
                  </div>
                )}

                {/* Signature Pad */}
                <div className="space-y-2">
                  <Label>Assine abaixo *</Label>
                  <div className="relative border-2 border-dashed border-border rounded-lg bg-white">
                    <canvas
                      ref={canvasRef}
                      width={600}
                      height={200}
                      className="w-full touch-none cursor-crosshair"
                      style={{ height: '150px' }}
                      onMouseDown={startDrawing}
                      onMouseMove={draw}
                      onMouseUp={stopDrawing}
                      onMouseLeave={stopDrawing}
                      onTouchStart={startDrawing}
                      onTouchMove={draw}
                      onTouchEnd={stopDrawing}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={clearCanvas}
                      className="absolute top-1 right-1"
                    >
                      <Eraser className="h-4 w-4 mr-1" />
                      Limpar
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {signerType === 'paciente'
                      ? 'Assinatura do paciente autorizando o atendimento e concordando com os termos LGPD'
                      : 'Assinatura do responsável legal pelo paciente concordando com os termos LGPD'}
                  </p>
                </div>
              </CardContent>
            </Card>

            {canEdit && (
              <Button onClick={savePatient} disabled={isSaving} className="w-full py-6 text-sm font-bold uppercase tracking-wider rounded-2xl">
                {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Salvar Paciente
              </Button>
            )}
          </div>
        )}
      </div>
    </MainLayout>
  );
}
