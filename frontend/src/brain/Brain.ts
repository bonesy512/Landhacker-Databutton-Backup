import {
  AcrePricesRequest,
  CheckHealthData,
  CreateCheckoutSession,
  CreateCheckoutSessionData,
  CreateCheckoutSessionError,
  DistanceRequest,
  GetAcresPricesData,
  GetAcresPricesError,
  GetDistanceToCityData,
  GetDistanceToCityError,
  GetPriceEstimatesData,
  GetPriceEstimatesError,
  PredictPriceData,
  PredictPriceError,
  PricePredictionRequest,
  ScrapingRequest,
  StripeWebhookData,
  TestStripeConnectionData,
} from "./data-contracts";
import { ContentType, HttpClient, RequestParams } from "./http-client";

export class Brain<SecurityDataType = unknown> extends HttpClient<SecurityDataType> {
  /**
   * @description Check health of application. Returns 200 when OK, 500 when not.
   *
   * @name check_health
   * @summary Check Health
   * @request GET:/_healthz
   */
  check_health = (params: RequestParams = {}) =>
    this.request<CheckHealthData, any>({
      path: `/_healthz`,
      method: "GET",
      ...params,
    });

  /**
   * @description Test the Stripe connection and list products
   *
   * @tags dbtn/module:payments
   * @name test_stripe_connection
   * @summary Test Stripe Connection
   * @request GET:/routes/test-stripe-connection
   */
  test_stripe_connection = (params: RequestParams = {}) =>
    this.request<TestStripeConnectionData, any>({
      path: `/routes/test-stripe-connection`,
      method: "GET",
      ...params,
    });

  /**
   * @description Create a Stripe Checkout session
   *
   * @tags dbtn/module:payments
   * @name create_checkout_session
   * @summary Create Checkout Session
   * @request POST:/routes/create-checkout
   */
  create_checkout_session = (data: CreateCheckoutSession, params: RequestParams = {}) =>
    this.request<CreateCheckoutSessionData, CreateCheckoutSessionError>({
      path: `/routes/create-checkout`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });

  /**
   * No description
   *
   * @tags dbtn/module:payments
   * @name stripe_webhook
   * @summary Stripe Webhook
   * @request POST:/routes/webhook
   */
  stripe_webhook = (params: RequestParams = {}) =>
    this.request<StripeWebhookData, any>({
      path: `/routes/webhook`,
      method: "POST",
      ...params,
    });

  /**
   * No description
   *
   * @tags dbtn/module:scrape, dbtn/hasAuth
   * @name predict_price
   * @summary Predict Price
   * @request POST:/routes/scrape/predict-price
   */
  predict_price = (data: PricePredictionRequest, params: RequestParams = {}) =>
    this.request<PredictPriceData, PredictPriceError>({
      path: `/routes/scrape/predict-price`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });

  /**
   * @description Get price estimates from various sources for a property using Firecrawl for extraction
   *
   * @tags dbtn/module:scrape, dbtn/hasAuth
   * @name get_price_estimates
   * @summary Get Price Estimates
   * @request POST:/routes/scrape/estimates
   */
  get_price_estimates = (data: ScrapingRequest, params: RequestParams = {}) =>
    this.request<GetPriceEstimatesData, GetPriceEstimatesError>({
      path: `/routes/scrape/estimates`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });

  /**
   * @description Get land prices for a specific acre range in a city
   *
   * @tags dbtn/module:scrape, dbtn/hasAuth
   * @name get_acres_prices
   * @summary Get Acres Prices
   * @request POST:/routes/scrape/acres-prices
   */
  get_acres_prices = (data: AcrePricesRequest, params: RequestParams = {}) =>
    this.request<GetAcresPricesData, GetAcresPricesError>({
      path: `/routes/scrape/acres-prices`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });

  /**
   * @description Get the distance and duration to a city using Google Maps Distance Matrix API
   *
   * @tags dbtn/module:other_data, dbtn/hasAuth
   * @name get_distance_to_city
   * @summary Get Distance To City
   * @request POST:/routes/distance-to-city
   */
  get_distance_to_city = (data: DistanceRequest, params: RequestParams = {}) =>
    this.request<GetDistanceToCityData, GetDistanceToCityError>({
      path: `/routes/distance-to-city`,
      method: "POST",
      body: data,
      type: ContentType.Json,
      ...params,
    });
}
