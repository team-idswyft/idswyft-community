/**
 * SAML Service
 *
 * Implements SAML 2.0 Service Provider (SP) functionality.
 * Generates auth requests, processes callbacks, and manages
 * organization-level SSO configuration.
 */

import { SAML } from '@node-saml/node-saml';
import { config } from '../config/index.js';
import { vaasSupabase } from '../config/database.js';

// ─── Types ───────────────────────────────────────────────

export interface SAMLConfig {
  id: string;
  organization_id: string;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_certificate: string;
  attribute_mapping: AttributeMapping;
  is_enabled: boolean;
  created_at: string;
}

export interface AttributeMapping {
  email?: string;
  first_name?: string;
  last_name?: string;
  [key: string]: string | undefined;
}

export interface SAMLProfile {
  email: string;
  first_name: string;
  last_name: string;
  name_id: string;
}

// ─── Constants ───────────────────────────────────────────

const SP_ENTITY_ID = process.env.SAML_SP_ENTITY_ID || 'https://app.idswyft.app/saml';
const SP_ACS_URL = process.env.SAML_ACS_URL || `${config.frontendUrl}/api/auth/saml/callback`;

// ─── Service Functions ───────────────────────────────────

/**
 * Get SAML configuration for an organization by slug.
 */
export async function getOrganizationSAMLConfig(
  orgSlug: string,
): Promise<{ config: SAMLConfig; organization_id: string; org_name: string } | null> {
  const { data: org, error: orgError } = await vaasSupabase
    .from('vaas_organizations')
    .select('id, name')
    .eq('slug', orgSlug)
    .single();

  if (orgError || !org) return null;

  const { data: ssoConfig, error } = await vaasSupabase
    .from('organization_sso_configs')
    .select('*')
    .eq('organization_id', org.id)
    .eq('is_enabled', true)
    .single();

  if (error || !ssoConfig) return null;

  return {
    config: ssoConfig as SAMLConfig,
    organization_id: org.id,
    org_name: org.name,
  };
}

/**
 * Get SAML config by organization ID.
 */
export async function getOrganizationSAMLConfigById(
  orgId: string,
): Promise<SAMLConfig | null> {
  const { data, error } = await vaasSupabase
    .from('organization_sso_configs')
    .select('*')
    .eq('organization_id', orgId)
    .single();

  if (error || !data) return null;
  return data as SAMLConfig;
}

/**
 * Create a SAML strategy instance for an organization.
 */
function createSAMLInstance(ssoConfig: SAMLConfig): SAML {
  return new SAML({
    entryPoint: ssoConfig.idp_sso_url,
    issuer: SP_ENTITY_ID,
    callbackUrl: SP_ACS_URL,
    idpCert: ssoConfig.idp_certificate,
    wantAssertionsSigned: true,
    wantAuthnResponseSigned: false,
  });
}

/**
 * Generate a SAML authentication request URL.
 * Redirects the user to their IdP for login.
 */
export async function generateAuthRequest(
  orgSlug: string,
): Promise<{ redirectUrl: string } | null> {
  const result = await getOrganizationSAMLConfig(orgSlug);
  if (!result) return null;

  const saml = createSAMLInstance(result.config);
  // Pass orgSlug as RelayState — the IdP echoes it back in the ACS POST,
  // avoiding cookies entirely (which fail on cross-origin POST due to SameSite).
  const url = await saml.getAuthorizeUrlAsync(orgSlug, undefined, {});

  return { redirectUrl: url };
}

/**
 * Process SAML callback (assertion consumer).
 * Validates the assertion and extracts user profile.
 */
export async function processCallback(
  samlResponse: string,
  orgId: string,
): Promise<SAMLProfile | null> {
  const ssoConfig = await getOrganizationSAMLConfigById(orgId);
  if (!ssoConfig) return null;

  const saml = createSAMLInstance(ssoConfig);

  try {
    const { profile } = await saml.validatePostResponseAsync({ SAMLResponse: samlResponse });

    if (!profile) return null;

    // Map IdP attributes to our profile using the configured attribute mapping
    const mapping = ssoConfig.attribute_mapping || {};

    const email = getAttributeValue(profile, mapping.email || 'email')
      || (profile as any).nameID
      || (profile as any).email;

    if (!email) return null;

    return {
      email: email.toLowerCase(),
      first_name: getAttributeValue(profile, mapping.first_name || 'firstName')
        || (profile as any).firstName
        || '',
      last_name: getAttributeValue(profile, mapping.last_name || 'lastName')
        || (profile as any).lastName
        || '',
      name_id: (profile as any).nameID || email,
    };
  } catch (err) {
    console.error('SAML assertion validation failed:', {
      orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Generate SP metadata XML for IdP configuration.
 */
export function generateSPMetadata(orgId: string): string {
  return `<?xml version="1.0"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${SP_ENTITY_ID}">
  <SPSSODescriptor AuthnRequestsSigned="false"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                             Location="${SP_ACS_URL}"
                             index="1" />
  </SPSSODescriptor>
  <Organization>
    <OrganizationName xml:lang="en">Idswyft</OrganizationName>
    <OrganizationDisplayName xml:lang="en">Idswyft Identity Verification</OrganizationDisplayName>
    <OrganizationURL xml:lang="en">https://idswyft.app</OrganizationURL>
  </Organization>
</EntityDescriptor>`;
}

/**
 * Save or update SSO configuration for an organization.
 */
export async function upsertSSOConfig(
  orgId: string,
  config: {
    idp_entity_id: string;
    idp_sso_url: string;
    idp_certificate: string;
    attribute_mapping?: AttributeMapping;
    is_enabled?: boolean;
  },
): Promise<SAMLConfig | null> {
  const { data, error } = await vaasSupabase
    .from('organization_sso_configs')
    .upsert({
      organization_id: orgId,
      idp_entity_id: config.idp_entity_id,
      idp_sso_url: config.idp_sso_url,
      idp_certificate: config.idp_certificate,
      attribute_mapping: config.attribute_mapping || {},
      is_enabled: config.is_enabled ?? false,
    }, { onConflict: 'organization_id' })
    .select()
    .single();

  if (error || !data) return null;
  return data as SAMLConfig;
}

/**
 * Delete SSO configuration for an organization.
 */
export async function deleteSSOConfig(orgId: string): Promise<boolean> {
  const { error } = await vaasSupabase
    .from('organization_sso_configs')
    .delete()
    .eq('organization_id', orgId);

  return !error;
}

// ─── Helpers ─────────────────────────────────────────────

function getAttributeValue(profile: any, attrName: string): string | null {
  if (!profile || !attrName) return null;

  // Try direct property
  if (profile[attrName]) return String(profile[attrName]);

  // Try in attributes object (common SAML format)
  if (profile.attributes && profile.attributes[attrName]) {
    const val = profile.attributes[attrName];
    return Array.isArray(val) ? val[0] : String(val);
  }

  return null;
}
