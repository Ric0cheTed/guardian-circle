from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.alert import Alert
from app.schemas.alert import AlertCreate, AlertUpdateLocation, AlertOut
from app.utils.auth_dep import get_current_user

router = APIRouter(prefix="/alerts", tags=["alerts"])

@router.get("/", response_model=list[AlertOut])
def list_alerts(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Alert).filter(Alert.owner_user_id == user.id).order_by(Alert.id.desc()).all()

@router.post("/", response_model=AlertOut)
def create_alert(payload: AlertCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    a = Alert(owner_user_id=user.id, last_lat=payload.lat, last_lng=payload.lng, status="active")
    db.add(a)
    db.commit()
    db.refresh(a)
    return a

@router.post("/{alert_id}/location", response_model=AlertOut)
def update_location(alert_id: int, payload: AlertUpdateLocation, user=Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.query(Alert).filter(Alert.id == alert_id, Alert.owner_user_id == user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    a.last_lat = payload.lat
    a.last_lng = payload.lng
    db.commit()
    db.refresh(a)
    return a

@router.post("/{alert_id}/resolve", response_model=AlertOut)
def resolve(alert_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    a = db.query(Alert).filter(Alert.id == alert_id, Alert.owner_user_id == user.id).first()
    if not a:
        raise HTTPException(status_code=404, detail="Alert not found")
    a.status = "resolved"
    db.commit()
    db.refresh(a)
    return a
