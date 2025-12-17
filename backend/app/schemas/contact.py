from pydantic import BaseModel

class ContactCreate(BaseModel):
    name: str
    phone: str
    is_emergency: bool = True

class ContactOut(BaseModel):
    id: int
    name: str
    phone: str
    is_emergency: bool
    class Config:
        from_attributes = True
