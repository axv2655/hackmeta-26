from fastapi import APIRouter

from app.api.routes import home, notes

api_router = APIRouter()
api_router.include_router(home.router)
api_router.include_router(notes.router)
