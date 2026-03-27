import { useRef, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { ArrowLeft, PenTool, Save, Loader2, Trash2, Check, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { DigitalSignature, SignatureType } from '@/types/database';
import { formatBR } from '@/utils/dateFormat';

const SIGNATURE_TYPES: { type: SignatureType; label: string; role: string }[] = [
  { type: 'enfermagem', label: 'Evolução de Enfermagem', role: 'enfermeiro' },
  { type: 'medica', label: 'Evolução Médica', role: 'medico' },
  { type: 'transporte', label: 'Transporte', role: 'condutor' },
  { type: 'checklist', label: 'Checklist', role: 'condutor' },
];

export default function Signatures() {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const { profile, roles } = useAuth();
  const { toast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [signatures, setSignatures] = useState<DigitalSignature[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [selectedType, setSelectedType] = useState<SignatureType | null>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (eventId) {
      loadSignatures();
    }
  }, [eventId]);

  useEffect(() => {
    if (selectedType && canvasRef.current) {
      setupCanvas();
    }
  }, [selectedType]);

  const loadSignatures = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('digital_signatures')
        .select('*')
        .eq('event_id', eventId);

      if (error) throw error;
      setSignatures(data as DigitalSignature[]);
    } catch (err) {
      console.error('Error loading signatures:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Set drawing style
    ctx.strokeStyle = '#0066cc';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  };

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    
    if ('touches' in e) {
      return {
        x: e.touches[0].clientX - rect.left,
        y: e.touches[0].clientY - rect.top,
      };
    }
    
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasDrawn(true);
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  };

  const saveSignature = async () => {
    if (!selectedType || !hasDrawn || !profile) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsSaving(true);
    try {
      const signatureData = canvas.toDataURL('image/png');

      const { data, error } = await supabase
        .from('digital_signatures')
        .insert({
          event_id: eventId,
          profile_id: profile.id,
          signature_type: selectedType,
          signature_data: signatureData,
          professional_id: profile.professional_id,
          ip_address: '', // Would need to get from server
          user_agent: navigator.userAgent,
          empresa_id: profile?.empresa_id || null,
        })
        .select()
        .single();

      if (error) throw error;

      setSignatures([...signatures, data as DigitalSignature]);
      setSelectedType(null);
      setHasDrawn(false);

      toast({
        title: 'Assinatura registrada',
        description: 'Sua assinatura foi salva com sucesso. O registro foi bloqueado.',
      });
    } catch (err: any) {
      console.error('Error saving signature:', err);
      if (err.message?.includes('unique')) {
        toast({
          title: 'Erro',
          description: 'Você já assinou este tipo de documento neste evento.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Erro',
          description: 'Não foi possível salvar a assinatura.',
          variant: 'destructive',
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  const canSign = (type: SignatureType) => {
    const typeConfig = SIGNATURE_TYPES.find(t => t.type === type);
    if (!typeConfig) return false;
    
    // Check if user has the required role
    if (!roles.includes(typeConfig.role as any) && !roles.includes('admin')) return false;
    
    // Check if already signed
    const existingSignature = signatures.find(
      s => s.signature_type === type && s.profile_id === profile?.id
    );
    if (existingSignature) return false;
    
    return true;
  };

  const getSignatureStatus = (type: SignatureType) => {
    const sig = signatures.find(s => s.signature_type === type);
    return sig;
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
      <div className="space-y-6 animate-fade-in max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <PenTool className="h-6 w-6 text-primary" />
              Assinaturas Digitais
            </h1>
            <p className="text-muted-foreground">Conforme Lei 14.063/2020</p>
          </div>
        </div>

        {/* Signature Types */}
        {!selectedType && (
          <div className="grid gap-4 sm:grid-cols-2">
            {SIGNATURE_TYPES.map(({ type, label, role }) => {
              const existingSig = getSignatureStatus(type);
              const canUserSign = canSign(type);

              return (
                <Card
                  key={type}
                  className={`cursor-pointer transition-colors ${
                    existingSig 
                      ? 'border-success/50 bg-success/5' 
                      : canUserSign 
                        ? 'hover:border-primary/50' 
                        : 'opacity-60'
                  }`}
                  onClick={() => canUserSign && setSelectedType(type)}
                >
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="font-semibold">{label}</h3>
                        {existingSig ? (
                          <p className="text-sm text-muted-foreground">
                            Assinado em {formatBR(existingSig.signed_at, "dd/MM/yyyy 'às' HH:mm")}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            Requer: {role === 'enfermeiro' ? 'Enfermeiro' : role === 'medico' ? 'Médico' : 'Condutor'}
                          </p>
                        )}
                      </div>
                      {existingSig ? (
                        <Check className="h-6 w-6 text-success" />
                      ) : canUserSign ? (
                        <Badge variant="secondary">Pendente</Badge>
                      ) : (
                        <AlertCircle className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Signature Canvas */}
        {selectedType && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">
                Assinar: {SIGNATURE_TYPES.find(t => t.type === selectedType)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground text-center mb-2">
                  Ao assinar, você confirma que as informações estão corretas e que o registro será bloqueado para edição.
                </p>
                <p className="text-xs text-center text-muted-foreground">
                  {profile?.full_name} • {profile?.professional_id || 'Sem registro profissional'}
                </p>
              </div>

              <div className="border-2 border-dashed border-border rounded-lg p-1">
                <canvas
                  ref={canvasRef}
                  className="signature-canvas w-full h-48 bg-white rounded"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="outline" onClick={clearCanvas} className="flex-1">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Limpar
                </Button>
                <Button variant="outline" onClick={() => setSelectedType(null)} className="flex-1">
                  Cancelar
                </Button>
                <Button 
                  onClick={saveSignature} 
                  disabled={!hasDrawn || isSaving}
                  className="flex-1"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Assinar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Existing Signatures */}
        {signatures.length > 0 && !selectedType && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Assinaturas Registradas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {signatures.map((sig) => (
                <div key={sig.id} className="flex items-center gap-4 p-3 border rounded-lg">
                  <img
                    src={sig.signature_data}
                    alt="Assinatura"
                    className="h-12 w-auto bg-white rounded border"
                  />
                  <div className="flex-1">
                    <p className="font-medium">
                      {SIGNATURE_TYPES.find(t => t.type === sig.signature_type)?.label}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatBR(sig.signed_at, "dd/MM/yyyy 'às' HH:mm")}
                      {sig.professional_id && ` • ${sig.professional_id}`}
                    </p>
                  </div>
                  <Check className="h-5 w-5 text-success" />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
