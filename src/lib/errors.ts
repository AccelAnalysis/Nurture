export class FeatureUnavailableError extends Error {
  constructor(feature: string) {
    super(
      `${feature} is not connected yet. You can review this workflow in the demo; no live changes have been made.`,
    );
    this.name = 'FeatureUnavailableError';
  }
}
export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code);
    if (['auth/invalid-credential', 'auth/user-not-found', 'auth/wrong-password'].includes(code))
      return 'The email or password could not be verified.';
    if (code === 'auth/email-already-in-use' || code === 'auth/credential-already-in-use')
      return 'This email already has an account. Sign in instead; trial data will not be merged automatically.';
    if (code === 'auth/operation-not-allowed')
      return 'This sign-in method is not enabled for this Firebase project.';
    if (code === 'auth/too-many-requests') return 'Too many attempts. Please try again later.';
    if (code === 'auth/network-request-failed') return 'A network connection is needed. Please try again.';
    if (code === 'permission-denied') return 'You do not have permission to access this data.';
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
