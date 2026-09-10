import math
from typing import List, Tuple
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.base import PharmacyStatus, PharmacyVerificationStatus
from app.models.pharmacy import Pharmacy


def haversine_distance_km(
    lat1: float, lng1: float, lat2: float, lng2: float
) -> float:
    """
    Calculate the great-circle distance between two points on the Earth
    given their latitude and longitude in decimal degrees using the Haversine formula.
    """
    R = 6371.0  # Earth's radius in kilometers

    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)

    a = (
        math.sin(dlat / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlng / 2.0) ** 2
    )
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    distance = R * c
    return round(distance, 2)


async def get_nearby_verified_pharmacies(
    db: AsyncSession,
    patient_lat: float,
    patient_lng: float,
) -> List[Tuple[Pharmacy, float]]:
    """
    Find all verified and active pharmacies whose service_radius_km covers the patient's coordinates.
    Returns a list of tuples: (pharmacy, distance_km), sorted from closest to farthest.
    """
    stmt = select(Pharmacy).where(
        Pharmacy.verification_status == PharmacyVerificationStatus.VERIFIED,
        Pharmacy.status == PharmacyStatus.ACTIVE,
    )
    result = await db.execute(stmt)
    pharmacies = result.scalars().all()

    nearby: List[Tuple[Pharmacy, float]] = []
    for ph in pharmacies:
        dist = haversine_distance_km(patient_lat, patient_lng, ph.lat, ph.lng)
        # Check if patient falls within this pharmacy's service coverage
        if dist <= ph.service_radius_km:
            nearby.append((ph, dist))

    nearby.sort(key=lambda item: item[1])
    return nearby
