from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+psycopg://guardian:guardian@localhost:5432/guardian"
    JWT_SECRET: str = "change-me"
    JWT_ALG: str = "HS256"
    ACCESS_TOKEN_MINUTES: int = 60 * 24 * 7
    ALERT_AUTO_EXPIRY_MINUTES: int = 60
    WATCHER_TOKEN_MINUTES: int = 60 * 24
    WATCHER_BASE_URL: str = "https://guardian-circle.invalid"
    EXPO_PUSH_API_URL: str = "https://exp.host/--/api/v2/push/send"
    EXPO_PUSH_TIMEOUT_SECONDS: float = 5.0
    EXPO_PUSH_ACCESS_TOKEN: str | None = None
    RATE_LIMIT_REGISTER_MAX_REQUESTS: int = 10
    RATE_LIMIT_REGISTER_WINDOW_SECONDS: int = 15 * 60
    RATE_LIMIT_LOGIN_MAX_REQUESTS: int = 10
    RATE_LIMIT_LOGIN_WINDOW_SECONDS: int = 60
    RATE_LIMIT_ALERT_CREATE_MAX_REQUESTS: int = 5
    RATE_LIMIT_ALERT_CREATE_WINDOW_SECONDS: int = 60

    class Config:
        env_file = ".env"


settings = Settings()
