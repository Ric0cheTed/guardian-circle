from pydantic import BaseModel, field_validator


class UserCreate(BaseModel):
    email: str
    password: str
    name: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or value.startswith("@") or value.endswith("@"):
            raise ValueError("Invalid email")
        return value


class UserOut(BaseModel):
    id: int
    email: str
    name: str

    class Config:
        from_attributes = True
