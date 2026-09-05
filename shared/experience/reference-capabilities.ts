export const REFERENCE_ASSESSMENT_CAPABILITIES = {
  preview: "nurture.reference-assessment.preview",
  review: "nurture.reference-assessment.review",
  deepDive: "nurture.reference-assessment.deep-dive",
} as const;

/**
 * Release 1 capability mapping for Track D's Entry / Primary / Premium reference
 * offers. These are fixture mappings for the active reference Experience, not
 * universal capability names for every future module.
 */
export const RELEASE_ONE_REFERENCE_OFFER_CAPABILITIES = {
  entry: [REFERENCE_ASSESSMENT_CAPABILITIES.preview],
  primary: [
    REFERENCE_ASSESSMENT_CAPABILITIES.preview,
    REFERENCE_ASSESSMENT_CAPABILITIES.review,
  ],
  premium: [
    REFERENCE_ASSESSMENT_CAPABILITIES.preview,
    REFERENCE_ASSESSMENT_CAPABILITIES.review,
    REFERENCE_ASSESSMENT_CAPABILITIES.deepDive,
  ],
} as const;
