-- Explicit RLS policies for all public tables.
-- service_role bypasses RLS, but explicit policies make the security posture
-- auditable and protect against accidental role misconfiguration.
-- Pattern: service_role gets ALL, authenticated gets developer-scoped read where applicable.

-- admin_users: admin-only, no authenticated access
DROP POLICY IF EXISTS service_role_all_admin_users ON public.admin_users;
CREATE POLICY service_role_all_admin_users ON public.admin_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- aml_screenings: tied to verification requests
DROP POLICY IF EXISTS service_role_all_aml_screenings ON public.aml_screenings;
CREATE POLICY service_role_all_aml_screenings ON public.aml_screenings FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_aml_screenings ON public.aml_screenings;
CREATE POLICY developers_own_aml_screenings ON public.aml_screenings FOR SELECT TO authenticated
  USING (verification_request_id IN (SELECT id FROM verification_requests WHERE developer_id = auth.uid()));

-- api_activity_logs: developer-scoped
DROP POLICY IF EXISTS service_role_all_api_activity_logs ON public.api_activity_logs;
CREATE POLICY service_role_all_api_activity_logs ON public.api_activity_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_api_activity_logs ON public.api_activity_logs;
CREATE POLICY developers_own_api_activity_logs ON public.api_activity_logs FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- api_keys: developer-scoped
DROP POLICY IF EXISTS service_role_all_api_keys ON public.api_keys;
CREATE POLICY service_role_all_api_keys ON public.api_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_api_keys ON public.api_keys;
CREATE POLICY developers_own_api_keys ON public.api_keys FOR ALL TO authenticated
  USING (developer_id = auth.uid()) WITH CHECK (developer_id = auth.uid());

-- batch_items: tied to batch_jobs
DROP POLICY IF EXISTS service_role_all_batch_items ON public.batch_items;
CREATE POLICY service_role_all_batch_items ON public.batch_items FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_batch_items ON public.batch_items;
CREATE POLICY developers_own_batch_items ON public.batch_items FOR SELECT TO authenticated
  USING (batch_id IN (SELECT id FROM batch_jobs WHERE developer_id = auth.uid()));

-- batch_jobs: developer-scoped
DROP POLICY IF EXISTS service_role_all_batch_jobs ON public.batch_jobs;
CREATE POLICY service_role_all_batch_jobs ON public.batch_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_batch_jobs ON public.batch_jobs;
CREATE POLICY developers_own_batch_jobs ON public.batch_jobs FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- compliance_rules: tied to rulesets
DROP POLICY IF EXISTS service_role_all_compliance_rules ON public.compliance_rules;
CREATE POLICY service_role_all_compliance_rules ON public.compliance_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_compliance_rules ON public.compliance_rules;
CREATE POLICY developers_own_compliance_rules ON public.compliance_rules FOR SELECT TO authenticated
  USING (ruleset_id IN (SELECT id FROM compliance_rulesets WHERE developer_id = auth.uid()));

-- compliance_rulesets: developer-scoped
DROP POLICY IF EXISTS service_role_all_compliance_rulesets ON public.compliance_rulesets;
CREATE POLICY service_role_all_compliance_rulesets ON public.compliance_rulesets FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_compliance_rulesets ON public.compliance_rulesets;
CREATE POLICY developers_own_compliance_rulesets ON public.compliance_rulesets FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- dedup_fingerprints: developer-scoped
DROP POLICY IF EXISTS service_role_all_dedup_fingerprints ON public.dedup_fingerprints;
CREATE POLICY service_role_all_dedup_fingerprints ON public.dedup_fingerprints FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_dedup_fingerprints ON public.dedup_fingerprints;
CREATE POLICY developers_own_dedup_fingerprints ON public.dedup_fingerprints FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- developer_otp_codes: sensitive, service-role only
DROP POLICY IF EXISTS service_role_all_developer_otp_codes ON public.developer_otp_codes;
CREATE POLICY service_role_all_developer_otp_codes ON public.developer_otp_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- developer_otp_rate_limits: sensitive, service-role only
DROP POLICY IF EXISTS service_role_all_developer_otp_rate_limits ON public.developer_otp_rate_limits;
CREATE POLICY service_role_all_developer_otp_rate_limits ON public.developer_otp_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- developers: own row only
DROP POLICY IF EXISTS service_role_all_developers ON public.developers;
CREATE POLICY service_role_all_developers ON public.developers FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_profile ON public.developers;
CREATE POLICY developers_own_profile ON public.developers FOR SELECT TO authenticated
  USING (id = auth.uid());

-- expiry_alerts: tied to verification requests
DROP POLICY IF EXISTS service_role_all_expiry_alerts ON public.expiry_alerts;
CREATE POLICY service_role_all_expiry_alerts ON public.expiry_alerts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_expiry_alerts ON public.expiry_alerts;
CREATE POLICY developers_own_expiry_alerts ON public.expiry_alerts FOR SELECT TO authenticated
  USING (verification_request_id IN (SELECT id FROM verification_requests WHERE developer_id = auth.uid()));

-- idempotency_keys: developer-scoped
DROP POLICY IF EXISTS service_role_all_idempotency_keys ON public.idempotency_keys;
CREATE POLICY service_role_all_idempotency_keys ON public.idempotency_keys FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_idempotency_keys ON public.idempotency_keys;
CREATE POLICY developers_own_idempotency_keys ON public.idempotency_keys FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- identity_vault: developer-scoped (sensitive)
DROP POLICY IF EXISTS service_role_all_identity_vault ON public.identity_vault;
CREATE POLICY service_role_all_identity_vault ON public.identity_vault FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_identity_vault ON public.identity_vault;
CREATE POLICY developers_own_identity_vault ON public.identity_vault FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- mobile_handoff_sessions: scoped via api_key ownership
DROP POLICY IF EXISTS service_role_all_mobile_handoff_sessions ON public.mobile_handoff_sessions;
CREATE POLICY service_role_all_mobile_handoff_sessions ON public.mobile_handoff_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_mobile_handoff_sessions ON public.mobile_handoff_sessions;
CREATE POLICY developers_own_mobile_handoff_sessions ON public.mobile_handoff_sessions FOR SELECT TO authenticated
  USING (api_key_id IN (SELECT id FROM api_keys WHERE developer_id = auth.uid()));

