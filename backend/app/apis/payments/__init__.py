from fastapi import APIRouter, Request, HTTPException, Depends
from pydantic import BaseModel
import stripe
import firebase_admin
from firebase_admin import credentials, firestore
import databutton as db
import json
from typing import TypedDict, Literal
from datetime import datetime
from app.auth import AuthorizedUser
import json as json_module

# Set this to True to use test environment, False to use production
USE_TEST_ENVIRONMENT = True
import os
from app.env import Mode, mode

class ProductConfig(TypedDict):
    credits: int
    type: Literal["monthly", "one_time"]

# Test environment configuration
TEST_PRODUCT_CONFIG: dict[str, ProductConfig] = {
    # One-time token packages
    "prod_RqKeQvg6CVuBSo": {"credits": 2500, "type": "one_time"},  # 2500 tokens ($100)
    "prod_RqKezDydjuWJrR": {"credits": 1250, "type": "one_time"},  # 1250 tokens ($50)
    "prod_RqKg3XTH0optXm": {"credits": 500, "type": "one_time"},   # 500 tokens ($25)
    
    # Monthly subscription - does not add credits, just provides access
    "prod_RqKcmjpSSjIarh": {"credits": 0, "type": "monthly"}      # Monthly subscription ($20)
}

# Test price IDs for reference
TEST_PRICE_IDS = {
    "MONTHLY": "price_1QwdxMQD0tmjQB7AzDZquNZO",   # Monthly subscription
    "TOKENS_500": "price_1Qwe11QD0tmjQB7AQWs7M9nE",  # 500 tokens
    "TOKENS_1250": "price_1QwdzOQD0tmjQB7Ap9CLBHBn", # 1250 tokens
    "TOKENS_2500": "price_1Qwe0UQD0tmjQB7ALfloZuTq"  # 2500 tokens
}

# Production environment configuration
PRODUCTION_PRODUCT_CONFIG: dict[str, ProductConfig] = {
    # One-time token packages
    "prod_RqGzTjzgVbi40o": {"credits": 2500, "type": "one_time"},  # 2500 tokens ($100)
    "prod_RqGypl9K3FTbT7": {"credits": 1250, "type": "one_time"},  # 1250 tokens ($50)
    "prod_RqGynF7E8a22AB": {"credits": 500, "type": "one_time"},   # 500 tokens ($25)
    
    # Monthly subscription - does not add credits, just provides access
    "prod_RqGngOCXUsp0yI": {"credits": 0, "type": "monthly"}      # Monthly subscription ($20)
}

# Production price IDs for reference
PRODUCTION_PRICE_IDS = {
    "MONTHLY": "price_1QwaGDGPQrpE7XHPsBGjwnax",   # Monthly subscription
    "TOKENS_500": "price_1QwaQCGPQrpE7XHPaWlhn5eN",  # 500 tokens
    "TOKENS_1250": "price_1QwaQmGPQrpE7XHPf7bW4yF7", # 1250 tokens
    "TOKENS_2500": "price_1QwaR9GPQrpE7XHPGB5Hn9GU"  # 2500 tokens
}

# Set the product configuration based on the environment flag
PRODUCT_CONFIG: dict[str, ProductConfig] = TEST_PRODUCT_CONFIG if USE_TEST_ENVIRONMENT else PRODUCTION_PRODUCT_CONFIG
PRICE_IDS = TEST_PRICE_IDS if USE_TEST_ENVIRONMENT else PRODUCTION_PRICE_IDS

# Initialize Firebase if not already initialized
try:
    firebase_admin.get_app()
except ValueError:
    cred = credentials.Certificate(json.loads(db.secrets.get("FIREBASE_ADMIN_KEY")))
    firebase_admin.initialize_app(cred)

router = APIRouter()
db_client = firestore.client()

