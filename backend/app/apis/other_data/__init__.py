
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import requests
import databutton as db

# Router for endpoints
router = APIRouter()

class DistanceRequest(BaseModel):
    origins: str  # Format: "lat,long"
    destination: str  # City name

class DistanceResponse(BaseModel):
    distance_text: str
    distance_value: int  # in meters
    duration_text: str
    duration_value: int  # in seconds

@router.post("/distance-to-city")
def get_distance_to_city(body: DistanceRequest) -> DistanceResponse:
    """Get the distance and duration to a city using Google Maps Distance Matrix API"""
    try:
        # Get API key from secrets
        api_key = db.secrets.get("GOOGLE_MAPS_API_KEY")
        
        # Construct the URL
        url = f"https://maps.googleapis.com/maps/api/distancematrix/json"
        params = {
            "origins": body.origins,
            "destinations": body.destination,
            "units": "imperial",
            "key": api_key
        }
        
        # Make the request
        response = requests.get(url, params=params)
        response.raise_for_status()
        data = response.json()
        
        # Check for API errors
        if data.get("status") != "OK":
            raise HTTPException(
                status_code=400,
                detail=f"Google Maps API error: {data.get('status', 'Unknown error')}"
            )
            
        # Get the first route
        elements = data.get("rows", [{}])[0].get("elements", [{}])[0]
        
        if elements.get("status") != "OK":
            raise HTTPException(
                status_code=400,
                detail=f"Route error: {elements.get('status', 'Unknown error')}"
            )
        
        # Extract distance and duration
        distance = elements.get("distance", {})
        duration = elements.get("duration", {})
        
        return DistanceResponse(
            distance_text=distance.get("text", "N/A"),
            distance_value=distance.get("value", 0),
            duration_text=duration.get("text", "N/A"),
            duration_value=duration.get("value", 0)
        )
        
    except requests.RequestException as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch distance: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
