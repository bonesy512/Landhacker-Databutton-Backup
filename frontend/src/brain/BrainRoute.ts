import {
  AcrePricesRequest,
  CheckHealthData,
  CreateCheckoutSession,
  CreateCheckoutSessionData,
  DistanceRequest,
  GetAcresPricesData,
  GetDistanceToCityData,
  GetPriceEstimatesData,
  PredictPriceData,
  PricePredictionRequest,
  ScrapingRequest,
  StripeWebhookData,
  TestStripeConnectionData,
} from "./data-contracts";

export namespace Brain {
  /**
   * @description Check health of application. Returns 200 when OK, 500 when not.
   * @name check_health
   * @summary Check Health
   * @request GET:/_healthz
   */
  export namespace check_health {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = CheckHealthData;
  }

  /**
   * @description Test the Stripe connection and list products
   * @tags dbtn/module:payments
   * @name test_stripe_connection
   * @summary Test Stripe Connection
   * @request GET:/routes/test-stripe-connection
   */
  export namespace test_stripe_connection {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = TestStripeConnectionData;
  }

  /**
   * @description Create a Stripe Checkout session
   * @tags dbtn/module:payments
   * @name create_checkout_session
   * @summary Create Checkout Session
   * @request POST:/routes/create-checkout
   */
  export namespace create_checkout_session {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = CreateCheckoutSession;
    export type RequestHeaders = {};
    export type ResponseBody = CreateCheckoutSessionData;
  }

  /**
   * No description
   * @tags dbtn/module:payments
   * @name stripe_webhook
   * @summary Stripe Webhook
   * @request POST:/routes/webhook
   */
  export namespace stripe_webhook {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = never;
    export type RequestHeaders = {};
    export type ResponseBody = StripeWebhookData;
  }

  /**
   * No description
   * @tags dbtn/module:scrape, dbtn/hasAuth
   * @name predict_price
   * @summary Predict Price
   * @request POST:/routes/scrape/predict-price
   */
  export namespace predict_price {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = PricePredictionRequest;
    export type RequestHeaders = {};
    export type ResponseBody = PredictPriceData;
  }

  /**
   * @description Get price estimates from various sources for a property using Firecrawl for extraction
   * @tags dbtn/module:scrape, dbtn/hasAuth
   * @name get_price_estimates
   * @summary Get Price Estimates
   * @request POST:/routes/scrape/estimates
   */
  export namespace get_price_estimates {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = ScrapingRequest;
    export type RequestHeaders = {};
    export type ResponseBody = GetPriceEstimatesData;
  }

  /**
   * @description Get land prices for a specific acre range in a city
   * @tags dbtn/module:scrape, dbtn/hasAuth
   * @name get_acres_prices
   * @summary Get Acres Prices
   * @request POST:/routes/scrape/acres-prices
   */
  export namespace get_acres_prices {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = AcrePricesRequest;
    export type RequestHeaders = {};
    export type ResponseBody = GetAcresPricesData;
  }

  /**
   * @description Get the distance and duration to a city using Google Maps Distance Matrix API
   * @tags dbtn/module:other_data, dbtn/hasAuth
   * @name get_distance_to_city
   * @summary Get Distance To City
   * @request POST:/routes/distance-to-city
   */
  export namespace get_distance_to_city {
    export type RequestParams = {};
    export type RequestQuery = {};
    export type RequestBody = DistanceRequest;
    export type RequestHeaders = {};
    export type ResponseBody = GetDistanceToCityData;
  }
}
