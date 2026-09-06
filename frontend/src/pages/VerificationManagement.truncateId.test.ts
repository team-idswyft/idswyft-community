import { describe, it, expect } from 'vitest'
import { truncateId } from './VerificationManagement'

// Regression for the production crash on idswyft.app:
//   TypeError: Cannot read properties of null (reading 'length')
//     at truncateId (VerificationManagement.tsx:136)
// verification_requests.user_id is null after GDPR anonymization (and absent on
// some handoff/reverification records), so truncateId must tolerate null/empty.
describe('truncateId', () => {
  it('returns a placeholder for null/undefined/empty instead of throwing', () => {
    expect(truncateId(null)).toBe('—')
    expect(truncateId(undefined)).toBe('—')
    expect(truncateId('')).toBe('—')
  })

  it('returns short ids unchanged', () => {
    expect(truncateId('abc123')).toBe('abc123')
  })

  it('truncates long ids to head...tail', () => {
    expect(truncateId('550e8400-e29b-41d4-a716-446655440000')).toBe('550e84...0000')
  })
})
