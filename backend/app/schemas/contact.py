import re

from pydantic import BaseModel, field_validator


UK_MOBILE_RE = re.compile(r"^(?:\+447\d{9}|07\d{9})$")


def normalize_contact_phone(phone: str) -> str:
    return re.sub(r"[\s()-]", "", phone).strip()


class ContactCreate(BaseModel):
    name: str
    phone: str
    is_emergency: bool = True

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        name = value.strip()
        if not name:
            raise ValueError("Enter a contact name.")
        return name

    @field_validator("phone")
    @classmethod
    def validate_phone(cls, value: str) -> str:
        phone = normalize_contact_phone(value)
        if not UK_MOBILE_RE.fullmatch(phone):
            raise ValueError("Enter a UK mobile number starting with +447 or 07.")
        return phone


class ContactOut(BaseModel):
    id: int
    name: str
    phone: str
    is_emergency: bool

    class Config:
        from_attributes = True
