import React from 'react';
import { CreditCard, BookOpen, IdCard, ChevronRight } from 'lucide-react';

// Document types available per country. US always has all three;
// other countries show national_id only when supported in the format registry.
const DOCUMENT_TYPES = [
  {
    type: 'drivers_license',
    label: "Driver's License",
    description: 'Government-issued driving permit',
    icon: CreditCard,
  },
  {
    type: 'passport',
    label: 'Passport',
    description: 'International travel document',
    icon: BookOpen,
  },
  {
    type: 'national_id',
    label: 'National ID Card',
    description: 'Government-issued identity card',
    icon: IdCard,
  },
] as const;

// Countries that do NOT issue a separate national ID card
const NO_NATIONAL_ID = new Set(['US', 'CA', 'AU', 'NZ']);

interface DocumentTypeSelectorProps {
  countryCode: string;
  onSelect: (documentType: string) => void;
  onBack: () => void;
}

const DocumentTypeSelector: React.FC<DocumentTypeSelectorProps> = ({
  countryCode,
  onSelect,
  onBack,
}) => {
  const types = DOCUMENT_TYPES.filter(dt => {
    if (dt.type === 'national_id' && NO_NATIONAL_ID.has(countryCode)) return false;
    return true;
  });

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center mb-4">
        <IdCard className="w-6 h-6 text-blue-600 mr-3" />
        <h2 className="text-xl font-semibold text-gray-900">Select Document Type</h2>
      </div>
      <p className="text-gray-600 mb-6">
        Choose the type of identity document you will be verifying.
      </p>

      <div className="space-y-3">
        {types.map(dt => {
          const Icon = dt.icon;
          return (
            <button
              key={dt.type}
              onClick={() => onSelect(dt.type)}
              className="w-full flex items-center justify-between px-4 py-4 rounded-lg border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-left group"
            >
              <div className="flex items-center">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center mr-4">
                  <Icon className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{dt.label}</p>
                  <p className="text-sm text-gray-500">{dt.description}</p>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </button>
          );
        })}
      </div>

      <button
        onClick={onBack}
        className="mt-6 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        &larr; Change country
      </button>
    </div>
  );
};

export default DocumentTypeSelector;
