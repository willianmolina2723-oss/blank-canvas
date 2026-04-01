import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BUCKET = 'app-assets';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autorizado' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Token inválido' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const contentType = req.headers.get('content-type') || '';

    // Handle FormData (file upload)
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const transportId = formData.get('transport_id') as string | null;
      const eventId = formData.get('event_id') as string | null;
      const photoType = formData.get('photo_type') as string | null;
      const action = formData.get('action') as string | null;

      if (action !== 'upload' || !file) {
        return new Response(JSON.stringify({ error: 'file e action=upload são obrigatórios' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Determine folder based on photo_type
      let folder: string;
      if (photoType === 'fuel_receipt' && eventId) {
        folder = `fuel-receipts/${eventId}`;
      } else if (transportId) {
        folder = `transport-photos/${transportId}`;
      } else {
        return new Response(JSON.stringify({ error: 'transport_id ou event_id é obrigatório' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const filePath = `${folder}/${Date.now()}.${ext}`;

      const arrayBuffer = await file.arrayBuffer();
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(filePath, arrayBuffer, {
          contentType: file.type || 'image/jpeg',
          upsert: false,
        });

      if (uploadError) {
        console.error('Upload error:', uploadError);
        return new Response(JSON.stringify({ error: uploadError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

      return new Response(JSON.stringify({ success: true, url: urlData.publicUrl, path: filePath }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle JSON body (list / delete)
    const body = await req.json();
    const { action, transport_id, path } = body;

    if (action === 'list' && transport_id) {
      const folder = `transport-photos/${transport_id}`;
      const { data: files, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(folder, { sortBy: { column: 'created_at', order: 'desc' } });

      if (listError) {
        console.error('List error:', listError);
        return new Response(JSON.stringify({ error: listError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const photos = (files || [])
        .filter((f: any) => !f.name.startsWith('.'))
        .map((f: any) => {
          const filePath = `${folder}/${f.name}`;
          const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
          return {
            name: f.name,
            path: filePath,
            url: urlData.publicUrl,
            created_at: f.created_at,
          };
        });

      return new Response(JSON.stringify({ photos }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete' && path) {
      const { error: deleteError } = await supabase.storage
        .from(BUCKET)
        .remove([path]);

      if (deleteError) {
        return new Response(JSON.stringify({ error: deleteError.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Ação não reconhecida' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('transport-photos error:', err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
