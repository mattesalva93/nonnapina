// Scoring formula for deal ranking.
// Combines discounted price advantage with review-based confidence.
//   W_DISCOUNT    = 0.6  (discount is the dominant factor)
//   W_CONFIDENCE  = 0.4  (rating with review-count confidence adds context)
//
// normalizedDiscount   = clamp(discount, 0..100) / 100
// confidence           = 1 - e^(-reviewCount / K)              K = 30
// normalizedConfidence = rating * confidence / 5

const W_DISCOUNT = 0.6;
const W_CONFIDENCE = 0.4;
const MAX_RATING = 5;
const CONFIDENCE_K = 30;

export function computeDealScore(discount: number, rating: number, reviewCount: number): number {
  const normalizedDiscount = Math.min(Math.max(discount, 0), 100) / 100;
  const confidence = 1 - Math.exp(-reviewCount / CONFIDENCE_K);
  const normalizedConfidence = (rating * confidence) / MAX_RATING;
  return W_DISCOUNT * normalizedDiscount + W_CONFIDENCE * normalizedConfidence;
}