@router.get("/test-stripe-connection")
def test_stripe_connection():
    """Test the Stripe connection and list products"""
    try:
        # Attempt to retrieve account info
        account = stripe.Account.retrieve()
        
        # List all products
        products = stripe.Product.list(limit=100, active=True)
        
        # Format product data for readable output
        formatted_products = []
        for product in products.data:
            # Get prices for this product
            prices = stripe.Price.list(product=product.id, active=True)
            price_data = [{
                "id": price.id,
                "currency": price.currency,
                "unit_amount": price.unit_amount / 100 if price.unit_amount else 0,
                "recurring": price.recurring is not None,
                "interval": price.recurring.interval if price.recurring else None,
                "active": price.active
            } for price in prices.data]
            
            # Format product with its prices
            formatted_product = {
                "id": product.id,
                "name": product.name,
                "active": product.active,
                "description": product.description,
                "prices": price_data
            }
            formatted_products.append(formatted_product)
        
        # Return account and product information
        return {
            "status": "success",
            "account": {
                "id": account.id,
                "business_profile": account.business_profile,
                "email": account.email,
                "charges_enabled": account.charges_enabled,
                "details_submitted": account.details_submitted,
                "payouts_enabled": account.payouts_enabled
            },
            "products": formatted_products,
            "stripe_version": stripe.api_version,
            "stripe_environment": "TEST" if USE_TEST_ENVIRONMENT else "PRODUCTION",
            "product_config": {
                product_id: config for product_id, config in PRODUCT_CONFIG.items()
            },
            "price_ids": PRICE_IDS
        }
    except Exception as e:
        error_details = str(e)
        return {
            "status": "error",
            "message": "Error connecting to Stripe",
            "error": error_details,
            "stripe_key_prefix": db.secrets.get("STRIPE_SECRET_KEY")[:8] + "..."
        }

# Initialize Stripe with the appropriate API key based on environment flag
stripe.api_key = db.secrets.get("STRIPE_TEST_SECRET_KEY") if USE_TEST_ENVIRONMENT else db.secrets.get("STRIPE_SECRET_KEY")

def get_product_config(price_id: str) -> ProductConfig | None:
    """Get product configuration from a price ID"""
    try:
        price = stripe.Price.retrieve(price_id)
        return PRODUCT_CONFIG.get(price.product)
    except Exception as e:
        print(f"Error getting product config for price {price_id}: {str(e)}")
        return None

class CreateCheckoutSession(BaseModel):
    price_id: str
    success_url: str
    cancel_url: str

@router.post("/create-checkout")
def create_checkout_session(body: CreateCheckoutSession, user: AuthorizedUser):
    """Create a Stripe Checkout session"""
    try:
        # Get or create customer
        user_ref = db_client.collection("users").document(user.sub)
        user_data = user_ref.get().to_dict() or {}
        customer_id = user_data.get("stripeCustomerId")
        customer_email = user_data.get("email")
        
        if not customer_id:
            # Create customer with name and email if available
            customer_name = user_data.get("displayMame")
            customer_params = {
                "metadata": {"firebase_uid": user.sub},
                "email": customer_email
            }
            if customer_name:
                customer_params["name"] = customer_name
                
            customer = stripe.Customer.create(**customer_params)
            customer_id = customer.id
            
            # Update user document with stripe customer id
            try:
                user_ref.set({"stripeCustomerId": customer_id}, merge=True)
                # Verify the write was successful
                updated_user = user_ref.get().to_dict()
                if updated_user.get("stripeCustomerId") != customer_id:
                    print(f"Failed to update stripeCustomerId for user {user.sub}")
                    raise HTTPException(status_code=500, detail="Failed to update user data")
            except Exception as e:
                print(f"Error updating user with stripe customer id: {str(e)}")
                raise HTTPException(status_code=500, detail="Failed to update user data")

        # Get product config to determine if it's a subscription
        product_config = get_product_config(body.price_id)
        if not product_config:
            raise HTTPException(status_code=400, detail="Invalid product")
            
        # Set mode based on product type
        mode = "subscription" if product_config["type"] == "monthly" else "payment"
        
        # Create checkout session
        session = stripe.checkout.Session.create(
            customer_email=customer_email,
            payment_method_types=["card"],
            line_items=[{
                "price": body.price_id,
                "quantity": 1,
            }],
            mode=mode,
            success_url=body.success_url,
            cancel_url=body.cancel_url,
            client_reference_id=user.sub,
            metadata={
                "firebase_uid": user.sub,
                "product_type": product_config["type"]
            }
        )

        return {"session_id": session.id}
        
    except Exception as e:
        print(f"Error creating checkout session: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/webhook")
