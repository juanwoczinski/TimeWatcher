"""Transactional e-mail via Resend, behind the RESEND_API_KEY feature flag.

No third-party dependency: the Resend REST API is called with urllib. When the
key is absent every send is a no-op returning {"ok": False, "skipped": True},
so invites keep working (the caller still returns the magic link to copy).
Any network/API error is swallowed into {"ok": False, "error": ...} -- sending
e-mail must never break the request that triggered it.

Design: a restrained enterprise-letter layout (not the templated "gradient hero
on a rounded card" look). Left-aligned, hairline rules, an uppercase eyebrow
label, a tabular meta block (Workspace / Perfil / Validade) and a solid ink
button -- table-based with inline styles so it renders in Gmail/Apple/Outlook.
render_email() is the shared template every message type reuses.
"""

import json
import os
import urllib.error
import urllib.request

API_URL = "https://api.resend.com/emails"
API_KEY = os.environ.get("RESEND_API_KEY", "").strip()
# e.g. "TimeWatcher <no-reply@seu-dominio.com>" -- must be a Resend-verified sender
MAIL_FROM = os.environ.get("TIMEWATCHER_MAIL_FROM", "TimeWatcher <onboarding@resend.dev>").strip()
BRAND = os.environ.get("TIMEWATCHER_BRAND", "TimeWatcher").strip()
TAGLINE = os.environ.get("TIMEWATCHER_TAGLINE", "Synova IT").strip()
APP_URL = os.environ.get("PUBLIC_URL", "https://timewatcher.32-193-139-223.sslip.io").rstrip("/")
LOGO_URL = os.environ.get("TIMEWATCHER_LOGO_URL", f"{APP_URL}/timewatcher-logo.png")
SUPPORT = os.environ.get("TIMEWATCHER_SUPPORT", "").strip()

FONT = "Helvetica Neue,Helvetica,Arial,-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif"
INK = "#15171e"     # headings, button, strong values
BODY = "#4b515e"    # paragraph text
MUTE = "#8b909c"    # labels, footer
FAINT = "#aab0bc"   # eyebrow dot / least important
RULE = "#e7eaf0"    # hairlines
PAGE = "#f3f4f6"    # outer background
ACCENT = "#3b40c4"  # a single, restrained accent (links only)

# Only place that needs CSS braces -> kept out of the f-strings below.
_HEAD = (
    '<style>'
    'a{text-decoration:none}'
    'body{margin:0;padding:0}'
    '@media only screen and (max-width:620px){'
    '.tw-doc{width:100%!important}'
    '.tw-pad{padding:30px 26px!important}'
    '.tw-meta td{font-size:13px!important}'
    '}'
    '</style>'
)


def enabled() -> bool:
    return bool(API_KEY)


