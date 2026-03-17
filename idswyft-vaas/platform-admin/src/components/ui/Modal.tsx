import React, { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  showCloseButton?: boolean;
  closeOnOverlayClick?: boolean;
  closeOnEscape?: boolean;
  className?: string;
}

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
  '2xl': 'max-w-6xl',
  full: 'max-w-full mx-4'
};

export default function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = 'md',
  showCloseButton = true,
  closeOnOverlayClick = true,
  closeOnEscape = true,
  className = ''
}: ModalProps) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (closeOnEscape && event.key === 'Escape') {
      onClose();
    }
  }, [closeOnEscape, onClose]);

  const handleOverlayClick = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose();
    }
  }, [closeOnOverlayClick, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';

    const modalContainer = document.querySelector('[role="dialog"]');
    if (modalContainer) {
      (modalContainer as HTMLElement).focus();
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[120] overflow-y-auto bg-slate-950/72 backdrop-blur-sm"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
      tabIndex={-1}
    >
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className={`
            relative w-full ${sizeClasses[size]} max-h-[90vh]
            bg-slate-900 rounded-2xl shadow-2xl transform transition-all duration-300
            flex flex-col border border-white/10 text-slate-100
            ${className}
          `}
          onClick={(e) => e.stopPropagation()}
        >
          {(title || showCloseButton) && (
            <div className="flex items-center justify-between p-6 border-b border-white/10 flex-shrink-0 bg-slate-900 rounded-t-2xl">
              {title && (
                <div className="flex items-center space-x-3">
                  <div className="w-1 h-6 bg-gradient-to-b from-cyan-400 to-cyan-600 rounded-full"></div>
                  <h2 id="modal-title" className="text-xl font-semibold text-slate-100 tracking-tight">
                    {title}
                  </h2>
                </div>
              )}
              {showCloseButton && (
                <button
                  onClick={onClose}
                  className="p-2.5 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all duration-200 border border-transparent hover:border-white/10"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>
          )}

          <div className={`overflow-y-auto flex-1 bg-slate-900 ${title || showCloseButton ? "p-6" : "p-0"} ${!title && !showCloseButton ? "rounded-2xl" : "rounded-b-2xl"}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmVariant = "danger"
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  confirmVariant?: 'primary' | 'danger' | 'warning';
}) {
  const confirmButtonClass = {
    primary: 'px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold rounded-lg transition-all duration-200',
    danger: 'px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-semibold rounded-lg transition-all duration-200',
    warning: 'px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg transition-all duration-200'
  }[confirmVariant];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="sm">
      <div className="space-y-6">
        <div className="bg-slate-800 rounded-lg p-4 border border-white/10">
          <p className="text-slate-300 leading-relaxed">{message}</p>
        </div>

        <div className="flex justify-end space-x-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-slate-200 bg-slate-800 hover:bg-slate-700 font-medium rounded-lg transition-all duration-200 border border-white/10"
          >
            {cancelText}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={confirmButtonClass}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </Modal>
  );
}
