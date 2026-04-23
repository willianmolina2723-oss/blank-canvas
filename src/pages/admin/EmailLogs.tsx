import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Mail, Loader2, RefreshCw, Filter } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDateBR } from '@/utils/dateFormat';

interface EmailLog {
  id: string;
  recipient_email: string;
  type: string;
  subject: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
  user_id: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  invite: 'Convite',
  password_reset: 'Recuperação de senha',
  opportunity: 'Oportunidade',
  resend_invite: 'Reenvio de convite',
};

const STATUS_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive'> = {
  sent: 'default',
  pending: 'secondary',
  failed: 'destructive',
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Enviado',
  pending: 'Pendente',
  failed: 'Falhou',
};

export default function EmailLogs() {
  const { isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!isLoading && !isAdmin) navigate('/');
  }, [isAdmin, isLoading, navigate]);

  const load = async () => {
    setLoading(true);
    let q = (supabase as any).from('email_logs').select('*').order('created_at', { ascending: false }).limit(200);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    if (typeFilter !== 'all') q = q.eq('type', typeFilter);
    if (search.trim()) q = q.ilike('recipient_email', `%${search.trim()}%`);
    const { data, error } = await q;
    if (error) {
      toast({ title: 'Erro ao carregar', description: error.message, variant: 'destructive' });
    }
    setLogs((data as EmailLog[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, statusFilter, typeFilter]);

  if (isLoading || !isAdmin) {
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
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-lg bg-primary/10">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Logs de E-mail</h1>
            <p className="text-muted-foreground">Histórico de e-mails enviados pelo sistema</p>
          </div>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Filtros
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="sent">Enviado</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
                <SelectItem value="failed">Falhou</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os tipos</SelectItem>
                <SelectItem value="invite">Convite</SelectItem>
                <SelectItem value="password_reset">Recuperação</SelectItem>
                <SelectItem value="opportunity">Oportunidade</SelectItem>
                <SelectItem value="resend_invite">Reenvio</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filtrar por e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
            />
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : logs.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">
                Nenhum log encontrado.
              </div>
            ) : (
              <div className="divide-y">
                {logs.map((log) => (
                  <div key={log.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3 md:gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={STATUS_VARIANTS[log.status] || 'secondary'}>
                          {STATUS_LABELS[log.status] || log.status}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {TYPE_LABELS[log.type] || log.type}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDateBR(log.created_at)} {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                        </span>
                      </div>
                      <p className="text-sm font-medium truncate">{log.subject || '(sem assunto)'}</p>
                      <p className="text-xs text-muted-foreground truncate">{log.recipient_email}</p>
                      {log.error_message && (
                        <p className="text-xs text-destructive mt-1 line-clamp-2">{log.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
