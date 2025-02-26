/** AcrePriceData */
export interface AcrePriceData {
  /** Acre */
  acre?: number | null;
  /** Price */
  price?: number | null;
  /** Address */
  address?: string | null;
}

/** AcrePricesRequest */
export interface AcrePricesRequest {
  /** City */
  city: string;
  /** Acres */
  acres: number;
  /** Zip Code */
  zip_code: string;
}

/** AcrePricesResponse */
export interface AcrePricesResponse {
  /** Prices */
  prices: AcrePriceData[];
}

/** CreateCheckoutSession */
export interface CreateCheckoutSession {
  /** Price Id */
  price_id: string;
  /** Success Url */
  success_url: string;
  /** Cancel Url */
  cancel_url: string;
}

/** DistanceRequest */
export interface DistanceRequest {
  /** Origins */
  origins: string;
  /** Destination */
  destination: string;
}

/** DistanceResponse */
export interface DistanceResponse {
  /** Distance Text */
  distance_text: string;
  /** Distance Value */
  distance_value: number;
  /** Duration Text */
  duration_text: string;
  /** Duration Value */
  duration_value: number;
}

/**
 * FirecrawlPrice
 * Base model matching Firecrawl's price extraction schema
 */
export interface FirecrawlPrice {
  /** Url */
  url?: string | null;
  /** Price */
  price?: string | null;
  /** Website Name */
  website_name?: string | null;
}

/** HTTPValidationError */
export interface HTTPValidationError {
  /** Detail */
  detail?: ValidationError[];
}

/** HealthResponse */
export interface HealthResponse {
  /** Status */
  status: string;
}

/** PricePredictionRequest */
export interface PricePredictionRequest {
  /** Address */
  address: string;
  /** Pricecomparisons */
  priceComparisons: FirecrawlPrice[];
}

/** PricePredictionResponse */
export interface PricePredictionResponse {
  /** Predicted Price */
  predicted_price: string;
  /** Confidence Score */
  confidence_score: string;
  /** Reasoning */
  reasoning: string;
}

/** ScrapingRequest */
export interface ScrapingRequest {
  /** Address */
  address: string;
  /** City */
  city: string;
  /** State */
  state: string;
}

/** ValidationError */
export interface ValidationError {
  /** Location */
  loc: (string | number)[];
  /** Message */
  msg: string;
  /** Error Type */
  type: string;
}

export type CheckHealthData = HealthResponse;

export type TestStripeConnectionData = any;

export type CreateCheckoutSessionData = any;

export type CreateCheckoutSessionError = HTTPValidationError;

export type StripeWebhookData = any;

export type PredictPriceData = PricePredictionResponse;

export type PredictPriceError = HTTPValidationError;

/** Response Get Price Estimates */
export type GetPriceEstimatesData = FirecrawlPrice[];

export type GetPriceEstimatesError = HTTPValidationError;

export type GetAcresPricesData = AcrePricesResponse;

export type GetAcresPricesError = HTTPValidationError;

export type GetDistanceToCityData = DistanceResponse;

export type GetDistanceToCityError = HTTPValidationError;
