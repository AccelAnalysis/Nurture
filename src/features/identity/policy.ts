/**
 * Release 1 keeps verification available without inventing a universal policy.
 * Organization/Experience requirements may make verification a gate later.
 */
export const identityPolicy = {
  requireEmailVerificationBeforeOnboarding: false,
} as const;
