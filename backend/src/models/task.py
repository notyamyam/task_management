from ..database import Base
from sqlalchemy import Column, Integer, String, Boolean, ForeignKey

class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    description = Column(String)
    completed = Column(Boolean, default=False)
    user_id = Column(Integer, ForeignKey("users.id"))  # Foreign key to User model (assuming user_id is an integer)