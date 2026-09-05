import { createFeedbackCallable } from "./callable.js";
import { createFeedbackBoundary } from "./composition.js";
import { createRelease4FeedbackComposition, RELEASE4_FEEDBACK_TOKEN_SECRET } from "./bootstrap.js";

const composition = createRelease4FeedbackComposition();

export const feedbackCommand = createFeedbackCallable(
  composition.deps,
  createFeedbackBoundary(),
  [RELEASE4_FEEDBACK_TOKEN_SECRET],
);
