from ..database import Base
from sqlalchemy import Column, Integer, String


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Keep the existing database column name so current installations do not need a migration.
    email = Column("username", String, unique=True, nullable=False)
    password = Column(String, nullable=False)
