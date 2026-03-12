from pydantic import BaseModel, EmailStr, field_validator

MAX_BCRYPT_BYTES = 72

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

    @field_validator("password")
    @classmethod
    def password_max_bytes(cls, v: str) -> str:
        if len(v.encode("utf-8")) > MAX_BCRYPT_BYTES:
            raise ValueError("Password is too long (max 72 bytes). Use 72 ASCII chars or fewer.")
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class UserOut(BaseModel):
    id: int
    email: EmailStr
    name: str

    class Config:
        from_attributes = True
