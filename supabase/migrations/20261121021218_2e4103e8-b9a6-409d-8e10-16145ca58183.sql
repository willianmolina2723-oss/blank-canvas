DROP POLICY IF EXISTS "Anyone can read config" ON public.app_config;
CREATE POLICY "Signed-in users can read rate settings" ON public.app_config
FOR SELECT TO authenticated
USING (auth.uid() IS NOT NULL AND (key LIKE 'default\_rate\_%' OR key LIKE 'deslocamento\_default\_%'));