import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatBR } from '@/utils/dateFormat';
import { parseISO } from 'date-fns';

const db = supabase as any;

interface Review {
  id: string;
  author_name: string;
  author_role: string | null;
  rating: number;
  content: string;
  approved: boolean;
  created_at: string;
  empresa_id: string | null;
}

export function ReviewManagement() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    setLoading(true);
    const { data, error } = await db
      .from('reviews')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setReviews(data);
    }
    setLoading(false);
  };

  const handleApprove = async (id: string) => {
    const { error } = await db.from('reviews').update({ approved: true }).eq('id', id);
    if (error) {
      toast.error('Erro ao aprovar avaliação');
    } else {
      toast.success('Avaliação aprovada e publicada na landing page!');
      fetchReviews();
    }
  };

  const handleReject = async (id: string) => {
    const { error } = await db.from('reviews').update({ approved: false }).eq('id', id);
    if (error) {
      toast.error('Erro ao rejeitar avaliação');
    } else {
      toast.success('Avaliação removida da landing page');
      fetchReviews();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await db.from('reviews').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir avaliação');
    } else {
      toast.success('Avaliação excluída');
      fetchReviews();
    }
  };

  const pendingReviews = reviews.filter(r => !r.approved);
  const approvedReviews = reviews.filter(r => r.approved);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending */}
      <div>
        <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
          Pendentes de Aprovação
          {pendingReviews.length > 0 && (
            <Badge variant="destructive">{pendingReviews.length}</Badge>
          )}
        </h3>
        {pendingReviews.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma avaliação pendente
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {pendingReviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      {/* Approved */}
      <div>
        <h3 className="text-lg font-semibold mb-3">
          Aprovadas ({approvedReviews.length})
        </h3>
        {approvedReviews.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              Nenhuma avaliação aprovada
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {approvedReviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewCard({
  review,
  onApprove,
  onReject,
  onDelete,
}: {
  review: Review;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">{review.author_name}</span>
              {review.author_role && (
                <span className="text-xs text-muted-foreground">• {review.author_role}</span>
              )}
              <Badge variant={review.approved ? 'default' : 'outline'}>
                {review.approved ? 'Aprovada' : 'Pendente'}
              </Badge>
            </div>
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, j) => (
                <Star
                  key={j}
                  className={`h-4 w-4 ${j < review.rating ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
                />
              ))}
            </div>
            <p className="text-sm text-muted-foreground italic">"{review.content}"</p>
            <p className="text-xs text-muted-foreground">
              {formatBR(parseISO(review.created_at), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {!review.approved ? (
              <Button size="sm" onClick={() => onApprove(review.id)} className="gap-1">
                <CheckCircle className="h-3.5 w-3.5" /> Aprovar
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => onReject(review.id)} className="gap-1">
                <XCircle className="h-3.5 w-3.5" /> Remover
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => onDelete(review.id)} className="gap-1 text-destructive hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
