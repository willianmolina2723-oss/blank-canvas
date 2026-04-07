import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Star, Send } from 'lucide-react';
import { toast } from 'sonner';
import { differenceInDays, parseISO } from 'date-fns';

const DISMISSED_KEY = 'review_prompt_dismissed';

export function ReviewPromptDialog() {
  const { user, profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [content, setContent] = useState('');
  const [authorRole, setAuthorRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user || !profile) return;

    const dismissed = localStorage.getItem(DISMISSED_KEY);
    if (dismissed) return;

    const createdAt = (profile as any).created_at;
    if (!createdAt) return;

    const days = differenceInDays(new Date(), parseISO(createdAt));
    if (days < 7) return;

    // Check if user already submitted a review
    (async () => {
      const { data } = await (supabase.from as any)('reviews')
        .select('id')
        .eq('profile_id', (profile as any).id)
        .limit(1);

      if (!data || data.length === 0) {
        setOpen(true);
      }
    })();
  }, [user, profile]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
    setOpen(false);
  };

  const handleSubmit = async () => {
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
      toast.error('Erro ao enviar avaliação.');
    } else {
      toast.success('Avaliação enviada! Será publicada após aprovação.');
      localStorage.setItem(DISMISSED_KEY, new Date().toISOString());
      setOpen(false);
    }
    setSubmitting(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-warning fill-warning" />
            Como está sua experiência com o SAPH?
          </DialogTitle>
          <DialogDescription>
            Você está conosco há mais de 7 dias! Sua opinião é muito importante para nós.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
                    className={`h-7 w-7 ${
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
            />
            <p className="mt-1 text-xs text-muted-foreground">{content.length}/500</p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleSubmit} disabled={submitting || !content.trim()} className="gap-2">
              <Send className="h-4 w-4" />
              {submitting ? 'Enviando...' : 'Enviar Avaliação'}
            </Button>
            <Button variant="outline" onClick={handleDismiss}>
              Agora não
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Sua avaliação será publicada na página inicial após aprovação.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