async def stripe_webhook(request: Request):
    # Get the webhook data
    print("hihi")
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature")
    
    try:
        webhook_secret = db.secrets.get("STRIPE_TEST_WEBHOOK_SECRET") if USE_TEST_ENVIRONMENT else db.secrets.get("STRIPE_WEBHOOK_SECRET")
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
        print(event)  
    except ValueError as e:
        raise HTTPException(status_code=400, detail="Invalid payload") from e
        
    # Handle the event
    if event["type"] == "customer.subscription.created":
        subscription = event["data"]["object"]
        result = handle_subscription_created(subscription)
        return result
    elif event["type"] == "customer.subscription.updated":
        subscription = event["data"]["object"]
        result = handle_subscription_updated(subscription)
        return result
    elif event["type"] == "customer.subscription.deleted":
        subscription = event["data"]["object"]
        result = handle_subscription_deleted(subscription)
        return result
    elif event["type"] == "checkout.session.completed":
        session = event["data"]["object"]
        
        # Skip if this is a subscription purchase as it will be handled by subscription.created
        if session.get("mode") == "subscription":
            return {"status": "success", "message": "Skipping subscription purchase, will be handled by subscription webhook"}
        
        # Get customer ID and customer email from session
        customer_id = session.get("customer")
        customer_email = session.get("customer_details", {}).get("email")
        session_id = session.get("id")
        
        if not customer_email:
            print("No customer email found in session")
            return {"status": "error", "message": "No customer email found"}
        
        # Get user document by email
        user_query = db_client.collection("users").where(
            "email", "==", customer_email
        ).limit(1).get()
        
        if not user_query:
            print(f"No user found for email {customer_email}")
            return {"status": "error", "message": "User not found"}
        
        user_doc = user_query[0]
        user_ref = user_doc.reference
        
        # Update user with Stripe customer ID if not already set
        if not user_doc.get("stripeCustomerId"):
            user_ref.set({"stripeCustomerId": customer_id}, merge=True)
        
        # Get line items from session
        line_items = stripe.checkout.Session.list_line_items(session_id)
        
        # Calculate total credits for one-time purchases only
        total_credits = 0
        
        for item in line_items.data:
            product_config = get_product_config(item.price.id)
            if product_config and product_config["type"] == "one_time":
                total_credits += product_config["credits"]
        
        if total_credits > 0:
            # Get current user data
            user_data = user_ref.get().to_dict() or {}
            current_credits = user_data.get("credits", 0)

            # Update user credits
            updated_data = {
                "credits": current_credits + total_credits,
                "stripeCustomerId": customer_id,
                "lastActive": datetime.utcnow().isoformat(),
            }
            
            user_ref.set(updated_data, merge=True)
            
            print(f"Updated credits for user {user_doc.id}: +{total_credits} credits (one-time purchase)")
            
        return {
            "status": "success",
            "message": f"Updated credits for user {user_doc.id}: +{total_credits} credits (one-time purchase)"
        }
    return {"status": "success", "credits_added": 0}

