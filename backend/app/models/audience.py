"""HTTP schemas for audience."""

from pydantic import BaseModel

from app.models.users import UserLite
from app.services.audience import AudiencePreview


class AudienceRequest(BaseModel):
    circle_ids: list[str] = []
    user_ids: list[str] = []

class CircleRef(BaseModel):
    id: str
    name: str

class AudienceSummary(BaseModel):
    count: int
    circles: list[CircleRef]
    people: list[UserLite]

    @classmethod
    def from_domain(cls, preview: AudiencePreview) -> "AudienceSummary":
        return cls(
            count=preview.count,
            circles=[CircleRef(id=c.id, name=c.name) for c in preview.circles],
            people=[UserLite.model_validate(u) for u in preview.people],
        )