def send(to: str, subject: str, html: str, text: str | None = None) -> dict:
    """Send one e-mail. Returns {ok, id?} / {ok:False, skipped|error}."""
    if not API_KEY:
        return {"ok": False, "skipped": True}
    payload = {"from": MAIL_FROM, "to": [to], "subject": subject, "html": html}
    if text:
        payload["text"] = text
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(payload).encode(),
        method="POST",
        headers={
            "Authorization": f"Bearer {API_KEY}",
            "Content-Type": "application/json",
            # api.resend.com sits behind Cloudflare, which blocks the default
            # "Python-urllib" agent (CF error 1010). A real UA gets through.
            "User-Agent": "TimeWatcher-Mailer/1.0 (+https://synova.it)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = json.loads(response.read() or b"{}")
            return {"ok": True, "id": body.get("id")}
    except urllib.error.HTTPError as error:
        detail = ""
        try:
            detail = error.read().decode()[:300]
        except Exception:
            pass
        return {"ok": False, "error": f"http_{error.code}", "detail": detail}
    except Exception as error:  # timeout, DNS, etc. -- never propagate
        return {"ok": False, "error": type(error).__name__}


def _button(label: str, url: str) -> str:
    # Solid ink, squared -- deliberately not a gradient pill.
    return (
        '<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:28px 0 8px">'
        '<tr><td bgcolor="' + INK + '" style="border-radius:6px">'
        '<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" '
        'href="' + url + '" style="height:46px;v-text-anchor:middle;width:260px" arcsize="13%" strokecolor="' + INK + '" fillcolor="' + INK + '">'
        '<w:anchorlock/><center style="color:#ffffff;font-family:' + FONT + ';font-size:15px;font-weight:600">' + label + '</center>'
        '</v:roundrect><![endif]-->'
        '<!--[if !mso]><!-- -->'
        '<a href="' + url + '" style="display:inline-block;padding:14px 30px;font-family:' + FONT + ';'
        'font-size:15px;font-weight:600;line-height:1;letter-spacing:.2px;color:#ffffff;border-radius:6px;background:' + INK + '">' + label + '</a>'
        '<!--<![endif]-->'
        '</td></tr></table>'
    )


def _meta_block(meta: list) -> str:
    if not meta:
        return ""
    rows = ""
    last = len(meta) - 1
    for i, (label, value) in enumerate(meta):
        border = "" if i == last else f"border-bottom:1px solid {RULE}"
        rows += (
            f'<tr><td style="padding:12px 0;{border};font-family:{FONT};font-size:12px;letter-spacing:.4px;'
            f'text-transform:uppercase;color:{MUTE};white-space:nowrap">{label}</td>'
            f'<td style="padding:12px 0;{border};font-family:{FONT};font-size:14px;font-weight:600;color:{INK};text-align:right">{value}</td></tr>'
        )
    return (
        f'<table role="presentation" class="tw-meta" width="100%" border="0" cellpadding="0" cellspacing="0" '
        f'style="margin:24px 0 6px;border-top:1px solid {RULE};border-bottom:1px solid {RULE}">{rows}</table>'
    )


def _p(text: str) -> str:
    return f'<p style="margin:0 0 14px;font-family:{FONT};font-size:15px;line-height:1.65;color:{BODY}">{text}</p>'


def render_email(preheader: str, eyebrow: str, heading: str, body_html: str,
                 meta: list | None = None, button_label: str | None = None,
                 button_url: str | None = None, footnote: str | None = None) -> str:
    """Full, email-client-safe HTML document. body_html is inline-styled HTML."""
    button = _button(button_label, button_url) if button_label and button_url else ""
    fallback = ""
    if button_url:
        fallback = (
            f'<p style="margin:16px 0 0;font-family:{FONT};font-size:12px;line-height:1.7;color:{MUTE}">'
            f'Ou copie este endere&ccedil;o no navegador:<br>'
            f'<a href="{button_url}" style="color:{ACCENT};word-break:break-all">{button_url}</a></p>'
        )
    support_line = f'<br>Suporte: <a href="mailto:{SUPPORT}" style="color:{MUTE}">{SUPPORT}</a>' if SUPPORT else ""
    note = (
        f'<p style="margin:16px 0 0;font-family:{FONT};font-size:12px;line-height:1.7;color:{MUTE}">{footnote}</p>'
        if footnote else ""
    )
    return (
        '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<meta name="x-apple-disable-message-reformatting">'
        f'<title>{BRAND}</title>{_HEAD}</head>'
        f'<body style="background:{PAGE}">'
        f'<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:{PAGE};font-size:1px;line-height:1px">{preheader}</div>'
        f'<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="background:{PAGE}">'
        '<tr><td align="center" style="padding:34px 16px">'
        '<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0"><tr><td><![endif]-->'
        f'<table role="presentation" class="tw-doc" width="600" border="0" cellpadding="0" cellspacing="0" '
        f'style="width:600px;max-width:600px;background:#ffffff;border:1px solid {RULE};border-radius:8px">'
        # letterhead: logo + wordmark, then a hairline rule
        '<tr><td class="tw-pad" style="padding:26px 40px 0">'
        '<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>'
        f'<td style="padding-right:11px"><img src="{LOGO_URL}" width="32" height="32" alt="" '
        'style="display:block;width:32px;height:32px;border-radius:7px"></td>'
        f'<td style="vertical-align:middle"><span style="font-family:{FONT};font-size:16px;font-weight:700;color:{INK};letter-spacing:-.2px">Time</span>'
        f'<span style="font-family:{FONT};font-size:16px;font-weight:700;color:{ACCENT};letter-spacing:-.2px">Watcher</span>'
        f'<span style="font-family:{FONT};font-size:12px;color:{MUTE}">&nbsp;&nbsp;{TAGLINE}</span></td>'
        '</tr></table></td></tr>'
        f'<tr><td style="padding:20px 40px 0"><div style="height:1px;background:{RULE};line-height:1px;font-size:0">&nbsp;</div></td></tr>'
        # body
        f'<tr><td class="tw-pad" style="padding:26px 40px 34px">'
        f'<div style="font-family:{FONT};font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:{FAINT};margin:0 0 12px">{eyebrow}</div>'
        f'<h1 style="margin:0 0 16px;font-family:{FONT};font-size:23px;line-height:1.25;font-weight:700;letter-spacing:-.4px;color:{INK}">{heading}</h1>'
        f'{body_html}{_meta_block(meta or [])}{button}{fallback}{note}'
        '</td></tr>'
        '</table>'
        # signature / footer, outside the document
        f'<table role="presentation" class="tw-doc" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px">'
        f'<tr><td style="padding:20px 40px 8px">'
        f'<div style="font-family:{FONT};font-size:13px;color:{BODY}">Equipe {BRAND}</div>'
        f'<div style="font-family:{FONT};font-size:12px;color:{MUTE};margin-top:2px">Monitoramento de produtividade &middot; {TAGLINE}{support_line}</div>'
        '</td></tr></table>'
        '<!--[if mso]></td></tr></table><![endif]-->'
        '</td></tr></table></body></html>'
    )


def send_invite(to: str, role: str, invite_url: str, workspace: str = "") -> dict:
    role_label = {"super_admin": "Super admin", "org_admin": "Administrador",
                  "manager": "Gestor", "member": "Colaborador"}.get(role, "Colaborador")
    subject = f"Convite de acesso — {BRAND}"
    body = (
        _p(f"Um administrador criou um acesso para voc&ecirc; no <b>{BRAND}</b>.")
        + _p("Para come&ccedil;ar, defina sua senha no bot&atilde;o abaixo. Os dados abaixo resumem seu acesso:")
    )
    meta = [("Workspace", workspace or "—"), ("Perfil", role_label), ("Validade do convite", "7 dias")]
    html = render_email(
        preheader=f"Defina sua senha e ative o acesso ao {BRAND}.",
        eyebrow="Convite de acesso",
        heading="Ative o seu acesso",
        body_html=body, meta=meta,
        button_label="Definir minha senha", button_url=invite_url,
        footnote="Se voc&ecirc; n&atilde;o esperava este convite, pode ignorar este e-mail.",
    )
    text = (f"Convite de acesso ao {BRAND} ({role_label}"
            + (f", workspace {workspace}" if workspace else "") + ").\n"
            f"Defina sua senha (expira em 7 dias):\n{invite_url}\n")
    return send(to, subject, html, text)


def send_password_reset(to: str, reset_url: str) -> dict:
    subject = f"Redefinição de senha — {BRAND}"
    body = (
        _p("Recebemos uma solicita&ccedil;&atilde;o para redefinir a senha da sua conta.")
        + _p("Escolha uma nova senha no bot&atilde;o abaixo. Por seguran&ccedil;a, o link expira em 1 hora.")
    )
    meta = [("Conta", to), ("Validade do link", "1 hora")]
    html = render_email(
        preheader=f"Redefina a senha da sua conta {BRAND}.",
        eyebrow="Segurança da conta",
        heading="Redefinição de senha",
        body_html=body, meta=meta,
        button_label="Criar nova senha", button_url=reset_url,
        footnote="Se voc&ecirc; n&atilde;o fez esta solicita&ccedil;&atilde;o, ignore este e-mail — sua senha atual continua v&aacute;lida.",
    )
    text = (f"Redefinicao de senha no {BRAND}.\n"
            f"Crie uma nova senha (expira em 1 hora):\n{reset_url}\n"
            f"Se nao foi voce, ignore este e-mail.\n")
    return send(to, subject, html, text)


def _severity_tag(severity: str) -> str:
    label = {"critical": "Crítico", "warning": "Atenção", "info": "Info"}.get(severity, "Info")
    color = {"critical": "#b42318", "warning": "#8a5a00", "info": ACCENT}.get(severity, MUTE)
    bg = {"critical": "#fdeceb", "warning": "#fbf3e3", "info": "#edeefb"}.get(severity, "#f1f2f5")
    return (f'<span style="display:inline-block;padding:2px 8px;border-radius:4px;background:{bg};color:{color};'
            f'font-family:{FONT};font-size:10px;font-weight:700;letter-spacing:.5px;text-transform:uppercase">{label}</span>')


def send_alerts(to: str, workspace: str, alerts: list, dashboard_url: str) -> dict:
    """alerts: list of {severity, title, detail}."""
    if not alerts:
        return {"ok": False, "skipped": True}
    rows = ""
    for i, a in enumerate(alerts[:20]):
        border = "" if i == 0 else f"border-top:1px solid {RULE}"
        rows += (
            f'<tr><td style="padding:14px 0;{border}">'
            f'<div style="margin-bottom:5px">{_severity_tag(a.get("severity",""))}'
            f'<span style="font-family:{FONT};font-size:14px;font-weight:600;color:{INK};margin-left:8px">{a.get("title","")}</span></div>'
            f'<div style="font-family:{FONT};font-size:13px;line-height:1.55;color:{BODY}">{a.get("detail","")}</div>'
            '</td></tr>'
        )
    extra = f'<p style="margin:8px 0 0;font-family:{FONT};font-size:12px;color:{MUTE}">+ {len(alerts)-20} outros alertas no painel.</p>' if len(alerts) > 20 else ""
    body = (
        _p("Os itens abaixo foram sinalizados pelo monitoramento e podem exigir a&ccedil;&atilde;o.")
        + f'<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:18px 0 2px;border-top:1px solid {RULE};border-bottom:1px solid {RULE}">{rows}</table>'
        + extra
    )
    subject = f"[{BRAND}] {len(alerts)} alerta(s) — {workspace}"
    html = render_email(
        preheader=f"{len(alerts)} alerta(s) no workspace {workspace}.",
        eyebrow="Alertas da operação",
        heading=f"{len(alerts)} alerta(s) exigem atenção",
        body_html=body,
        meta=[("Workspace", workspace)],
        button_label="Abrir o painel", button_url=dashboard_url,
        footnote=f"Voc&ecirc; recebe este resumo por administrar o workspace {workspace}.",
    )
    return send(to, subject, html)


def send_digest(to: str, workspace: str, title: str, summary_html: str, dashboard_url: str) -> dict:
    subject = f"[{BRAND}] {title} — {workspace}"
    html = render_email(
        preheader=f"{title} do workspace {workspace}.",
        eyebrow="Resumo automático",
        heading=title,
        body_html=summary_html,
        meta=[("Workspace", workspace)],
        button_label="Abrir o Intelligence", button_url=dashboard_url,
        footnote=f"Resumo gerado automaticamente pela intelig&ecirc;ncia do {BRAND} para {workspace}.",
    )
    return send(to, subject, html)
