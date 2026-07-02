// Shared verification-page types, used by both the real verification pages
// (UserVerificationPage / MobileVerificationPage) and the Page Builder preview.
// This is the canonical shape; the verification pages receive a PARTIAL of
// PageBuilderConfig from the API, so consumers should accept
// Partial<PageBuilderConfig> and fall back for unset fields.

export interface PageBuilderConfig {
  headerTitle: string
  headerSubtitle: string
  showPoweredBy: boolean
  theme: 'dark' | 'light'
  backgroundColor: string
  cardBackgroundColor: string
  textColor: string
  accentColor: string
  mutedTextColor: string
  borderColor: string
  fontFamily: 'dm-sans' | 'inter' | 'system'
  steps: {
    front: { enabled: boolean; label: string }
    back: { enabled: boolean; label: string }
    liveness: { enabled: boolean; label: string }
  }
  completionTitle: string
  completionMessage: string
  showConfetti: boolean
}

export interface PageBranding {
  logo_url: string | null
  accent_color: string | null
  company_name: string | null
}
