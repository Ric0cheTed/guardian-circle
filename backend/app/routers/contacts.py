from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.audit import log_audit_event
from app.core.database import get_db
from app.models.contact import Contact
from app.models.contact_push_subscription import ContactPushSubscription
from app.schemas.contact import ContactCreate, ContactOut, normalize_contact_phone
from app.routers.auth_dep import get_current_user

router = APIRouter(prefix="/contacts", tags=["contacts"])

@router.get("/", response_model=list[ContactOut])
def list_contacts(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Contact).filter(Contact.owner_user_id == user.id).all()

@router.post("/", response_model=ContactOut)
def create_contact(payload: ContactCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    existing_contacts = db.query(Contact).filter(Contact.owner_user_id == user.id).all()
    if any(normalize_contact_phone(contact.phone) == payload.phone for contact in existing_contacts):
        raise HTTPException(status_code=400, detail="A trusted contact with this phone number already exists")

    c = Contact(owner_user_id=user.id, **payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    log_audit_event(
        "contact.added",
        contact_id=c.id,
        is_emergency=c.is_emergency,
        user_id=user.id,
    )
    return c

@router.delete("/{contact_id}")
def delete_contact(contact_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.owner_user_id == user.id).first()
    if c:
        is_emergency = c.is_emergency
        (
            db.query(ContactPushSubscription)
            .filter(
                ContactPushSubscription.owner_user_id == user.id,
                ContactPushSubscription.contact_id == contact_id,
            )
            .delete(synchronize_session=False)
        )
        db.delete(c)
        db.commit()
        log_audit_event(
            "contact.removed",
            contact_id=contact_id,
            is_emergency=is_emergency,
            user_id=user.id,
        )
    return {"ok": True}
