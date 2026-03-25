# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Idswyft is an open-source identity verification platform designed to provide developers with easy-to-integrate APIs for document verification. The platform focuses on being minimal, developer-friendly, and cost-effective while maintaining security and compliance standards.

## Core Architecture

This is an MVP project with the following key components:

### Identity Verification Pipeline
- **Document Processing**: OCR extraction using Tesseract for government-issued IDs (passport, driver's license, national ID)
- **Authenticity Checks**: OpenCV-based image quality and tampering detection
- **Face Recognition**: Optional selfie matching against document photos
- **Verification States**: `pending`, `verified`, `failed`, `manual_review`
- **Fallback Integration**: Optional paid API integration (Persona/Onfido) for high-risk cases

### API Architecture
- RESTful API endpoints for verification workflows
- API key management system for developer authentication
- Webhook system for real-time verification status updates
- Rate limiting and abuse protection mechanisms
- Sandbox environment for developer testing

### Data Storage & Security
- Encrypted file storage for documents and selfies (local or S3-compatible)
- GDPR/CCPA compliant data handling with retention policies
- HTTPS-only communication
- Role-based access control for admin dashboard

### Admin Dashboard
- Minimal web interface for monitoring verification requests
- Manual review capabilities for flagged documents
- Search and filter functionality by verification status
- Export capabilities for compliance reporting

## Architectural Invariant: Deterministic Decisions

**All comparison and decision logic must be deterministic and fully auditable.** No LLM or probabilistic model may be used for any verification decision — only for OCR text extraction, which is isolated behind a provider interface.

- Gates use checksums, exact string matching, Levenshtein distance, cosine similarity with fixed thresholds
- Same inputs must always produce the same verification result
- LLMs may only read text from images (extraction) — never decide pass/fail/review
- The LLM provider interface is isolated in `providers/ocr/LLMFieldExtractor.ts` — it must never be imported or called from gate logic, cross-validation, liveness scoring, or face matching

## Key Requirements

Based on the project specifications, when implementing features ensure:

1. **Developer Integration**: API integration should take <30 minutes
2. **User Experience**: Verification process should be <3 steps
3. **Accuracy Target**: >90% document validation accuracy
4. **File Formats**: Support JPEG, PNG, PDF for document uploads
5. **Rate Limiting**: Implement per-user and per-developer request limits
6. **Webhook Retry**: Up to 3 retry attempts for failed webhook deliveries

## Development Priorities

The project is structured around these core implementation areas (see Specs/tasks.md for detailed checklist):

1. Database schema with proper indexing and triggers
2. Core API endpoints for document/selfie upload and status queries
3. OCR and document processing pipeline
4. Face recognition and liveness detection
5. Webhook notification system
6. Admin dashboard interface
7. Sandbox environment setup
8. Security and compliance implementation

## Technical Stack Considerations

- **Backend**: Node.js or Python (as specified in PRD)
- **Database**: PostgreSQL or SQLite
- **OCR**: Tesseract integration
- **Computer Vision**: OpenCV for image analysis
- **Face Recognition**: face_recognition library
- **Storage**: Local filesystem or S3-compatible storage
- **Deployment**: Cloud-ready architecture for self-hosting

## Compliance Notes

When working with personal data and document processing:
- All uploaded files must be encrypted at rest
- Implement proper data retention and deletion policies
- Ensure GDPR/CCPA compliance for data access requests
- Use HTTPS for all file serving and API communications
- Implement audit logging for verification activities