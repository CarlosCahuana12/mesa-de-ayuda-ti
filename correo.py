"""
ENVÍO DE CORREOS
----------------
Se envían en segundo plano para que el sistema no se ponga lento.
Si el SMTP no está configurado en .env, solo se anota en el registro (log).
"""
import logging
import smtplib
import threading
from email.message import EmailMessage
from html import escape

import config

registro = logging.getLogger("correo")


def _enviar(destinatario, asunto, texto, enlace):
    mensaje = EmailMessage()
    mensaje["From"] = f"{config.NOMBRE_SISTEMA} <{config.SMTP_REMITENTE}>"
    mensaje["To"] = destinatario
    mensaje["Subject"] = asunto
    mensaje.set_content(f"{texto}\n\nVer el ticket: {enlace}\n\n— {config.NOMBRE_SISTEMA}")
    mensaje.add_alternative(f"""
      <div style="font-family: Segoe UI, Arial, sans-serif; font-size: 15px; color: #1f2937;">
        <p>{escape(texto)}</p>
        <p><a href="{escape(enlace)}" style="background:#1a4d8f;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;">Ver el ticket</a></p>
        <p style="color:#6b7280;font-size:12px;">{escape(config.NOMBRE_SISTEMA)} · Este es un mensaje automático.</p>
      </div>""", subtype="html")
    try:
        with smtplib.SMTP(config.SMTP_SERVIDOR, config.SMTP_PUERTO, timeout=20) as smtp:
            smtp.starttls()
            if config.SMTP_USUARIO:
                smtp.login(config.SMTP_USUARIO, config.SMTP_CLAVE)
            smtp.send_message(mensaje)
        registro.info("Correo enviado a %s: %s", destinatario, asunto)
    except Exception as error:  # el sistema sigue funcionando aunque falle el correo
        registro.error("No se pudo enviar correo a %s: %s", destinatario, error)


def enviar_correo(destinatario, asunto, texto, ticket_id=None):
    enlace = f"{config.URL_SISTEMA}/ticket.html?id={ticket_id}" if ticket_id else config.URL_SISTEMA
    if not config.CORREO_ACTIVO:
        registro.info("[correo desactivado] Para %s: %s", destinatario, asunto)
        return
    threading.Thread(target=_enviar, args=(destinatario, asunto, texto, enlace), daemon=True).start()
