import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Star, Send, MessageSquarePlus } from 'lucide-react';
import { toast } from 'sonner';

interface UserReview {
  id: string;
  rating: number;
  content: string;
  approved: boolean;
  created_at: string;
}

export function SettingsReviewSection() {
  const { profile } = useAuth();
  const [existingReview, setExistingReview] = useState<UserReview | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile) fetchReview();
  }, [profile]);

  const fetchReview = async () => {
    const { data } = await (supabase.from as any)('reviews')
      .select('id, rating, content, approved, created_at')
      .eq('profile_id', (profile as any).id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setExistingReview(data[0]);
    }
    setLoading(false);
  };

  const handleSubmit = async () => {
    if (!profile || !content.trim()) return;

    setSubmitting(true);
    const { error } = await (supabase.from as any)('reviews').insert({
      profile_id: (profile as any).id,
      empresa_id: (profile as any).empresa_id,
      author_name: (profile as any).full_name,
      author_role: authorRole.trim() || null,
      rating,
      content: content.trim(),
    });

    if (error) {
      toast.error('Erro ao enviar avaliação.');
    } else {
      toast.success('Avaliação enviada! Será publicada após aprovação.');
      setContent('');
      setAuthorRole('');
      setRating(5);
      setShowForm(false);
      fetchReview();
    }
    setSubmitting(false);
  };

  if (loading) return null;

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold flex items-center gap-2">
        <Star className="h-5 w-5" />
        Avaliação do Sistema
      </h2>

      {existingReview ? (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex gap-0.5">
                {[...Array(5)].map((_, j) => (
                  <Star
                    key={j}
                    className={`h-4 w-4 ${j < existingReview.rating ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
                  />
                ))}
              </div>
              <Badge variant={existingReview.approved ? 'default' : 'outline'}>
                {existingReview.approved ? 'Publicada' : 'Aguardando aprovação'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground italic">"{existingReview.content}"</p>
            <p className="text-xs text-muted-foreground">
              Sua avaliação {existingReview.approved ? 'está visível' : 'será visível'} na página inicial após aprovação do administrador.
            </p>
          </CardContent>
        </Card>
      ) : showForm ? (
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium">Nota</label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    onClick={() => setRating(star)}
                    className="p-0.5 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-6 w-6 ${
                        star <= (hoverRating || rating)
                          ? 'fill-warning text-warning'
                          : 'text-muted-foreground/30'
                      }`}
                    />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">
                Cargo / função <span className="text-muted-foreground">(opcional)</span>
              </label>
              <Input
                placeholder="Ex: Enfermeira coordenadora"
                value={authorRole}
                onChange={(e) => setAuthorRole(e.target.value)}
                maxLength={100}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">Sua avaliação</label>
              <Textarea
                placeholder="Conte como o SAPH ajudou no seu dia a dia..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                maxLength={500}
                rows={4}
              />
              <p className="mt-1 text-xs text-muted-foreground">{content.length}/500</p>
            </div>
            <div className="flex gap-3">
              <Button onClick={handleSubmit} disabled={submitting || !content.trim()} className="gap-2">
                <Send className="h-4 w-4" />
                {submitting ? 'Enviando...' : 'Enviar Avaliação'}
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Sua avaliação será publicada após aprovação.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="pt-6 flex flex-col items-center gap-3">
            <p className="text-sm text-muted-foreground">
              Ajude-nos a melhorar! Deixe sua avaliação sobre o SAPH.
            </p>
            <Button variant="outline" className="gap-2" onClick={() => setShowForm(true)}>
              <MessageSquarePlus className="h-4 w-4" />
              Escrever Avaliação
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