def handle_subscription_created(subscription):
    """Handle a new subscription being created"""
    # Get customer ID and email from subscription
    customer_id = subscription.get("customer")
    if not customer_id:
        print("No customer ID found in subscription")
        return {"status": "error", "credits_added": 0, "message": "No customer ID found"}

    # Get customer email from Stripe
    try:
        stripe_customer = stripe.Customer.retrieve(customer_id)
        customer_email = stripe_customer.get("email")
    except Exception as e:
        print(f"Error retrieving Stripe customer: {str(e)}")
        return {"status": "error", "credits_added": 0, "message": "Failed to retrieve customer details"}

    if not customer_email:
        print("No customer email found in Stripe")
        return {"status": "error", "message": "No customer email found"}

    # Get user document by email
    user_query = db_client.collection("users").where(
        "email", "==", customer_email
    ).limit(1).get()

    if not user_query:
        print(f"No user found for email {customer_email}")
        return {"status": "error", "message": "User not found"}

    user_doc = user_query[0]
    user_ref = user_doc.reference
    user_data = user_doc.to_dict()

    # Update user with Stripe customer ID if not already set
    if not user_doc.get("stripeCustomerId"):
        user_ref.set({"stripeCustomerId": customer_id}, merge=True)

    # Get subscription details
    subscription_item = subscription.get("items", {}).get("data", [])[0]
    if not subscription_item:
        return {"status": "error", "credits_added": 0, "message": "No subscription items found"}
        
    price_id = subscription_item.get("price", {}).get("id")
    if not price_id:
        return {"status": "error", "credits_added": 0, "message": "No price ID found"}
        
    # Get product config
    product_config = get_product_config(price_id)
    if not product_config:
        return {"status": "error", "credits_added": 0, "message": "No product config found"}
        
    total_credits = product_config["credits"]

    # Store subscription details with enhanced information
    subscription_data = {
        # Subscription Core Details
        "subscriptionId": subscription.get("id"),
        "status": subscription.get("status"),
        "currentPeriodStart": datetime.fromtimestamp(subscription.get("current_period_start", 0)).isoformat(),
        "currentPeriodEnd": datetime.fromtimestamp(subscription.get("current_period_end", 0)).isoformat(),
        "cancelAtPeriodEnd": subscription.get("cancel_at_period_end", False),
        "creditsPerPeriod": total_credits,
        
        # Price and Product Details
        "priceId": price_id,
        "productId": subscription_item.get("price", {}).get("product"),
        "amount": subscription_item.get("price", {}).get("unit_amount", 0) / 100,
        "currency": subscription_item.get("price", {}).get("currency", "usd"),
        
        # User Details
        "userId": user_doc.id,
        "userEmail": user_data.get("email"),
        "userName": user_data.get("name"),
        
        # Stripe Customer Details
        "stripeCustomerId": customer_id,
        "stripeCustomerEmail": customer_email,
        "stripeCustomerName": stripe_customer.get("name"),
        
        # Metadata and Timestamps
        "createdAt": datetime.utcnow().isoformat(),
        "updatedAt": datetime.utcnow().isoformat(),
        "lastBillingDate": datetime.fromtimestamp(subscription.get("current_period_start", 0)).isoformat(),
        "nextBillingDate": datetime.fromtimestamp(subscription.get("current_period_end", 0)).isoformat(),
        
        # Subscription Config
        "isActive": True,
        "type": "monthly",
    }
    
    print(f"Creating subscription document with data: {subscription_data}")
    
    # Update subscription collection
    db_client.collection("subscriptions").document(user_doc.id).set(subscription_data)
    
    # Update user data - subscription doesn't add credits, only sets status
    updated_data = {
        "subscriptionStatus": "active",
        "subscriptionTier": "monthly",
        "lastActive": datetime.utcnow().isoformat(),
    }
    
    user_ref.set(updated_data, merge=True)
    
    return {
        "status": "success",
        "credits_added": total_credits,
        "message": f"Created subscription for user {user_doc.id}: added {total_credits} credits"
    }

