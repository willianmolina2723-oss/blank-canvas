-- Add admin RLS policies for all event-related tables missing them

-- transport_records
CREATE POLICY "Admins can manage transport"
ON public.transport_records FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- nursing_evolutions
CREATE POLICY "Admins can manage nursing"
ON public.nursing_evolutions FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- medical_evolutions
CREATE POLICY "Admins can manage medical evolutions"
ON public.medical_evolutions FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- digital_signatures (admin can view all + insert)
CREATE POLICY "Admins can view signatures"
ON public.digital_signatures FOR SELECT TO authenticated
USING (is_admin() AND EXISTS (
  SELECT 1 FROM events e WHERE e.id = digital_signatures.event_id AND same_empresa(e.empresa_id)
));

CREATE POLICY "Admins can create signatures"
ON public.digital_signatures FOR INSERT TO authenticated
WITH CHECK (is_admin() AND EXISTS (
  SELECT 1 FROM events e WHERE e.id = digital_signatures.event_id AND same_empresa(e.empresa_id)
));

-- dispatch_reports
CREATE POLICY "Admins can manage dispatch reports"
ON public.dispatch_reports FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- dispatch_materials
CREATE POLICY "Admins can manage dispatch materials"
ON public.dispatch_materials FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- dispatch_medications
CREATE POLICY "Admins can manage dispatch medications"
ON public.dispatch_medications FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- dispatch_occurrences
CREATE POLICY "Admins can manage dispatch occurrences"
ON public.dispatch_occurrences FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));

-- patients (admin can also manage, not just view)
CREATE POLICY "Admins can manage patients"
ON public.patients FOR ALL TO authenticated
USING (is_admin() AND same_empresa(empresa_id))
WITH CHECK (is_admin() AND same_empresa(empresa_id));
