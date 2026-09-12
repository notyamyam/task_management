from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    database_url: str
    secret_key: str
    algorithm: str
    google_client_id: str = Field(
        default="",
        validation_alias=AliasChoices("GOOGLE_CLIENT_ID", "VITE_GOOGLE_CLIENT_ID"),
    )
    access_token_expire_minutes: int = 30

    class Config:
        env_file = ".env"
        case_sensitive = False

settings = Settings()
