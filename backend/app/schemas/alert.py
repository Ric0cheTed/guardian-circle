from pydantic import BaseModel
from datetime import datetime

class AlertCreate(BaseModel):
    lat: float | None = None
    lng: float | None = None

class AlertUpdateLocation(BaseModel):
    lat: float
    lng: float

class AlertOut(BaseModel):
    id: int
    status: str
    created_at: datetime
    last_location_at: datetime | None
    last_lat: float | None
    last_lng: float | None
    class Config:
        from_attributes = True