def handle_subscription_updated(subscription):
    """Handle a subscription being updated"""
    # Get customer ID and email from subscription
    customer_id = subscription.get("customer")
    if not customer_id:
        print("No customer ID found in subscription")
        return {"status": "error", "credits_added": 0, "message": "No customer ID found"}

    # Get customer email from Stripe
    try:
        stripe_customer = stripe.Customer.retrieve(customer_id)
        customer_email = stripe_customer.get("email")
    except Exception as e:
        print(f"Error retrieving Stripe customer: {str(e)}")
        return {"status": "error", "credits_added": 0, "message": "Failed to retrieve customer details"}

    if not customer_email:
        print("No customer email found in Stripe")
        return {"status": "error", "message": "No customer email found"}

    # Get user document by email
    user_query = db_client.collection("users").where(
        "email", "==", customer_email
    ).limit(1).get()

    if not user_query:
        print(f"No user found for email {customer_email}")
        return {"status": "error", "message": "User not found"}

    user_doc = user_query[0]
    user_ref = user_doc.reference
    user_data = user_doc.to_dict()

    # Update user with Stripe customer ID if not already set
    if not user_doc.get("stripeCustomerId"):
        user_ref.set({"stripeCustomerId": customer_id}, merge=True)

    # Get subscription document
    subscription_ref = db_client.collection("subscriptions").document(user_doc.id)
    subscription_doc = subscription_ref.get()
    
    if not subscription_doc.exists:
        print(f"No subscription document found for user {user_doc.id}")
        return {"status": "error", "credits_added": 0, "message": "No subscription document found"}
        
    subscription_data = subscription_doc.to_dict()
    current_period_start = subscription_data.get("currentPeriodStart")
    new_period_start = datetime.fromtimestamp(subscription.get("current_period_start", 0)).isoformat()
    credits_per_period = subscription_data.get("creditsPerPeriod", 0)

    # Get subscription details for price update check
    subscription_item = subscription.get("items", {}).get("data", [])[0]
    if not subscription_item:
        return {"status": "error", "credits_added": 0, "message": "No subscription items found"}
        
    price_id = subscription_item.get("price", {}).get("id")
    if not price_id:
        return {"status": "error", "credits_added": 0, "message": "No price ID found"}

    # Update subscription details while preserving and updating all fields
    updated_subscription_data = {
        # Subscription Core Details
        "subscriptionId": subscription.get("id"),
        "status": subscription.get("status"),
        "currentPeriodStart": new_period_start,
        "currentPeriodEnd": datetime.fromtimestamp(subscription.get("current_period_end", 0)).isoformat(),
        "cancelAtPeriodEnd": subscription.get("cancel_at_period_end", False),
        "creditsPerPeriod": credits_per_period,
        
        # Price and Product Details
        "priceId": price_id,
        "productId": subscription_item.get("price", {}).get("product"),
        "amount": subscription_item.get("price", {}).get("unit_amount", 0) / 100,
        "currency": subscription_item.get("price", {}).get("currency", "usd"),
        
        # User Details
        "userId": user_doc.id,
        "userEmail": user_data.get("email"),
        "userName": user_data.get("name"),
        
        # Stripe Customer Details
        "stripeCustomerId": customer_id,
        "stripeCustomerEmail": customer_email,
        "stripeCustomerName": stripe_customer.get("name"),
        
        # Metadata and Timestamps
        "createdAt": subscription_data.get("createdAt"),  # Preserve original creation date
        "updatedAt": datetime.utcnow().isoformat(),
        "lastBillingDate": new_period_start,
        "nextBillingDate": datetime.fromtimestamp(subscription.get("current_period_end", 0)).isoformat(),
        
        # Subscription Config
        "isActive": True,
        "type": "monthly",
    }

    # If this is a new period (period start date has changed), just update subscription status
    if current_period_start != new_period_start:
        print(f"New period detected! Updating subscription status")
        
        # Update subscription status only (no credits added for renewals)
        updated_data = {
            "subscriptionStatus": "active",
            "subscriptionTier": "monthly",
            "lastActive": datetime.utcnow().isoformat(),
        }
        
        user_ref.set(updated_data, merge=True)
        print(f"Updated subscription status for user {user_doc.id}")
        
        # Update subscription document
        subscription_ref.set(updated_subscription_data, merge=True)
        
        return {
            "status": "success",
            "credits_added": 0,
            "message": f"Renewed subscription for user {user_doc.id}: subscription active"
        }
    
    # Update subscription document even if it's not a new period
    subscription_ref.set(updated_subscription_data, merge=True)
    return {"status": "success", "credits_added": 0, "message": "No renewal needed"}

