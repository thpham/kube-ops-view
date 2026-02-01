# OpenShift Deployment

This fork uses the OAuth proxy deployment to protect kube-ops-view from unauthorized access.

## Directory [deploy](deploy)

Standard deployment with OpenShift OAuth proxy sidecar for authentication.

### Features

- Namespace: `ocp-ops-view`
- OpenShift OAuth proxy sidecar for authentication
- Users with permission to read the namespace are allowed access
- Reencrypt route using OpenShift service CA
- Infra node tolerations
- Restricted security context (non-root, read-only filesystem)

### Deployment

```bash
oc apply -k deploy/
```

### Configuration

- Image: `ghcr.io/thpham/kube-ops-view:24`
- Redis backend for state persistence
- TLS encryption between router and application
