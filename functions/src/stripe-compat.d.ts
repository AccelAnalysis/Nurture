import "stripe";

declare module "stripe" {
  namespace Stripe {
    interface Refund {
      /** Present on Stripe API payloads; retained as optional for SDK type compatibility. */
      livemode?: boolean;
    }
  }
}
