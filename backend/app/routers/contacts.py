from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.models.contact import Contact
from app.schemas.contact import ContactCreate, ContactOut
from app.routers.auth_dep import get_current_user

router = APIRouter(prefix="/contacts", tags=["contacts"])

@router.get("/", response_model=list[ContactOut])
def list_contacts(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Contact).filter(Contact.owner_user_id == user.id).all()

@router.post("/", response_model=ContactOut)
def create_contact(payload: ContactCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    c = Contact(owner_user_id=user.id, **payload.model_dump())
    db.add(c)
    db.commit()
    db.refresh(c)
    return c

@router.delete("/{contact_id}")
def delete_contact(contact_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(Contact).filter(Contact.id == contact_id, Contact.owner_user_id == user.id).first()
    if c:
        db.delete(c)
        db.commit()
    return {"ok": True}
