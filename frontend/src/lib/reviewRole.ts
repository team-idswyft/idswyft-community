export type ReviewRole = 'operator' | 'platform' | 'admin' | 'reviewer';

export function deriveReviewRole(x: {
  isOperator: boolean;
  analyticsOk: boolean;
  developersOk: boolean;
}): ReviewRole {
  if (x.isOperator) return 'operator';
  if (x.analyticsOk && x.developersOk) return 'platform';
  if (x.analyticsOk) return 'admin';
  return 'reviewer';
}
