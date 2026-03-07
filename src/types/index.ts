// Shared domain types for the Keepa Tracker application

export interface KeepaProduct {
  asin: string;
  category: string;
  discount: number | undefined;
  avgPrice: number | undefined;
  currentPrice: number | undefined;
  rating: number | undefined;
  reviewCount: number | undefined;
}

export interface AffiliateLinks {
  web: string;
  storefront: string | undefined;
}

export interface ProductImage {
  small: string | undefined;
  large: string | undefined;
}

export interface ProductAvailability {
  message?: string;
  type?: string;
}

export interface AmazonProduct {
  asin: string;
  parentASIN: string | undefined;
  title: string;
  price: number | undefined;
  originalPrice: undefined;
  discountAmount: undefined;
  discountPercentage: undefined;
  currency: string;
  availability: ProductAvailability | undefined;
  rating: number | undefined;
  ratingCount: number | undefined;
  features: string[];
  image: ProductImage;
  affiliateLinks: AffiliateLinks;
  rawData: {
    itemInfo: unknown;
    images: unknown;
    offersV2: unknown;
    customerReviews: unknown;
    detailPageURL: string | undefined;
  };
  fetchedAt: string;
  marketplace: string;
}

export interface EnrichedProduct extends AmazonProduct {
  category: string;
  keepaDiscount: number | undefined;
  keepaAvgPrice: number | undefined;
  keepaCurrentPrice: number | undefined;
  keepaRating: number | undefined;
  keepaReviewCount: number | undefined;
}

export interface LinkOptions {
  storefront?: string;
  ref?: string;
}

// Amazon Creators API raw types
export interface ApiPriceMoney {
  amount?: number;
  currency?: string;
}

export interface ApiPrice {
  money?: ApiPriceMoney;
  amount?: number;
  currency?: string;
}

export interface ApiListing {
  price?: ApiPrice;
  availability?: ProductAvailability;
}

export interface ApiImage {
  url?: string;
}

export interface ApiImages {
  primary?: {
    small?: ApiImage;
    large?: ApiImage;
  };
}

export interface ApiStarRating {
  value?: number;
  displayValue?: string;
}

export interface ApiReviewCount {
  value?: number;
  displayValue?: number;
}

export interface ApiCustomerReviews {
  starRating?: number | ApiStarRating | string;
  count?: number | ApiReviewCount | string;
  reviewsCount?: number | ApiReviewCount | string;
}

export interface ApiItemInfo {
  title?: { displayValue?: string };
  features?: { displayValues?: string[] };
}

export interface ApiItem {
  asin: string;
  parentASIN?: string;
  detailPageURL?: string;
  itemInfo?: ApiItemInfo;
  images?: ApiImages;
  offersV2?: { listings?: ApiListing[] };
  customerReviews?: ApiCustomerReviews;
}

// Image collage types
export interface CollagePosition {
  top: number;
  left: number;
}

export interface CollageLayout {
  canvasWidth: number;
  canvasHeight: number;
  positions: CollagePosition[];
}

export interface CollageProduct {
  immagineLarge?: string;
  immagineSmall?: string;
  percentualeSconto?: string | number;
}

// Notes generator types
export interface NoteProduct {
  dataFetch?: string;
  categoria?: string;
  asin?: string;
  titolo?: string;
  prezzoOriginale?: string | number;
  prezzoScontato?: string | number;
  importoRisparmiato?: string | number;
  percentualeSconto?: string | number;
  valuta?: string;
  disponibilita?: string;
  tipoDisponibilita?: string;
  rating?: string | number;
  numeroReview?: string | number;
  features?: string;
  immagineSmall?: string;
  immagineLarge?: string;
  linkAffiliato?: string;
  linkStorefront?: string;
  parentASIN?: string;
  marketplace?: string;
}

export interface NotesResult {
  success: boolean;
  message: string;
  fileName?: string;
  count?: number;
}
