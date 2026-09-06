import assert from "node:assert/strict";
import test from "node:test";
import { assertMailDeliveryTransition, canTransitionMailDelivery, shouldBlindRetryMailDelivery } from "../../../shared/mail/state-machine.js";

test("mail state machine permits retryable deferral but forbids blind retry after uncertain acceptance", () => {
  assert.equal(canTransitionMailDelivery("transmitting", "deferred"), true);
  assert.equal(canTransitionMailDelivery("transmitting", "acceptance_uncertain"), true);
  assert.equal(shouldBlindRetryMailDelivery("deferred"), true);
  assert.equal(shouldBlindRetryMailDelivery("acceptance_uncertain"), false);
  assert.throws(() => assertMailDeliveryTransition("accepted", "queued"), /Illegal Nurture Mail delivery transition/);
});

test("post-accept recipient signals can strengthen delivery knowledge", () => {
  assert.equal(canTransitionMailDelivery("accepted", "bounced"), true);
  assert.equal(canTransitionMailDelivery("accepted", "complained"), true);
  assert.equal(canTransitionMailDelivery("bounced", "complained"), true);
});