-- organization_threshold_settings: org-scoped
DROP POLICY IF EXISTS service_role_all_org_threshold_settings ON public.organization_threshold_settings;
CREATE POLICY service_role_all_org_threshold_settings ON public.organization_threshold_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

-- organizations: service-role only (admin managed)
DROP POLICY IF EXISTS service_role_all_organizations ON public.organizations;
CREATE POLICY service_role_all_organizations ON public.organizations FOR ALL TO service_role USING (true) WITH CHECK (true);

-- phone_otp_codes: sensitive, service-role only
DROP POLICY IF EXISTS service_role_all_phone_otp_codes ON public.phone_otp_codes;
CREATE POLICY service_role_all_phone_otp_codes ON public.phone_otp_codes FOR ALL TO service_role USING (true) WITH CHECK (true);

-- phone_otp_rate_limits: sensitive, service-role only
DROP POLICY IF EXISTS service_role_all_phone_otp_rate_limits ON public.phone_otp_rate_limits;
CREATE POLICY service_role_all_phone_otp_rate_limits ON public.phone_otp_rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- provider_metrics: service-role only (internal telemetry)
DROP POLICY IF EXISTS service_role_all_provider_metrics ON public.provider_metrics;
CREATE POLICY service_role_all_provider_metrics ON public.provider_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);

-- rate_limits: service-role only (internal)
DROP POLICY IF EXISTS service_role_all_rate_limits ON public.rate_limits;
CREATE POLICY service_role_all_rate_limits ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);

-- reverification_schedules: developer-scoped
DROP POLICY IF EXISTS service_role_all_reverification_schedules ON public.reverification_schedules;
CREATE POLICY service_role_all_reverification_schedules ON public.reverification_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_reverification_schedules ON public.reverification_schedules;
CREATE POLICY developers_own_reverification_schedules ON public.reverification_schedules FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- users: service-role only (end-users, not developers)
DROP POLICY IF EXISTS service_role_all_users ON public.users;
CREATE POLICY service_role_all_users ON public.users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- vault_share_links: developer-scoped
DROP POLICY IF EXISTS service_role_all_vault_share_links ON public.vault_share_links;
CREATE POLICY service_role_all_vault_share_links ON public.vault_share_links FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_vault_share_links ON public.vault_share_links;
CREATE POLICY developers_own_vault_share_links ON public.vault_share_links FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- verifiable_credentials: developer-scoped
DROP POLICY IF EXISTS service_role_all_verifiable_credentials ON public.verifiable_credentials;
CREATE POLICY service_role_all_verifiable_credentials ON public.verifiable_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_verifiable_credentials ON public.verifiable_credentials;
CREATE POLICY developers_own_verifiable_credentials ON public.verifiable_credentials FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- verification_contexts: tied to verification requests
DROP POLICY IF EXISTS service_role_all_verification_contexts ON public.verification_contexts;
CREATE POLICY service_role_all_verification_contexts ON public.verification_contexts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_verification_contexts ON public.verification_contexts;
CREATE POLICY developers_own_verification_contexts ON public.verification_contexts FOR SELECT TO authenticated
  USING (verification_id IN (SELECT id FROM verification_requests WHERE developer_id = auth.uid()));

-- verification_reviewers: developer-scoped
DROP POLICY IF EXISTS service_role_all_verification_reviewers ON public.verification_reviewers;
CREATE POLICY service_role_all_verification_reviewers ON public.verification_reviewers FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_verification_reviewers ON public.verification_reviewers;
CREATE POLICY developers_own_verification_reviewers ON public.verification_reviewers FOR SELECT TO authenticated
  USING (developer_id = auth.uid());

-- verification_risk_scores: tied to verification requests
DROP POLICY IF EXISTS service_role_all_verification_risk_scores ON public.verification_risk_scores;
CREATE POLICY service_role_all_verification_risk_scores ON public.verification_risk_scores FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_risk_scores ON public.verification_risk_scores;
CREATE POLICY developers_own_risk_scores ON public.verification_risk_scores FOR SELECT TO authenticated
  USING (verification_request_id IN (SELECT id FROM verification_requests WHERE developer_id = auth.uid()));

-- webhook_deliveries: developer-scoped via webhook
DROP POLICY IF EXISTS service_role_all_webhook_deliveries ON public.webhook_deliveries;
CREATE POLICY service_role_all_webhook_deliveries ON public.webhook_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_webhook_deliveries ON public.webhook_deliveries;
CREATE POLICY developers_own_webhook_deliveries ON public.webhook_deliveries FOR SELECT TO authenticated
  USING (webhook_id IN (SELECT id FROM webhooks WHERE developer_id = auth.uid()));

-- webhooks: developer-scoped
DROP POLICY IF EXISTS service_role_all_webhooks ON public.webhooks;
CREATE POLICY service_role_all_webhooks ON public.webhooks FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS developers_own_webhooks ON public.webhooks;
CREATE POLICY developers_own_webhooks ON public.webhooks FOR ALL TO authenticated
  USING (developer_id = auth.uid()) WITH CHECK (developer_id = auth.uid());
