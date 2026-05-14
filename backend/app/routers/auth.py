from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.alert import Alert
from app.models.alert_notification import AlertNotification
from app.models.contact import Contact
from app.models.contact_push_subscription import ContactPushSubscription
from app.models.user import User
from app.schemas.user import UserCreate, UserOut
from app.schemas.token import TokenOut
from app.routers.auth_dep import get_current_user

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/register", response_model=UserOut)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    try:
        user = User(
            email=payload.email,
            name=payload.name,
            password_hash=hash_password(payload.password),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=TokenOut)
def login(email: str, password: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return TokenOut(access_token=create_access_token(str(user.id)))


@router.delete("/me")
def delete_account(user=Depends(get_current_user), db: Session = Depends(get_db)):
    (
        db.query(ContactPushSubscription)
        .filter(ContactPushSubscription.owner_user_id == user.id)
        .delete(synchronize_session=False)
    )
    deleted_notifications = (
        db.query(AlertNotification)
        .filter(AlertNotification.owner_user_id == user.id)
        .delete(synchronize_session=False)
    )
    deleted_alerts = (
        db.query(Alert)
        .filter(Alert.owner_user_id == user.id)
        .delete(synchronize_session=False)
    )
    deleted_contacts = (
        db.query(Contact)
        .filter(Contact.owner_user_id == user.id)
        .delete(synchronize_session=False)
    )
    deleted_users = (
        db.query(User)
        .filter(User.id == user.id)
        .delete(synchronize_session=False)
    )

    if deleted_users != 1:
        db.rollback()
        raise HTTPException(status_code=404, detail="User not found")

    db.commit()

    return {
        "ok": True,
        "deleted_contacts": deleted_contacts,
        "deleted_alerts": deleted_alerts,
        "deleted_notifications": deleted_notifications,
    }
