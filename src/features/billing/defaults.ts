import { createReleaseOneDefaultOffers } from "../../../shared/billing/defaults";
import { DEMO_ORG_ID } from "../../data/demo";

export const releaseOneDefaultOffers = createReleaseOneDefaultOffers(DEMO_ORG_ID);

export function getDefaultOffer(offerId: string) {
  return releaseOneDefaultOffers.find((offer) => offer.id === offerId) ?? null;
}
