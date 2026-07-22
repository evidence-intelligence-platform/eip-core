"""
EIF: User Authentication & JWT Auth Router
---
Version: 1.0.0
Owner: EIF Architecture Team
Compliance: 06_API_CONTRACTS.md — User authentication & token issuance
"""

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlmodel import Session, select

from src.db.database import get_session
from src.db.models import Candidate, UserAccount
from src.security.jwt import create_access_token, get_current_user_payload, hash_password, verify_password

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["authentication"],
)


class RegisterRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., min_length=6, description="Password (min 6 chars)")
    role: Literal["employer", "candidate", "admin"] = Field("candidate", description="User role")
    full_name: str | None = Field(None, description="Candidate or Employer name")


class LoginRequest(BaseModel):
    email: EmailStr = Field(..., description="User email address")
    password: str = Field(..., description="User password")


class AuthTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email: str
    role: str


class UserProfileResponse(BaseModel):
    id: int
    email: str
    role: str
    created_at: str


@router.post(
    "/register",
    response_model=AuthTokenResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user (Employer or Candidate)",
)
def register_user(
    request: RegisterRequest,
    session: Session = Depends(get_session),
) -> AuthTokenResponse:
    """Registers a new UserAccount and auto-generates a Candidate profile if role is 'candidate'."""
    existing = session.exec(select(UserAccount).where(UserAccount.email == request.email)).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"User with email '{request.email}' already exists."
        )

    hashed_pw = hash_password(request.password)
    user = UserAccount(
        email=request.email,
        hashed_password=hashed_pw,
        role=request.role,
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    # If role is candidate, ensure a Candidate record exists
    if request.role == "candidate":
        ext_id = f"cand_{user.id}"
        existing_cand = session.exec(select(Candidate).where(Candidate.external_id == ext_id)).first()
        if not existing_cand:
            cand = Candidate(
                external_id=ext_id,
                name=request.full_name or request.email.split('@')[0],
                consent_granted=True,
            )
            session.add(cand)
            session.commit()

    token = create_access_token({"sub": user.email, "user_id": user.id, "role": user.role})
    return AuthTokenResponse(
        access_token=token,
        email=user.email,
        role=user.role,
    )


@router.post(
    "/login",
    response_model=AuthTokenResponse,
    summary="Authenticate user and return JWT Access Token",
)
def login_user(
    request: LoginRequest,
    session: Session = Depends(get_session),
) -> AuthTokenResponse:
    """Authenticates credentials and issues a JWT token."""
    user = session.exec(select(UserAccount).where(UserAccount.email == request.email)).first()
    if not user or not verify_password(request.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = create_access_token({"sub": user.email, "user_id": user.id, "role": user.role})
    return AuthTokenResponse(
        access_token=token,
        email=user.email,
        role=user.role,
    )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    summary="Get current user profile",
)
def get_me(
    payload: dict = Depends(get_current_user_payload),
    session: Session = Depends(get_session),
) -> UserProfileResponse:
    """Returns the profile of the currently authenticated user."""
    email = payload.get("sub")
    user = session.exec(select(UserAccount).where(UserAccount.email == email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        role=user.role,
        created_at=user.created_at.isoformat(),
    )
