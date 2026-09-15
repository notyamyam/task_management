import smtplib
import ssl
from email.message import EmailMessage

from ..security.config import settings


def is_smtp_configured() -> bool:
    return bool(
        settings.smtp_host
        and settings.smtp_from_email
        and (settings.smtp_use_tls or settings.smtp_use_ssl)
    )


def send_password_reset_otp(recipient: str, otp: str) -> None:
    if not is_smtp_configured():
        raise RuntimeError("Secure SMTP is not configured")

    message = EmailMessage()
    message["Subject"] = "Your Corner password reset code"
    message["From"] = settings.smtp_from_email
    message["To"] = recipient
    message.set_content(
        "Use this one-time code to reset your Corner password:\n\n"
        f"{otp}\n\n"
        "This code expires in 10 minutes. If you did not request a password "
        "reset, you can ignore this email."
    )

    context = ssl.create_default_context()
    if settings.smtp_use_ssl:
        server = smtplib.SMTP_SSL(
            settings.smtp_host,
            settings.smtp_port,
            timeout=10,
            context=context,
        )
    else:
        server = smtplib.SMTP(
            settings.smtp_host,
            settings.smtp_port,
            timeout=10,
        )

    with server:
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            server.starttls(context=context)
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password)
        server.send_message(message)
