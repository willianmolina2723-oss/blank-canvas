import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify caller is super_admin
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Não autorizado')
    const { data: { user } } = await supabaseAdmin.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('Não autorizado')
    const { data: sa } = await supabaseAdmin.from('super_admins').select('id').eq('user_id', user.id).maybeSingle()
    if (!sa) throw new Error('Apenas super admins podem executar correções de segurança')

    const sql = `
      -- 1. Admin RLS for event-related tables
      DROP POLICY IF EXISTS "Admins can manage transport" ON public.transport_records;
      CREATE POLICY "Admins can manage transport" ON public.transport_records FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can manage nursing" ON public.nursing_evolutions;
      CREATE POLICY "Admins can manage nursing" ON public.nursing_evolutions FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can manage medical evolutions" ON public.medical_evolutions;
      CREATE POLICY "Admins can manage medical evolutions" ON public.medical_evolutions FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can manage dispatch reports" ON public.dispatch_reports;
      CREATE POLICY "Admins can manage dispatch reports" ON public.dispatch_reports FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can manage dispatch materials" ON public.dispatch_materials;
      CREATE POLICY "Admins can manage dispatch materials" ON public.dispatch_materials FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can manage dispatch medications" ON public.dispatch_medications;
      CREATE POLICY "Admins can manage dispatch medications" ON public.dispatch_medications FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can manage dispatch occurrences" ON public.dispatch_occurrences;
      CREATE POLICY "Admins can manage dispatch occurrences" ON public.dispatch_occurrences FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      DROP POLICY IF EXISTS "Admins can view signatures" ON public.digital_signatures;
      CREATE POLICY "Admins can view signatures" ON public.digital_signatures FOR SELECT TO authenticated
      USING (is_admin() AND EXISTS (
        SELECT 1 FROM events e WHERE e.id = digital_signatures.event_id AND same_empresa(e.empresa_id)
      ));

      DROP POLICY IF EXISTS "Admins can create signatures" ON public.digital_signatures;
      CREATE POLICY "Admins can create signatures" ON public.digital_signatures FOR INSERT TO authenticated
      WITH CHECK (is_admin() AND EXISTS (
        SELECT 1 FROM events e WHERE e.id = digital_signatures.event_id AND same_empresa(e.empresa_id)
      ));

      DROP POLICY IF EXISTS "Admins can manage patients" ON public.patients;
      CREATE POLICY "Admins can manage patients" ON public.patients FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      -- 2. Fix user_roles cross-empresa escalation
      DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
      CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated
      USING (is_admin() AND same_empresa(empresa_id))
      WITH CHECK (is_admin() AND same_empresa(empresa_id));

      -- 3. Fix profiles_safe view - remove pin_code, remove SECURITY DEFINER
      DROP VIEW IF EXISTS public.profiles_safe;
      CREATE VIEW public.profiles_safe AS
      SELECT 
        id, user_id, full_name, email, phone, professional_id,
        avatar_url, empresa_id, must_change_password,
        deleted_at, deleted_by, created_at, updated_at
      FROM profiles;

      -- 4. Fix checklist-videos storage policies
      DROP POLICY IF EXISTS "Auth delete videos" ON storage.objects;
      CREATE POLICY "Auth delete videos" ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'checklist-videos' AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR is_admin()
        )
      );

      -- 5. Make checklist-videos bucket private
      UPDATE storage.buckets SET public = false WHERE id = 'checklist-videos';

      -- Add SELECT policy requiring participant or admin
      DROP POLICY IF EXISTS "Auth view videos" ON storage.objects;
      CREATE POLICY "Auth view videos" ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'checklist-videos' AND (
          (storage.foldername(name))[1] = auth.uid()::text
          OR is_admin()
        )
      );
    `

    const { error } = await supabaseAdmin.rpc('exec_sql', { sql_text: sql })
    
    // If rpc doesn't exist, we return the SQL for manual execution
    if (error) {
      return new Response(JSON.stringify({ 
        success: false,
        message: 'Execute o SQL manualmente no SQL Editor do Supabase',
        sql 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
