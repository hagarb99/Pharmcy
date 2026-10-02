import os
import uuid
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status

from app.api.deps import get_current_active_user
from app.models.user import User

router = APIRouter()

STORAGE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "storage" / "prescriptions"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB


@router.post("/prescription")
async def upload_prescription_image(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
):
    """
    Securely upload a prescription image or PDF for a medical request.
    Stores the file internally in a non-public storage directory.
    Access to the uploaded file is strictly restricted to authorized parties via
    GET /requests/{request_id}/prescription-image.
    """
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"نوع الملف غير مدعوم. الصيغ المسموح بها هي: {', '.join(ALLOWED_EXTENSIONS)}",
        )

    # Read and validate size
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="الملف المرفوع فارغ.",
        )
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="حجم الملف يتجاوز الحد الأقصى المسموح به (5 ميجابايت).",
        )

    safe_filename = f"{uuid.uuid4()}{ext}"
    target_path = STORAGE_DIR / safe_filename

    with open(target_path, "wb") as f:
        f.write(content)

    return {
        "filename": safe_filename,
        "content_type": file.content_type,
        "size_bytes": len(content),
    }
