from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import hash_password, verify_password, create_access_token
from app.models.user import User
from app.schemas.user import UserCreate, UserOut
from app.schemas.token import TokenOut

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
