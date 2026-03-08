from fastapi import APIRouter, Query
from geopy.geocoders import Nominatim

router = APIRouter(prefix="/geo", tags=["geo"])

@router.get("/suggest")
async def suggest(q: str = Query(..., min_length=2)):
    geolocator = Nominatim(user_agent="astro_calculator")
    loc = geolocator.geocode(q, language="ru", exactly_one=False, limit=7)
    items = []
    if loc:
        for x in loc:
            items.append({
                "title": x.address,
                "lat": x.latitude,
                "lon": x.longitude,
            })
    return {"items": items}