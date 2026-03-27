 import { useState, useEffect } from 'react';
 import { useParams, useNavigate } from 'react-router-dom';
 import { supabase } from '@/integrations/supabase/client';
 import { MainLayout } from '@/components/layout/MainLayout';
 import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
 import { Button } from '@/components/ui/button';
 import { Input } from '@/components/ui/input';
 import { Label } from '@/components/ui/label';
 import { Textarea } from '@/components/ui/textarea';
 import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
 import { Checkbox } from '@/components/ui/checkbox';
 import { Alert, AlertDescription } from '@/components/ui/alert';
 import { Badge } from '@/components/ui/badge';
 import { useToast } from '@/hooks/use-toast';
 import { useAuth } from '@/contexts/AuthContext';
 import { ArrowLeft, Save, Loader2, Clock, AlertCircle } from 'lucide-react';
import type { Event, Ambulance as AmbulanceType, EventStatus, Profile, AppRole } from '@/types/database';
 import { STATUS_LABELS, ROLE_LABELS } from '@/types/database';
 
 interface ProfileWithRoles extends Profile {
   roles: AppRole[];
 }
 
 interface EventForm {
   code: string;
   ambulance_id: string;
   location: string;
   description: string;
   status: EventStatus;
   departure_time: string;
   arrival_time: string;
 }
 
 export default function EventEdit() {
   const { id } = useParams<{ id: string }>();
   const navigate = useNavigate();
   const { isAdmin, isLoading: authLoading } = useAuth();
   const { toast } = useToast();
 
   const [form, setForm] = useState<EventForm>({
     code: '',
     ambulance_id: '',
     location: '',
     description: '',
     status: 'ativo',
     departure_time: '',
     arrival_time: '',
   });
  const [ambulances, setAmbulances] = useState<AmbulanceType[]>([]);
   const [profiles, setProfiles] = useState<ProfileWithRoles[]>([]);
   const [selectedParticipants, setSelectedParticipants] = useState<Record<string, AppRole | null>>({});
   const [currentParticipants, setCurrentParticipants] = useState<{ profile_id: string; role: AppRole }[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const [isSaving, setIsSaving] = useState(false);
   const [originalAmbulanceId, setOriginalAmbulanceId] = useState<string>('');
 
   useEffect(() => {
     if (!authLoading && !isAdmin) {
       navigate('/');
     }
   }, [isAdmin, authLoading, navigate]);
 
   useEffect(() => {
     if (id) {
       fetchData();
     }
   }, [id]);
 
   const fetchData = async () => {
     setIsLoading(true);
     try {
       // Fetch event
       const { data: eventData, error: eventError } = await supabase
         .from('events')
         .select('*')
         .eq('id', id)
         .single();
 
       if (eventError) throw eventError;
 
       setForm({
         code: eventData.code || '',
         ambulance_id: eventData.ambulance_id || '',
         location: eventData.location || '',
         description: eventData.description || '',
         status: eventData.status as EventStatus,
         departure_time: (eventData as any).departure_time ? (eventData as any).departure_time.slice(0, 16) : '',
         arrival_time: (eventData as any).arrival_time ? (eventData as any).arrival_time.slice(0, 16) : '',
       });
       setOriginalAmbulanceId(eventData.ambulance_id || '');
 
       // Fetch current participants
       const { data: participantsData } = await supabase
         .from('event_participants')
         .select('profile_id, role')
         .eq('event_id', id);
 
       if (participantsData) {
         setCurrentParticipants(participantsData as { profile_id: string; role: AppRole }[]);
         const participantMap: Record<string, AppRole | null> = {};
         participantsData.forEach(p => {
           participantMap[p.profile_id] = p.role as AppRole;
         });
         setSelectedParticipants(participantMap);
       }
 
       // Fetch ambulances
       const { data: ambulancesData } = await supabase
         .from('ambulances')
         .select('*')
         .order('code');
 
       setAmbulances((ambulancesData || []) as any);
 
       // Fetch profiles with roles
       const { data: profilesData } = await supabase
         .from('profiles')
         .select('*')
         .order('full_name');
 
       const { data: rolesData } = await supabase
         .from('user_roles')
         .select('*');
 
       const profilesWithRoles: ProfileWithRoles[] = ((profilesData || []) as any[]).map(profile => ({
         ...profile,
         roles: (rolesData || [])
           .filter(r => r.user_id === profile.user_id)
           .map(r => r.role as AppRole)
           .filter(r => r !== 'admin')
       }));
 
       setProfiles(profilesWithRoles.filter(p => p.roles.length > 0));
     } catch (error) {
       console.error('Error fetching data:', error);
       toast({
         title: 'Erro',
         description: 'Não foi possível carregar os dados.',
         variant: 'destructive',
       });
     } finally {
       setIsLoading(false);
     }
   };
 
   const handleAmbulanceChange = (value: string) => {
     setForm({ ...form, ambulance_id: value });
   };
 
   const handleDepartureChange = (value: string) => {
     setForm({ ...form, departure_time: value });
   };
 
   const handleArrivalChange = (value: string) => {
     setForm({ ...form, arrival_time: value });
   };
 
   const handleParticipantToggle = (profileId: string, role: AppRole) => {
     setSelectedParticipants(prev => {
       if (prev[profileId] === role) {
         const { [profileId]: _, ...rest } = prev;
         return rest;
       }
       return { ...prev, [profileId]: role };
     });
   };
 
    const handleSave = async () => {
      const errors: string[] = [];
      if (!form.code.trim()) errors.push('Código');
      if (!form.ambulance_id) errors.push('Viatura');
      if (!form.departure_time) errors.push('Início do evento');
      if (!form.arrival_time) errors.push('Término do evento');
      if (!form.location.trim()) errors.push('Local');
      if (!form.description.trim()) errors.push('Descrição');
      if (Object.keys(selectedParticipants).length === 0) errors.push('Pelo menos um participante');

      if (errors.length > 0) {
        toast({ title: 'Campos obrigatórios', description: `Preencha: ${errors.join(', ')}`, variant: 'destructive' });
        return;
      }
 
 
     setIsSaving(true);
     try {
       // Update event
       const { error: eventError } = await supabase
         .from('events')
         .update({
           code: form.code.trim(),
           ambulance_id: form.ambulance_id || null,
           location: form.location.trim() || null,
           description: form.description.trim() || null,
           status: form.status,
           departure_time: form.departure_time || null,
           arrival_time: form.arrival_time || null,
         })
         .eq('id', id);
 
       if (eventError) throw eventError;
 
       // Get current participants from DB
       const { data: existingParticipants } = await supabase
         .from('event_participants')
         .select('id, profile_id')
         .eq('event_id', id);
 
       const existingProfileIds = new Set((existingParticipants || []).map(p => p.profile_id));
       const newProfileIds = new Set(Object.keys(selectedParticipants));
 
       // Remove participants that are no longer selected
       const toRemove = (existingParticipants || []).filter(p => !newProfileIds.has(p.profile_id));
       if (toRemove.length > 0) {
         await supabase
           .from('event_participants')
           .delete()
           .in('id', toRemove.map(p => p.id));
       }
 
       // Add new participants
       const toAdd = Object.entries(selectedParticipants)
         .filter(([profileId]) => !existingProfileIds.has(profileId))
         .map(([profileId, role]) => ({
           event_id: id,
           profile_id: profileId,
           role: role!,
         }));
 
       if (toAdd.length > 0) {
         const { error: addError } = await supabase
           .from('event_participants')
           .insert(toAdd);
 
         if (addError) throw addError;
       }
 
       toast({
         title: 'Evento atualizado',
         description: 'As alterações foram salvas com sucesso.',
       });
 
       navigate(`/admin/events`);
     } catch (error: any) {
       console.error('Error saving event:', error);
       toast({
         title: 'Erro',
         description: error.message || 'Não foi possível salvar as alterações.',
         variant: 'destructive',
       });
     } finally {
       setIsSaving(false);
     }
   };
 
   if (authLoading || isLoading) {
     return (
       <MainLayout>
         <div className="flex items-center justify-center py-12">
           <Loader2 className="h-8 w-8 animate-spin text-primary" />
         </div>
       </MainLayout>
     );
   }
 
   const roleGroups = {
     medico: profiles.filter(p => p.roles.includes('medico')),
     enfermeiro: profiles.filter(p => p.roles.includes('enfermeiro')),
     tecnico: profiles.filter(p => p.roles.includes('tecnico')),
     condutor: profiles.filter(p => p.roles.includes('condutor')),
   };
 
   return (
     <MainLayout>
       <div className="space-y-6 max-w-4xl">
         {/* Header */}
         <div className="flex items-center gap-4">
           <Button variant="ghost" size="icon" onClick={() => navigate('/admin/events')}>
             <ArrowLeft className="h-5 w-5" />
           </Button>
           <div>
             <h1 className="text-2xl font-bold">Editar Evento</h1>
             <p className="text-muted-foreground">Modifique as informações do evento</p>
           </div>
         </div>
 
         {/* Form */}
         <Card>
           <CardHeader>
             <CardTitle>Informações do Evento</CardTitle>
             <CardDescription>Dados básicos do evento/chamado</CardDescription>
           </CardHeader>
           <CardContent className="space-y-4">
             <div className="grid gap-4 sm:grid-cols-2">
               <div className="space-y-2">
                 <Label htmlFor="code">Código <span className="text-destructive">*</span></Label>
                 <Input
                   id="code"
                   value={form.code}
                   onChange={(e) => setForm({ ...form, code: e.target.value })}
                 />
               </div>
 
               <div className="space-y-2">
                 <Label htmlFor="status">Status <span className="text-destructive">*</span></Label>
                 <Select
                   value={form.status}
                   onValueChange={(value) => setForm({ ...form, status: value as EventStatus })}
                 >
                   <SelectTrigger>
                     <SelectValue />
                   </SelectTrigger>
                   <SelectContent>
                     {Object.entries(STATUS_LABELS).map(([value, label]) => (
                       <SelectItem key={value} value={value}>{label}</SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
 
               <div className="space-y-2">
                  <Label htmlFor="ambulance">Viatura <span className="text-destructive">*</span></Label>
                 <Select
                   value={form.ambulance_id}
                   onValueChange={handleAmbulanceChange}
                 >
                    <SelectTrigger id="ambulance">
                      <SelectValue placeholder="Selecione uma viatura" />
                   </SelectTrigger>
                   <SelectContent>
                     {ambulances.map((amb) => (
                       <SelectItem key={amb.id} value={amb.id}>
                         <div className="flex items-center gap-2">
                           <span>{amb.code} - {amb.plate || 'Sem placa'}</span>
                           {amb.status === 'ocupada' && amb.id !== originalAmbulanceId && (
                             <Badge variant="secondary" className="ml-1 text-xs">Ocupada</Badge>
                           )}
                         </div>
                       </SelectItem>
                     ))}
                   </SelectContent>
                 </Select>
               </div>
 
 
               <div className="space-y-2">
                 <Label htmlFor="departure">Início do Evento <span className="text-destructive">*</span></Label>
                 <div className="relative">
                   <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                     id="departure"
                     type="datetime-local"
                     value={form.departure_time}
                     onChange={(e) => handleDepartureChange(e.target.value)}
                     className="pl-10"
                   />
                 </div>
               </div>
 
               <div className="space-y-2">
                 <Label htmlFor="arrival">Término do Evento <span className="text-destructive">*</span></Label>
                 <div className="relative">
                   <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                   <Input
                     id="arrival"
                     type="datetime-local"
                     value={form.arrival_time}
                     onChange={(e) => handleArrivalChange(e.target.value)}
                     className="pl-10"
                   />
                 </div>
               </div>
 
               <div className="space-y-2">
                 <Label htmlFor="location">Local <span className="text-destructive">*</span></Label>
                 <Input
                   id="location"
                   value={form.location}
                   onChange={(e) => setForm({ ...form, location: e.target.value })}
                   placeholder="Ex: Rua das Flores, 123"
                 />
               </div>
             </div>
 
             <div className="space-y-2">
               <Label htmlFor="description">Descrição <span className="text-destructive">*</span></Label>
               <Textarea
                 id="description"
                 value={form.description}
                 onChange={(e) => setForm({ ...form, description: e.target.value })}
                 placeholder="Descreva o chamado..."
                 rows={3}
               />
             </div>
           </CardContent>
         </Card>
 
         {/* Team Selection */}
         <Card>
           <CardHeader>
             <CardTitle>Equipe</CardTitle>
             <CardDescription>Selecione os profissionais para este evento</CardDescription>
           </CardHeader>
           <CardContent className="space-y-6">
             {Object.entries(roleGroups).map(([role, profilesInRole]) => (
               profilesInRole.length > 0 && (
                 <div key={role}>
                   <h4 className="font-medium mb-2">{ROLE_LABELS[role as AppRole]}</h4>
                   <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                     {profilesInRole.map((profile) => (
                       <label
                         key={profile.id}
                         className="flex items-center gap-2 p-2 rounded border cursor-pointer hover:bg-muted/50"
                       >
                         <Checkbox
                           checked={selectedParticipants[profile.id] === role}
                           onCheckedChange={() => handleParticipantToggle(profile.id, role as AppRole)}
                         />
                         <span className="text-sm">{profile.full_name}</span>
                       </label>
                     ))}
                   </div>
                 </div>
               )
             ))}
           </CardContent>
         </Card>
 
         {/* Actions */}
         <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/admin/events')}>
              Cancelar
            </Button>
           <Button onClick={handleSave} disabled={isSaving}>
             {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
             <Save className="mr-2 h-4 w-4" />
             Salvar Alterações
           </Button>
         </div>
       </div>
     </MainLayout>
   );
 }