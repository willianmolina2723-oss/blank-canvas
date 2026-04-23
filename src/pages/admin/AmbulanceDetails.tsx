import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Truck, Hash, CalendarDays, Gauge, Fuel, Wrench, AlertTriangle, DollarSign, Calendar, FileText, Plus } from 'lucide-react';
import { formatBR } from '@/utils/dateFormat';
import { computeAlerts } from '@/utils/maintenanceAlerts';
import { getCategoryLabel, getMaintenanceTypeLabel, VEHICLE_STATUS_OPTIONS, type AmbulanceFull, type MaintenanceLogFull } from '@/types/maintenance';
import { MaintenanceHistory } from '@/components/admin/MaintenanceHistory';

export default function AmbulanceDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  const { data: ambulance, isLoading } = useQuery({
    queryKey: ['ambulance', id],
    queryFn: async () => {
      const { data, error } = await supabase.from('ambulances').select('*').eq('id', id!).maybeSingle();
      if (error) throw error;
      return data as unknown as AmbulanceFull | null;
    },
    enabled: !!id,
  });

  const { data: logs = [] } = useQuery({
    queryKey: ['maintenance-logs', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('maintenance_logs')
        .select('*')
        .eq('ambulance_id', id!)
        .order('maintenance_date', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as MaintenanceLogFull[];
    },
    enabled: !!id,
  });

  const alerts = useMemo(() => ambulance ? computeAlerts(ambulance, logs) : [], [ambulance, logs]);
  const totalCost = useMemo(() => logs.reduce((s, l) => s + (Number(l.cost) || 0), 0), [logs]);
  const lastService = logs[0];
  const nextService = useMemo(() => {
    const upcoming = logs
      .filter(l => l.next_service_date)
      .map(l => ({ log: l, date: new Date(l.next_service_date!) }))
      .filter(x => x.date >= new Date(new Date().toDateString()))
      .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
    return upcoming?.log;
  }, [logs]);

  const costByCategory = useMemo(() => {
    const map = new Map<string, number>();
    logs.forEach(l => {
      const key = l.category || 'outros';
      map.set(key, (map.get(key) || 0) + (Number(l.cost) || 0));
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [logs]);

  if (isLoading) {
    return (
      <MainLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  if (!ambulance) {
    return (
      <MainLayout>
        <div className="p-6 text-center text-muted-foreground">Viatura não encontrada.</div>
      </MainLayout>
    );
  }

  const statusOpt = VEHICLE_STATUS_OPTIONS.find(o => o.value === ambulance.status);

  return (
    <MainLayout>
      <div className="space-y-6 animate-fade-in p-4 md:p-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => navigate('/admin/ambulances')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="p-2.5 rounded-xl bg-primary/10 flex-shrink-0">
              <Truck className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-bold text-foreground truncate">{ambulance.code}</h1>
                {statusOpt && (
                  <Badge variant="outline" className={statusOpt.color}>{statusOpt.label}</Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {[ambulance.brand, ambulance.model, ambulance.year].filter(Boolean).join(' · ') || 'Detalhes da viatura'}
              </p>
            </div>
          </div>
          <Button onClick={() => setMaintenanceOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            <span className="hidden sm:inline">Manutenção</span>
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Gauge className="h-3.5 w-3.5" /> Km atual
              </div>
              <p className="text-xl font-bold">
                {ambulance.current_km != null ? ambulance.current_km.toLocaleString('pt-BR') : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <DollarSign className="h-3.5 w-3.5" /> Total gasto
              </div>
              <p className="text-xl font-bold">R$ {totalCost.toFixed(2)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Wrench className="h-3.5 w-3.5" /> Manutenções
              </div>
              <p className="text-xl font-bold">{logs.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Alertas
              </div>
              <p className="text-xl font-bold">
                {alerts.length}
                {alerts.some(a => a.severity === 'overdue') && (
                  <span className="text-destructive text-sm ml-2">
                    ({alerts.filter(a => a.severity === 'overdue').length} venc.)
                  </span>
                )}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-yellow-600" /> Alertas ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {alerts.map((a, i) => (
                <div
                  key={i}
                  className={`flex items-start gap-2 p-3 rounded-lg border ${
                    a.severity === 'overdue'
                      ? 'bg-destructive/5 border-destructive/20'
                      : 'bg-yellow-500/5 border-yellow-500/20'
                  }`}
                >
                  <AlertTriangle className={`h-4 w-4 mt-0.5 ${a.severity === 'overdue' ? 'text-destructive' : 'text-yellow-600'}`} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {a.title}
                      {a.category && <span className="text-muted-foreground"> — {getCategoryLabel(a.category)}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">{a.detail}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Tabs */}
        <Tabs defaultValue="info" className="space-y-4">
          <TabsList className="grid grid-cols-3 w-full lg:w-auto">
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="reports">Relatório</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Dados da viatura</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <Info icon={Hash} label="Placa" value={ambulance.plate} />
                <Info icon={Truck} label="Marca" value={ambulance.brand} />
                <Info icon={Truck} label="Modelo" value={ambulance.model} />
                <Info icon={CalendarDays} label="Ano" value={ambulance.year?.toString()} />
                <Info icon={Truck} label="Tipo" value={ambulance.vehicle_type} />
                <Info icon={Fuel} label="Km/litro" value={ambulance.km_per_liter?.toString()} />
                <Info icon={Calendar} label="Licenciamento" value={ambulance.licensing_expiry ? formatBR(ambulance.licensing_expiry, 'dd/MM/yyyy') : null} />
                <Info icon={Calendar} label="Seguro" value={ambulance.insurance_expiry ? formatBR(ambulance.insurance_expiry, 'dd/MM/yyyy') : null} />
                <Info icon={Calendar} label="Extintor" value={ambulance.extinguisher_expiry ? formatBR(ambulance.extinguisher_expiry, 'dd/MM/yyyy') : null} />
              </CardContent>
              {ambulance.notes && (
                <CardContent className="border-t">
                  <p className="text-xs text-muted-foreground mb-1">Observações</p>
                  <p className="text-sm whitespace-pre-wrap">{ambulance.notes}</p>
                </CardContent>
              )}
            </Card>

            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Última manutenção</CardTitle></CardHeader>
                <CardContent>
                  {lastService ? (
                    <div className="space-y-1.5 text-sm">
                      <Badge variant="outline">{getCategoryLabel(lastService.category)}</Badge>
                      <p className="font-medium">{lastService.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatBR(lastService.maintenance_date, 'dd/MM/yyyy')}
                        {lastService.km_at_service != null && ` · ${lastService.km_at_service.toLocaleString('pt-BR')} km`}
                        {lastService.cost != null && ` · R$ ${Number(lastService.cost).toFixed(2)}`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Nenhuma manutenção registrada.</p>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-base">Próxima prevista</CardTitle></CardHeader>
                <CardContent>
                  {nextService ? (
                    <div className="space-y-1.5 text-sm">
                      <Badge variant="outline">{getCategoryLabel(nextService.category)}</Badge>
                      <p className="text-xs text-muted-foreground">
                        {nextService.next_service_date && `Data: ${formatBR(nextService.next_service_date, 'dd/MM/yyyy')}`}
                        {nextService.next_service_km != null && ` · ${nextService.next_service_km.toLocaleString('pt-BR')} km`}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Sem revisão prevista.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="history">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Histórico ({logs.length})</span>
                  <Button size="sm" variant="outline" className="gap-2" onClick={() => setMaintenanceOpen(true)}>
                    <Plus className="h-4 w-4" /> Nova
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Nenhum registro.</p>
                ) : (
                  <div className="relative space-y-3">
                    {logs.map((log) => (
                      <div key={log.id} className="border-l-2 border-primary/20 pl-4 pb-3 relative">
                        <div className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-primary" />
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">{getCategoryLabel(log.category)}</Badge>
                          {log.maintenance_type && (
                            <Badge variant="secondary" className="text-xs">{getMaintenanceTypeLabel(log.maintenance_type)}</Badge>
                          )}
                          <span className="text-xs text-muted-foreground">{formatBR(log.maintenance_date, 'dd/MM/yyyy')}</span>
                        </div>
                        <p className="text-sm font-medium">{log.description}</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-1">
                          {log.km_at_service != null && <span>{log.km_at_service.toLocaleString('pt-BR')} km</span>}
                          {log.cost != null && <span className="font-semibold text-foreground">R$ {Number(log.cost).toFixed(2)}</span>}
                          {log.performed_by && <span>{log.performed_by}</span>}
                        </div>
                        {log.parts_replaced && (
                          <p className="text-xs text-muted-foreground mt-1">
                            <FileText className="h-3 w-3 inline mr-1" />Peças: {log.parts_replaced}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="reports" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Gasto por categoria</CardTitle></CardHeader>
              <CardContent>
                {costByCategory.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4 text-center">Sem dados.</p>
                ) : (
                  <div className="space-y-2">
                    {costByCategory.map(([cat, total]) => {
                      const pct = totalCost > 0 ? (total / totalCost) * 100 : 0;
                      return (
                        <div key={cat}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{getCategoryLabel(cat)}</span>
                            <span className="font-semibold">R$ {total.toFixed(2)}</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <MaintenanceHistory
        ambulanceId={ambulance.id}
        ambulanceCode={ambulance.code}
        open={maintenanceOpen}
        onOpenChange={setMaintenanceOpen}
      />
    </MainLayout>
  );
}

function Info({ icon: Icon, label, value }: { icon: any; label: string; value: string | null | undefined }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-0.5">
        <Icon className="h-3 w-3" />{label}
      </div>
      <p className="text-sm font-medium">{value || '—'}</p>
    </div>
  );
}
