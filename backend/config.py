from pathlib import Path
from pydantic_settings import BaseSettings

_ENV_FILE = Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"
    demo_mode: bool = False

    class Config:
        env_file = str(_ENV_FILE)

    def get_allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
