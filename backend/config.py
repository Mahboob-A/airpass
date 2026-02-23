"""Application configuration loaded from environment variables.

This is the single source of truth for all settings.
Never access os.environ directly outside this module.

See SRS.md §9 for the complete list of environment variables.
"""
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """All application settings, loaded from environment or .env file."""

    # Server
    app_host: str = Field(default="0.0.0.0", env="APP_HOST")
    app_port: int = Field(default=8000, env="APP_PORT")
    app_env: str = Field(default="development", env="APP_ENV")

    # Security
    secret_key: str = Field(default="dev-secret-key", env="SECRET_KEY")
    bcrypt_rounds: int = Field(default=12, env="BCRYPT_ROUNDS")

    # TURN server (required for production; see deployment-doc.md §4)
    turn_url: str = Field(default="", env="TURN_URL")
    turn_username: str = Field(default="", env="TURN_USERNAME")
    turn_credential: str = Field(default="", env="TURN_CREDENTIAL")

    # Room management
    room_expiry_minutes: int = Field(default=30, env="ROOM_EXPIRY_MINUTES")
    max_rooms: int = Field(default=5000, env="MAX_ROOMS")

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


settings = Settings()
