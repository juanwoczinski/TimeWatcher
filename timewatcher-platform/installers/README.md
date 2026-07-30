# Installer pipeline

The production pipeline will build signed artifacts from the same agent core:

- macOS: notarized universal `.pkg`, installed by the user or MDM.
- Windows: signed x64 `.msi`, supporting Intune, GPO, RMM and silent install.

Provisioning properties:

```text
CONTROL_PLANE_URL=https://app.timewatcher.example
ENROLLMENT_TOKEN=<short-lived token>
```

Windows silent deployment:

```powershell
msiexec /i TimeWatcher-x64.msi /qn CONTROL_PLANE_URL="..." ENROLLMENT_TOKEN="..."
```

Tokens are never embedded in a reusable public binary. The dashboard generates
a tenant-specific deployment command or bootstrap package with an expiring token.
