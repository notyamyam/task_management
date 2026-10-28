import asyncio
import json
import os
import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
from unittest.mock import patch


os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")
os.environ.setdefault("ALGORITHM", "HS256")

from src.security import auth
from src.database import get_db
from src.models import Permission, Role, RolePermission, User, UserRole
from src.routers.user import replace_temporary_password, router as user_router
from src.schemas import TemporaryPasswordChange


def request(app, method, path, *, headers=None, json_body=None, form_body=None):
    body = b""
    request_headers = [(key.lower().encode(), value.encode()) for key, value in (headers or {}).items()]
    if json_body is not None:
        body = json.dumps(json_body).encode()
        request_headers.append((b"content-type", b"application/json"))
    elif form_body is not None:
        from urllib.parse import urlencode

        body = urlencode(form_body).encode()
        request_headers.append(
            (b"content-type", b"application/x-www-form-urlencoded")
        )
    request_headers.append((b"content-length", str(len(body)).encode()))
    sent = []
    received = False

    async def receive():
        nonlocal received
        if not received:
            received = True
            return {"type": "http.request", "body": body, "more_body": False}
        return {"type": "http.disconnect"}

    async def send(message):
        sent.append(message)

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method,
        "scheme": "http",
        "path": path,
        "raw_path": path.encode(),
        "query_string": b"",
        "root_path": "",
        "headers": request_headers,
        "client": ("test", 123),
        "server": ("testserver", 80),
    }
    asyncio.run(app(scope, receive, send))
    start = next(message for message in sent if message["type"] == "http.response.start")
    response_body = b"".join(
        message.get("body", b"")
        for message in sent
        if message["type"] == "http.response.body"
    )
    return start["status"], json.loads(response_body or b"null")


class AccountAccessTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite+pysqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        User.__table__.create(self.engine)
        Role.__table__.create(self.engine)
        Permission.__table__.create(self.engine)
        RolePermission.__table__.create(self.engine)
        UserRole.__table__.create(self.engine)
        self.db = sessionmaker(bind=self.engine)()
        app = FastAPI()
        app.include_router(user_router)
        app.dependency_overrides[get_db] = lambda: self.db
        self.app = app

    def tearDown(self):
        self.db.close()
        self.engine.dispose()

    def add_user(self, **values):
        user = User(
            email=values.pop("email", "user@example.com"),
            password=values.pop("password", "stored-hash"),
            **values,
        )
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def authorization(self, user):
        token = auth.create_access_token(
            {"sub": user.email, "auth_version": user.auth_version}
        )
        return {"Authorization": f"Bearer {token}"}

    def test_disabled_and_deleted_users_are_rejected(self):
        for status in ("disabled", "deleted"):
            with self.subTest(status=status), self.assertRaises(HTTPException) as error:
                auth.ensure_login_allowed(
                    SimpleNamespace(status=status, must_change_password=False)
                )

            self.assertEqual(error.exception.status_code, 401)

    def test_temporary_password_allows_identity_but_blocks_normal_access(self):
        user = SimpleNamespace(status="active", must_change_password=True)

        self.assertIsNone(auth.ensure_login_allowed(user))
        with self.assertRaises(HTTPException) as error:
            auth.require_password_changed(user)

        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(error.exception.detail["code"], "password_change_required")

    def test_identity_profile_allows_temporary_password_but_account_work_is_blocked(self):
        user = self.add_user(
            must_change_password=True,
            status="active",
            first_name="Temporary",
            last_name="User",
        )
        headers = self.authorization(user)

        profile_status, profile = request(self.app, "GET", "/users/me", headers=headers)
        update_status, update = request(
            self.app,
            "PUT",
            "/users/me",
            headers=headers,
            json_body={"first_name": "Changed", "last_name": "Name"},
        )

        self.assertEqual(profile_status, 200)
        self.assertTrue(profile["must_change_password"])
        self.assertEqual(update_status, 403)
        self.assertEqual(
            update["detail"]["code"],
            "password_change_required",
        )

    def test_password_gate_is_exposed_only_by_self_profile(self):
        user = self.add_user(
            status="active",
            must_change_password=False,
            first_name="Profile",
            last_name="User",
        )
        headers = self.authorization(user)

        me_status, me_response = request(
            self.app,
            "GET",
            "/users/me",
            headers=headers,
        )
        update_status, update_response = request(
            self.app,
            "PUT",
            "/users/me",
            headers=headers,
            json_body={"first_name": "Updated", "last_name": "User"},
        )
        list_status, list_response = request(
            self.app,
            "GET",
            "/users/",
            headers=headers,
        )

        self.assertEqual(me_status, 200)
        self.assertIn("must_change_password", me_response)
        self.assertEqual(update_status, 200)
        self.assertNotIn("must_change_password", update_response)
        self.assertEqual(list_status, 403)
        self.assertEqual(list_response["detail"]["code"], "permission_denied")

    def test_inactive_token_identity_is_rejected_without_status_disclosure(self):
        for status in ("disabled", "deleted"):
            with self.subTest(status=status):
                user = self.add_user(
                    email=f"{status}@example.com",
                    status=status,
                )

                response_status, response = request(
                    self.app,
                    "GET",
                    "/users/me",
                    headers=self.authorization(user),
                )

                self.assertEqual(response_status, 401)
                self.assertEqual(response, {"detail": "Invalid token"})

    def test_login_contracts_expose_temporary_password_gate(self):
        password = "correct-password"
        user = self.add_user(
            password=auth.hash_password(password),
            must_change_password=True,
            status="active",
            google_sub="google-user-id",
        )

        json_status, json_login = request(
            self.app,
            "POST",
            "/users/login",
            json_body={"email": user.email, "password": password},
        )
        oauth_status, oauth_login = request(
            self.app,
            "POST",
            "/users/token",
            form_body={"username": user.email, "password": password},
        )
        claims = {
            "sub": user.google_sub,
            "email": user.email,
            "email_verified": True,
        }
        with (
            patch("src.routers.user.settings.google_client_id", "client-id"),
            patch("src.routers.user.id_token.verify_oauth2_token", return_value=claims),
        ):
            google_status, google_login = request(
                self.app,
                "POST",
                "/users/google",
                json_body={"credential": "verified-by-test-double"},
            )

        self.assertEqual(json_status, 200)
        self.assertIn("token", json_login)
        self.assertNotIn("access_token", json_login)
        self.assertTrue(json_login["must_change_password"])
        self.assertEqual(oauth_status, 200)
        self.assertIn("access_token", oauth_login)
        self.assertNotIn("token", oauth_login)
        self.assertTrue(oauth_login["must_change_password"])
        self.assertEqual(google_status, 200)
        self.assertIn("token", google_login)
        self.assertTrue(google_login["must_change_password"])

    def test_inactive_password_logins_use_generic_credentials_error(self):
        password = "correct-password"
        for status in ("disabled", "deleted"):
            with self.subTest(status=status):
                user = self.add_user(
                    email=f"login-{status}@example.com",
                    password=auth.hash_password(password),
                    status=status,
                )

                json_status, json_login = request(
                    self.app,
                    "POST",
                    "/users/login",
                    json_body={"email": user.email, "password": password},
                )
                oauth_status, oauth_login = request(
                    self.app,
                    "POST",
                    "/users/token",
                    form_body={"username": user.email, "password": password},
                )

                self.assertEqual(json_status, 401)
                self.assertEqual(json_login, {"detail": "Invalid Credentials"})
                self.assertEqual(oauth_status, 401)
                self.assertEqual(oauth_login, {"detail": "Invalid Credentials"})

    def test_password_logins_hash_all_generic_failure_paths_once(self):
        stored_hash = auth.hash_password("stored-password")
        self.add_user(
            email="passwordless@example.com",
            password=None,
            status="active",
        )
        self.add_user(
            email="timing-disabled@example.com",
            password=stored_hash,
            status="disabled",
        )
        self.add_user(
            email="timing-deleted@example.com",
            password=stored_hash,
            status="deleted",
        )
        attempts = (
            "missing@example.com",
            "passwordless@example.com",
            "timing-disabled@example.com",
            "timing-deleted@example.com",
        )

        for endpoint in ("/users/login", "/users/token"):
            with self.subTest(endpoint=endpoint):
                checked_hashes = []

                def record_verification(password, password_hash):
                    checked_hashes.append(password_hash)
                    return False

                with patch.object(
                    auth,
                    "verify_password",
                    side_effect=record_verification,
                ):
                    responses = []
                    for email in attempts:
                        request_arguments = (
                            {"json_body": {"email": email, "password": "wrong"}}
                            if endpoint == "/users/login"
                            else {
                                "form_body": {
                                    "username": email,
                                    "password": "wrong",
                                }
                            }
                        )
                        responses.append(
                            request(
                                self.app,
                                "POST",
                                endpoint,
                                **request_arguments,
                            )
                        )

                self.assertEqual(
                    responses,
                    [(401, {"detail": "Invalid Credentials"})] * len(attempts),
                )
                self.assertEqual(len(checked_hashes), len(attempts))
                self.assertEqual(checked_hashes[0], checked_hashes[1])
                self.assertEqual(checked_hashes[2:], [stored_hash, stored_hash])
                self.assertFalse(
                    auth.verify_password("not-the-dummy-password", checked_hashes[0])
                )

    def test_google_cannot_link_or_reactivate_inactive_tombstone(self):
        for status in ("disabled", "deleted"):
            with self.subTest(status=status):
                user = self.add_user(
                    email=f"google-{status}@gmail.com",
                    status=status,
                    google_sub=None,
                )
                claims = {
                    "sub": f"google-{status}",
                    "email": user.email,
                    "email_verified": True,
                }

                with (
                    patch("src.routers.user.settings.google_client_id", "client-id"),
                    patch(
                        "src.routers.user.id_token.verify_oauth2_token",
                        return_value=claims,
                    ),
                ):
                    response_status, response = request(
                        self.app,
                        "POST",
                        "/users/google",
                        json_body={"credential": "verified-by-test-double"},
                    )

                self.db.refresh(user)
                self.assertEqual(response_status, 401)
                self.assertEqual(response, {"detail": "Invalid Credentials"})
                self.assertIsNone(user.google_sub)

    def test_inactive_password_reset_request_keeps_public_response_without_otp(self):
        expected_response = {
            "message": "If an account exists for that email, a reset code has been sent."
        }
        for status in ("disabled", "deleted"):
            with self.subTest(status=status):
                user = self.add_user(
                    email=f"reset-request-{status}@example.com",
                    status=status,
                )

                with (
                    patch("src.routers.user.is_smtp_configured", return_value=True),
                    patch("src.routers.user.deliver_password_reset_otp"),
                ):
                    response_status, response = request(
                        self.app,
                        "POST",
                        "/users/password-reset/request",
                        json_body={"email": user.email},
                    )

                self.db.refresh(user)
                self.assertEqual(response_status, 202)
                self.assertEqual(response, expected_response)
                self.assertIsNone(user.password_reset_otp_hash)
                self.assertIsNone(user.password_reset_otp_expires_at)
                self.assertIsNone(user.password_reset_requested_at)

    def test_inactive_password_reset_confirmation_fails_without_mutation(self):
        otp = "123456"
        old_password = "stored-password-hash"
        for status in ("disabled", "deleted"):
            with self.subTest(status=status):
                user = self.add_user(
                    email=f"reset-confirm-{status}@example.com",
                    password=old_password,
                    status=status,
                    auth_version=4,
                    password_reset_otp_hash=auth.hash_password_reset_otp(1, otp),
                    password_reset_otp_expires_at=datetime.now(timezone.utc)
                    + timedelta(minutes=5),
                )
                user.password_reset_otp_hash = auth.hash_password_reset_otp(user.id, otp)
                self.db.commit()

                response_status, response = request(
                    self.app,
                    "POST",
                    "/users/password-reset/confirm",
                    json_body={
                        "email": user.email,
                        "otp": otp,
                        "new_password": "replacement-password",
                    },
                )

                self.db.refresh(user)
                self.assertEqual(response_status, 400)
                self.assertEqual(response, {"detail": "Invalid or expired OTP"})
                self.assertEqual(user.password, old_password)
                self.assertEqual(user.auth_version, 4)
                self.assertIsNotNone(user.password_reset_otp_hash)

    def test_temporary_password_replacement_clears_state_and_revokes_token(self):
        user = self.add_user(
            password=auth.hash_password("temporary-password"),
            status="active",
            must_change_password=True,
            auth_version=6,
            password_reset_otp_hash="reset-hash",
            password_reset_otp_expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=5),
            password_reset_requested_at=datetime.now(timezone.utc),
            password_reset_attempts=3,
        )
        headers = self.authorization(user)

        response_status, response = request(
            self.app,
            "PUT",
            "/users/me/temporary-password",
            headers=headers,
            json_body={"new_password": "replacement-password"},
        )

        self.db.refresh(user)
        self.assertEqual(response_status, 200)
        self.assertEqual(
            response,
            {
                "message": (
                    "Temporary password changed successfully. Please sign in again."
                )
            },
        )
        self.assertTrue(auth.verify_password("replacement-password", user.password))
        self.assertFalse(user.must_change_password)
        self.assertIsNone(user.password_reset_otp_hash)
        self.assertIsNone(user.password_reset_otp_expires_at)
        self.assertIsNone(user.password_reset_requested_at)
        self.assertEqual(user.password_reset_attempts, 0)
        self.assertEqual(user.auth_version, 7)

        old_token_status, old_token_response = request(
            self.app,
            "GET",
            "/users/me",
            headers=headers,
        )
        self.assertEqual(old_token_status, 401)
        self.assertEqual(old_token_response, {"detail": "Invalid token"})

    def test_only_one_stale_temporary_password_replacement_can_succeed(self):
        user = self.add_user(
            password=auth.hash_password("temporary-password"),
            status="active",
            must_change_password=True,
            auth_version=6,
        )
        Session = sessionmaker(bind=self.engine)
        first_db = Session()
        second_db = Session()
        first_user = first_db.query(User).filter(User.id == user.id).one()
        second_user = second_db.query(User).filter(User.id == user.id).one()

        try:
            first_response = replace_temporary_password(
                TemporaryPasswordChange(new_password="first-replacement"),
                first_db,
                first_user,
            )
            with self.assertRaises(HTTPException) as stale_error:
                replace_temporary_password(
                    TemporaryPasswordChange(new_password="second-replacement"),
                    second_db,
                    second_user,
                )
        finally:
            first_db.close()
            second_db.close()

        self.db.expire_all()
        persisted_user = self.db.query(User).filter(User.id == user.id).one()
        self.assertEqual(
            first_response,
            {
                "message": (
                    "Temporary password changed successfully. Please sign in again."
                )
            },
        )
        self.assertEqual(stale_error.exception.status_code, 400)
        self.assertEqual(
            stale_error.exception.detail,
            "Temporary password change is not required.",
        )
        self.assertTrue(
            auth.verify_password("first-replacement", persisted_user.password)
        )
        self.assertFalse(
            auth.verify_password("second-replacement", persisted_user.password)
        )
        self.assertEqual(persisted_user.auth_version, 7)

    def test_temporary_password_replacement_requires_gate_flag(self):
        user = self.add_user(status="active", must_change_password=False)

        response_status, response = request(
            self.app,
            "PUT",
            "/users/me/temporary-password",
            headers=self.authorization(user),
            json_body={"new_password": "replacement-password"},
        )

        self.assertEqual(response_status, 400)
        self.assertEqual(
            response,
            {"detail": "Temporary password change is not required."},
        )

    def test_temporary_password_replacement_validates_length(self):
        for password in ("1234567", "x" * 129):
            with self.subTest(length=len(password)):
                user = self.add_user(
                    email=f"length-{len(password)}@example.com",
                    status="active",
                    must_change_password=True,
                )

                response_status, _ = request(
                    self.app,
                    "PUT",
                    "/users/me/temporary-password",
                    headers=self.authorization(user),
                    json_body={"new_password": password},
                )

                self.db.refresh(user)
                self.assertEqual(response_status, 422)
                self.assertTrue(user.must_change_password)


if __name__ == "__main__":
    unittest.main()
