import React, { useEffect } from 'react';
import { Shield } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '../contexts/OrganizationContext';
import { injectFonts } from '../theme';

interface BrandedHeaderProps {
  showSubtitle?: boolean;
  subtitle?: string;
  className?: string;
}

const BrandedHeader: React.FC<BrandedHeaderProps> = ({
  showSubtitle = true,
  subtitle,
  className = ""
}) => {
  useEffect(() => { injectFonts(); }, []);
  const { t } = useTranslation();
  const { branding, organizationName } = useOrganization();

  const companyName = branding?.company_name || organizationName || t('common.verificationPortal');
  const logoUrl = branding?.logo_url;

  return (
    <div className={`text-center ${className}`}>
      {/* Logo */}
      <div className="flex justify-center mb-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={companyName}
            className="h-12 max-w-full object-contain"
            onError={(e) => {
              console.warn('Failed to load organization logo:', logoUrl);
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
              const fallback = target.nextElementSibling as HTMLElement;
              if (fallback) {
                fallback.style.display = 'flex';
              }
            }}
          />
        ) : null}

        {/* Fallback icon */}
        <div
          className={`w-12 h-12 bg-gradient-to-br from-cyan-400 to-cyan-500 rounded-lg flex items-center justify-center ${logoUrl ? 'hidden' : 'flex'}`}
          style={{ display: logoUrl ? 'none' : 'flex' }}
        >
          <Shield className="w-6 h-6 text-white" />
        </div>
      </div>

      {/* Company Name */}
      <h1 className="text-2xl font-bold text-[#dde2ec] mb-2">
        {companyName}
      </h1>

      {/* Subtitle */}
      {showSubtitle && (
        <p className="text-[#8896aa] text-sm">
          {subtitle || t('common.identityVerification')}
        </p>
      )}
    </div>
  );
};

export default BrandedHeader;
