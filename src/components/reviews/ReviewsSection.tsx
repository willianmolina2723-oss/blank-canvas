import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, Send, MessageSquarePlus } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface Review {
  id: string;
  author_name: string;
  author_role: string | null;
  rating: number;
  content: string;
  created_at: string;
}

export default function ReviewsSection() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const { user, profile } = useAuth();

  useEffect(() => {
    fetchReviews();
  }, []);

  const fetchReviews = async () => {
    const { data, error } = await (supabase.from as any)('reviews')
      .select('id, author_name, author_role, rating, content, created_at')
      .eq('approved', true)
      .order('created_at', { ascending: false })
      .limit(6);

    if (!error && data) {
      setReviews(data);
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (!content.trim()) {
      toast.error('Por favor, escreva sua avaliação.');
      return;
    }

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
      toast.error('Erro ao enviar avaliação. Tente novamente.');
    } else {
      toast.success('Avaliação enviada! Ela será exibida após aprovação de um administrador.');
      setContent('');
      setAuthorRole('');
      setRating(5);
      setShowForm(false);
    }
    setSubmitting(false);
  };

  return (
    <section className="border-t border-border/50 py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <span className="mb-2 inline-block text-sm font-semibold uppercase tracking-wider text-primary">
            Avaliações
          </span>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            O que nossos clientes dizem
          </h2>
          <p className="mt-4 text-muted-foreground">
            Avaliações reais de profissionais que utilizam o SAPH no dia a dia.
          </p>
        </div>

        {/* Reviews Grid */}
        {!loading && reviews.length > 0 && (
          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => (
              <Card key={review.id} className="border-border/50">
                <CardContent className="flex flex-col gap-4 p-8">
                  <div className="flex gap-1">
                    {[...Array(5)].map((_, j) => (
                      <Star
                        key={j}
                        className={`h-4 w-4 ${j < review.rating ? 'fill-warning text-warning' : 'text-muted-foreground/30'}`}
                      />
                    ))}
                  </div>
                  <blockquote className="flex-1 text-sm leading-relaxed italic text-muted-foreground">
                    "{review.content}"
                  </blockquote>
                  <div className="border-t border-border/50 pt-4">
                    <p className="text-sm font-semibold">{review.author_name}</p>
                    {review.author_role && (
                      <p className="text-xs text-muted-foreground">{review.author_role}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {!loading && reviews.length === 0 && (
          <div className="mt-16 text-center text-muted-foreground">
            <p>Ainda não há avaliações publicadas. Seja o primeiro!</p>
          </div>
        )}

        {/* Write Review CTA / Form */}
        <div className="mt-12 flex justify-center">
          {user ? (
            showForm ? (
              <Card className="w-full max-w-lg border-primary/20">
                <CardContent className="p-6">
                  <h3 className="mb-4 text-lg font-semibold">Escreva sua avaliação</h3>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Star Rating */}
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
                        Seu cargo / função <span className="text-muted-foreground">(opcional)</span>
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
                        required
                      />
                      <p className="mt-1 text-xs text-muted-foreground">{content.length}/500</p>
                    </div>

                    <div className="flex gap-3">
                      <Button type="submit" disabled={submitting} className="gap-2">
                        <Send className="h-4 w-4" />
                        {submitting ? 'Enviando...' : 'Enviar Avaliação'}
                      </Button>
                      <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                        Cancelar
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Sua avaliação será publicada após aprovação de um administrador.
                    </p>
                  </form>
                </CardContent>
              </Card>
            ) : (
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowForm(true)}
              >
                <MessageSquarePlus className="h-4 w-4" />
                Escrever Avaliação
              </Button>
            )
          ) : (
            <p className="text-sm text-muted-foreground">
              <a href="/auth" className="font-medium text-primary hover:underline">
                Faça login
              </a>{' '}
              para deixar sua avaliação.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
