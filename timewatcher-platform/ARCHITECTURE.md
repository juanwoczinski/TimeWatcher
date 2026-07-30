# TeamWatcher multi-tenant architecture

Every request and record is scoped by `tenant_id`. Browser authorization derives
the active tenant from a server-side membership; device ingestion derives it
from a hashed enrollment/device token. Neither API accepts a client-supplied
tenant as authorization.

## Roles

- `platform_admin`: operates tenants, billing, global security and support.
- `tenant_admin`: manages one company, policies, people, devices and installers.
- `manager`: sees explicitly assigned teams and assets.
- `collaborator`: sees their own activity and capture policy.
- `auditor`: read-only access to audit and compliance data.

## Storage

- D1: tenants, identities, memberships, devices, policies, time-series metadata,
  screenshot metadata, enrollment tokens and audit records.
- R2: original screenshots, thumbnails and signed exports. Object keys begin with
  the tenant and device ids; reads require a server-side membership check.

## Agent enrollment

1. A tenant admin creates a short-lived, limited-use enrollment token.
2. The installer receives the control-plane URL and token as MSI/PKG properties.
3. The agent exchanges the token plus its device public key for a device id and
   revocable device credential.
4. All ingest requests are signed and mapped to the stored tenant/device.
5. Policies are returned to the visible agent and cached with an expiry.

Screenshot capture is disclosed to collaborators, constrained by policy and
working schedule, and can be paused when the tenant policy allows it.
