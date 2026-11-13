"""Media outside the API prefix (core C8, ARCHITECTURE.md 7.4).

GET /media/{filename}                  a Moment's bytes, if the caller may see it
GET /media/seed/marks/{asset_name}     a public demo Mark photo (manifest allowlist)

Private media is never a public mount: a pending Moment must not be reachable
by URL alone, so the first route needs `X-User-Id` like every other route.
The Mark route serves only names listed in the seed manifest, so it cannot
reach uploads or the filesystem.
"""

from fastapi import APIRouter, HTTPException, Response
from fastapi.responses import FileResponse

from app.api.deps_core import CurrentUserDep
from app.api.routes.moments import MomentServiceDep, serve_moment_media
from app.seed.media import public_mark_asset

router = APIRouter(tags=["media"])


@router.get("/media/seed/marks/{asset_name}")
def get_seed_mark_image(asset_name: str) -> Response:
    data = public_mark_asset(asset_name)
    if data is None:
        raise HTTPException(status_code=404, detail="Not found")
    return Response(
        data,
        media_type="image/png",
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/media/{filename}", response_class=FileResponse)
def get_media(
    filename: str, user: CurrentUserDep, moments: MomentServiceDep
) -> FileResponse:
    return serve_moment_media(moments, user.id, filename)