def handle_subscription_deleted(subscription):
    """Handle a subscription being cancelled"""
    # Get customer ID and email from subscription
    customer_id = subscription.get("customer")
    if not customer_id:
        print("No customer ID found in subscription")
        return {"status": "error", "credits_added": 0, "message": "No customer ID found"}

    # Get customer email from Stripe
    try:
        stripe_customer = stripe.Customer.retrieve(customer_id)
        customer_email = stripe_customer.get("email")
    except Exception as e:
        print(f"Error retrieving Stripe customer: {str(e)}")
        return {"status": "error", "credits_added": 0, "message": "Failed to retrieve customer details"}

    if not customer_email:
        print("No customer email found in Stripe")
        return {"status": "error", "message": "No customer email found"}

    # Get user document by email
    user_query = db_client.collection("users").where(
        "email", "==", customer_email
    ).limit(1).get()

    if not user_query:
        print(f"No user found for email {customer_email}")
        return {"status": "error", "message": "User not found"}

    user_doc = user_query[0]
    user_ref = user_doc.reference
    user_data = user_doc.to_dict()

    # Update user with Stripe customer ID if not already set
    if not user_doc.get("stripeCustomerId"):
        user_ref.set({"stripeCustomerId": customer_id}, merge=True)

    # Check if subscription has remaining time
    current_period_end = subscription.get("current_period_end")
    has_remaining_time = current_period_end and current_period_end > int(datetime.utcnow().timestamp())

    # Update user stats with new "cancelled_active" status
    updated_data = {
        "subscriptionStatus": "cancelled_active" if has_remaining_time else "expired",
        "subscriptionTier": "monthly",  # Keep as monthly until period ends
        "lastActive": datetime.utcnow().isoformat(),
        "subscriptionEndDate": datetime.fromtimestamp(current_period_end).isoformat() if has_remaining_time else None
    }

    user_ref.set(updated_data, merge=True)

    # Update subscription document
    subscription_ref = db_client.collection("subscriptions").document(user_doc.id)
    subscription_doc = subscription_ref.get()

    if subscription_doc.exists:
        subscription_data = subscription_doc.to_dict()
        # Update subscription details while preserving history
        updated_subscription_data = {
            # Subscription Core Details
            "subscriptionId": subscription.get("id"),
            "status": "cancelled_active" if has_remaining_time else "cancelled",
            "currentPeriodStart": subscription_data.get("currentPeriodStart"),
            "currentPeriodEnd": datetime.fromtimestamp(subscription.get("current_period_end", 0)).isoformat(),
            "cancelAtPeriodEnd": True,
            "creditsPerPeriod": subscription_data.get("creditsPerPeriod", 0),
            "cancellationDate": datetime.utcnow().isoformat(),
            "effectiveCancellationDate": datetime.fromtimestamp(current_period_end).isoformat() if has_remaining_time else datetime.utcnow().isoformat(),

            # User Details
            "userId": user_doc.id,
            "userEmail": user_data.get("email"),
            "userName": user_data.get("name"),

            # Stripe Customer Details
            "stripeCustomerId": customer_id,
            "stripeCustomerEmail": customer_email,
            "stripeCustomerName": stripe_customer.get("name"),

            # Metadata and Timestamps
            "createdAt": subscription_data.get("createdAt"),  # Preserve original creation date
            "updatedAt": datetime.utcnow().isoformat(),
            "cancelledAt": datetime.utcnow().isoformat(),
            "lastBillingDate": subscription_data.get("lastBillingDate"),
            "nextBillingDate": datetime.fromtimestamp(subscription.get("current_period_end", 0)).isoformat() if has_remaining_time else None,

            # Subscription Config
            "isActive": has_remaining_time,
            "type": "monthly",
        }

        print(f"Updating cancelled subscription with data: {updated_subscription_data}")
        subscription_ref.set(updated_subscription_data, merge=True)

    return {
        "status": "success",
        "credits_added": 0,
        "message": f"Subscription cancelled for user {user_doc.id} (effective {datetime.fromtimestamp(current_period_end).isoformat() if has_remaining_time else 'immediately'})"
    }
