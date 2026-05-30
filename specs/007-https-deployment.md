# Specification: HTTPS Deployment

Status: COMPLETE

## Feature: HTTPS-ready single-host deployment for external users

### Overview
Add a production-ready HTTPS deployment path for the current Docker Compose and Nginx setup so external users can access the site over TLS, login cookies work reliably, and callback-facing URLs can use the public domain safely.

### User Stories
- As an external user, I want to open the site over HTTPS so that login and usage work in a normal browser without mixed-security issues.
- As an operator, I want the provided deployment files to support 80/443 traffic and certificate mounting so that I can bring the service online on a single server quickly.

---

## Functional Requirements

### FR-1: Compose deployment supports 443
Extend the deployment sample so Nginx can serve both HTTP and HTTPS and receive certificate files from mounted paths.

**Acceptance Criteria:**
- [x] `deploy/docker-compose.yml` exposes both `80:80` and `443:443`.
- [x] The Nginx service mounts a certificate directory and any required ACME/webroot path used by the deployment guide.
- [x] The compose sample does not require application code changes to enable HTTPS.

### FR-2: Nginx supports redirect + TLS termination
Update the Nginx sample to terminate TLS and redirect HTTP traffic to HTTPS while preserving reverse proxy behavior.

**Acceptance Criteria:**
- [x] `deploy/nginx.conf` contains an HTTP server block that redirects normal traffic to HTTPS.
- [x] `deploy/nginx.conf` contains an HTTPS server block with certificate directives, reverse proxy headers, and health endpoint support.
- [x] Proxy headers preserve `Host`, `X-Forwarded-Proto`, and client IP behavior required by the app.

### FR-3: Operator documentation covers certificate setup
Document how to issue and renew certificates and how to point the app at the public domain.

**Acceptance Criteria:**
- [x] `README.md` explains the required `PUBLIC_BASE_URL=https://...` setting for HTTPS deployments.
- [x] `README.md` includes a concrete single-host certificate flow, such as Certbot webroot or equivalent, for the provided Nginx setup.
- [x] `README.md` includes the basic restart/reload commands needed after certificate issuance and renewal.

---

## Success Criteria

- An operator can follow the repo docs and bring the site up on a single host with HTTP redirecting to HTTPS.
- Browser login can rely on secure cookies in production mode after TLS is enabled.
- The deployment sample remains compatible with the existing Docker Compose layout.

---

## Dependencies
- Existing `deploy/docker-compose.yml`
- Existing `deploy/nginx.conf`
- Existing runtime use of `PUBLIC_BASE_URL`

## Assumptions
- Certificate issuance is handled on the same host as Nginx.
- The user has a real domain already pointed at the server.
- This spec will provide deployment files and docs, not execute external CA issuance from the repo itself.

---

## Completion Signal

### Implementation Checklist
- [x] Update compose sample for 443 and certificate mounts
- [x] Update Nginx sample for HTTP redirect and HTTPS reverse proxy
- [x] Update README deployment docs for HTTPS issuance and renewal
- [x] Mark this spec `Status: COMPLETE` when checks pass

### Validation Commands

```bash
npm run check
npm run smoke
```

**Only when ALL checks pass, output:** `<promise>DONE</promise>`
