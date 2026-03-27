import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Loader2, UserPlus, Pencil, Filter, CreditCard, Mail, IdCard } from 'lucide-react';
import { useReadOnly } from '@/hooks/useReadOnly';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CreateUserDialog } from './CreateUserDialog';
import { EditUserDialog } from './EditUserDialog';
import { BadgePreviewDialog } from './BadgePreviewDialog';
import { UserAccessActions } from './UserAccessActions';
import { useDebounce } from '@/hooks/useDebounce';
import type { Profile, AppRole } from '@/types/database';
import { ROLE_LABELS } from '@/types/database';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';

interface ProfileWithRoles extends Profile {
  roles: AppRole[];
}

const PAGE_SIZE = 20;

export function UserManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [editingUser, setEditingUser] = useState<ProfileWithRoles | null>(null);
  const [badgePreviewUser, setBadgePreviewUser] = useState<ProfileWithRoles | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [page, setPage] = useState(0);
  const [deletedUserIds, setDeletedUserIds] = useState<string[]>([]);
  const debouncedSearch = useDebounce(searchTerm, 300);
  const queryClient = useQueryClient();
  const { isReadOnly } = useReadOnly();

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', debouncedSearch, roleFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('profiles')
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .order('full_name');

      if (debouncedSearch) {
        query = query.or(`full_name.ilike.%${debouncedSearch}%,email.ilike.%${debouncedSearch}%`);
      }

      const from = page * PAGE_SIZE;
      query = query.range(from, from + PAGE_SIZE - 1);

      const { data: profilesData, error: profilesError, count } = await query;
      if (profilesError) throw profilesError;

      const { data: rolesData, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');
      if (rolesError) throw rolesError;

      const profilesWithRoles: ProfileWithRoles[] = ((profilesData || []) as any[]).map((profile) => ({
        ...profile,
        roles: (rolesData || [])
          .filter((roleRow) => roleRow.user_id === profile.user_id)
          .map((roleRow) => roleRow.role as AppRole),
      }));

      const filtered = roleFilter === 'all'
        ? profilesWithRoles
        : roleFilter === 'sem_funcao'
          ? profilesWithRoles.filter((profile) => profile.roles.length === 0)
          : profilesWithRoles.filter((profile) => profile.roles.includes(roleFilter as AppRole));

      return { profiles: filtered, totalCount: count || 0 };
    },
    staleTime: 30_000,
  });

  const profiles = useMemo(
    () => (data?.profiles || []).filter((profile) => !deletedUserIds.includes(profile.user_id)),
    [data?.profiles, deletedUserIds],
  );
  const totalCount = data?.totalCount || 0;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);
  const userIds = useMemo(() => profiles.map((profile) => profile.user_id), [profiles]);

  const { data: accessStatus = {}, isLoading: isLoadingAccessStatus } = useQuery({
    queryKey: ['admin-user-access-status', userIds],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data: result, error } = await supabase.functions.invoke('manage-user', {
        body: {
          action: 'list',
          user_ids: userIds,
        },
      });

      if (error) throw error;
      if (result?.error) throw new Error(result.error);

      return (result?.users || {}) as Record<string, { isSuspended: boolean }>;
    },
    staleTime: 30_000,
  });

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-users'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-user-access-status'] }),
    ]);
  };

  const handleUserDeleted = (userId: string) => {
    setDeletedUserIds((current) => (current.includes(userId) ? current : [...current, userId]));
    setEditingUser((current) => (current?.user_id === userId ? null : current));
    setBadgePreviewUser((current) => (current?.user_id === userId ? null : current));
  };

  const getRoleBadgeVariant = (role: AppRole): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (role) {
      case 'admin':
        return 'destructive';
      case 'medico':
        return 'default';
      case 'enfermeiro':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getInitials = (name: string) =>
    name.split(' ').map((part) => part[0]).slice(0, 2).join('').toUpperCase();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou email..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(0);
            }}
            className="pl-10"
          />
        </div>
        <Select
          value={roleFilter}
          onValueChange={(value) => {
            setRoleFilter(value);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-full sm:w-[200px]">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filtrar por função" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as funções</SelectItem>
            {(Object.entries(ROLE_LABELS) as [AppRole, string][]).map(([role, label]) => (
              <SelectItem key={role} value={role}>{label}</SelectItem>
            ))}
            <SelectItem value="sem_funcao">Sem função</SelectItem>
          </SelectContent>
        </Select>
        {!isReadOnly && (
          <Button onClick={() => setShowCreateDialog(true)} className="w-full sm:w-auto">
            <UserPlus className="h-4 w-4 mr-2" />
            Novo Usuário
          </Button>
        )}
      </div>

      {profiles.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhum usuário encontrado
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {profiles.map((profile) => {
            const suspended = accessStatus[profile.user_id]?.isSuspended ?? false;

            return (
              <Card key={profile.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-xl bg-muted flex items-center justify-center border-2 border-border overflow-hidden">
                        {profile.avatar_url ? (
                          <img src={profile.avatar_url} alt={profile.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <span className="text-lg font-black text-muted-foreground">
                            {getInitials(profile.full_name)}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-black text-sm uppercase text-foreground truncate">
                            {profile.full_name}
                          </span>
                          {suspended && <Badge variant="outline">Suspenso</Badge>}
                        </div>
                        {profile.email && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{profile.email}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 flex-wrap">
                          {profile.professional_id && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <IdCard className="h-3 w-3" />
                              {profile.professional_id}
                            </span>
                          )}
                          {profile.roles.length === 0 ? (
                            <Badge variant="outline" className="text-[10px]">Sem função</Badge>
                          ) : (
                            profile.roles.map((role) => (
                              <Badge key={role} variant={getRoleBadgeVariant(role)} className="text-[10px]">
                                {ROLE_LABELS[role]}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:flex-shrink-0 flex-wrap">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setBadgePreviewUser(profile)}
                        className="rounded-xl text-xs font-bold flex-1 sm:flex-initial"
                      >
                        <CreditCard className="h-3.5 w-3.5 mr-1" />
                        Crachá
                      </Button>
                      {!isReadOnly && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setEditingUser(profile)}
                            className="rounded-xl text-xs font-bold flex-1 sm:flex-initial"
                          >
                            <Pencil className="h-3.5 w-3.5 mr-1" />
                            Editar
                          </Button>
                          <UserAccessActions
                            user={profile}
                            isSuspended={suspended}
                            isLoading={isLoadingAccessStatus}
                            onChanged={invalidate}
                            onDeleted={handleUserDeleted}
                          />
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                onClick={() => setPage((currentPage) => Math.max(0, currentPage - 1))}
                className={page === 0 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, index) => {
              const pageNum = totalPages <= 5 ? index : Math.max(0, Math.min(page - 2, totalPages - 5)) + index;
              return (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    isActive={pageNum === page}
                    onClick={() => setPage(pageNum)}
                    className="cursor-pointer"
                  >
                    {pageNum + 1}
                  </PaginationLink>
                </PaginationItem>
              );
            })}
            <PaginationItem>
              <PaginationNext
                onClick={() => setPage((currentPage) => Math.min(totalPages - 1, currentPage + 1))}
                className={page >= totalPages - 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      <CreateUserDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onUserCreated={invalidate}
      />

      <EditUserDialog
        user={editingUser}
        open={!!editingUser}
        onOpenChange={(open) => {
          if (!open) setEditingUser(null);
        }}
        onUpdated={invalidate}
      />

      <BadgePreviewDialog
        data={badgePreviewUser ? {
          fullName: badgePreviewUser.full_name,
          roles: badgePreviewUser.roles,
          professionalId: badgePreviewUser.professional_id,
          avatarUrl: badgePreviewUser.avatar_url,
        } : null}
        open={!!badgePreviewUser}
        onOpenChange={(open) => {
          if (!open) setBadgePreviewUser(null);
        }}
      />
    </div>
  );
}
