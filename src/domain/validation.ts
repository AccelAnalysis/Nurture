import type { Attribution } from './identity';
import type { ContactSequence, Survey } from './outreach';
export function safeReturnPath(value: string | null): string {
  const allowed = /^\/(app|org|invite|onboarding)(\/|\?|$)/;
  if (!value || value.length > 2048 || !allowed.test(value) || /[\\\u0000-\u001f\u007f]|%5c/i.test(value))
    return '/app';
  try {
    const url = new URL(value, 'https://nurture.invalid');
    return url.origin === 'https://nurture.invalid' && allowed.test(url.pathname)
      ? `${url.pathname}${url.search}`
      : '/app';
  } catch {
    return '/app';
  }
}
export function createAttribution(
  code: string,
  source = 'referral',
  campaign = '',
  now = new Date(),
): Attribution | null {
  if (!/^[A-Za-z0-9_-]{3,64}$/.test(code)) return null;
  return {
    referralCode: code,
    source: source.slice(0, 80),
    campaign: campaign.slice(0, 80),
    capturedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 30 * 86400000).toISOString(),
    verification: 'pending',
  };
}
export function validateSequence(sequence: ContactSequence): string | null {
  if (!sequence.name.trim() || sequence.name.length > 100)
    return 'Give this sequence a name of up to 100 characters.';
  if (!sequence.steps.length || sequence.steps.length > 20) return 'Add between 1 and 20 steps.';
  if (
    sequence.steps.some(
      (s, i, all) =>
        !s.name.trim() ||
        s.name.length > 100 ||
        !Number.isInteger(s.delayDays) ||
        s.delayDays < 0 ||
        s.delayDays > 365 ||
        (i > 0 && s.delayDays < all[i - 1].delayDays),
    )
  )
    return 'Steps need a name and whole-day offsets from 0 to 365 in ascending order.';
  if (new Set(sequence.steps.map((step) => step.id)).size !== sequence.steps.length)
    return 'Every step needs a unique identifier.';
  if (
    !Number.isInteger(sequence.frequencyCapPerDay) ||
    sequence.frequencyCapPerDay < 1 ||
    sequence.frequencyCapPerDay > 10
  )
    return 'Choose a daily cap between 1 and 10.';
  try {
    new Intl.DateTimeFormat('en', { timeZone: sequence.timeZone });
  } catch {
    return 'Enter a valid IANA time zone.';
  }
  if (
    ![sequence.quietHours.start, sequence.quietHours.end].every((value) =>
      /^([01]\d|2[0-3]):[0-5]\d$/.test(value),
    )
  )
    return 'Choose valid quiet-hour times.';
  if (sequence.status !== 'published' && sequence.enabled)
    return 'Only a published configuration can be enabled.';
  if (
    sequence.status === 'published' &&
    sequence.steps.some(
      (step) =>
        !step.templateId ||
        (step.kind === 'survey' && !step.surveyId) ||
        (step.kind === 'offer' && !step.offerId),
    )
  )
    return 'Connect a template to every published step, and a survey or offer where needed.';
  return null;
}
export function validateSurvey(survey: Survey): string | null {
  if (
    !survey.title.trim() ||
    survey.title.length > 160 ||
    !survey.questions.length ||
    survey.questions.length > 20
  )
    return 'Add a title of up to 160 characters and between 1 and 20 questions.';
  if (survey.questions.some((q) => !q.title.trim() || q.title.length > 300))
    return 'Every question needs a title of up to 300 characters.';
  if (new Set(survey.questions.map((question) => question.id)).size !== survey.questions.length)
    return 'Every question needs a unique identifier.';
  if (
    survey.questions.some(
      (q) =>
        ['singleChoice', 'multipleChoice'].includes(q.type) &&
        (q.options.length < 2 ||
          q.options.length > 12 ||
          q.options.some((option) => !option.trim()) ||
          new Set(q.options.map((option) => option.trim())).size !== q.options.length),
    )
  )
    return 'Choice questions need 2–12 unique, non-empty options.';
  return null;
}
