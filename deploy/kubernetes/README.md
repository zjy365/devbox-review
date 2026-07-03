# Kubernetes Deployment

This directory deploys RunReview with the production shape:

- one app image
- one public `app` Deployment and Service
- one Redis queue

Only the app Service receives external ingress. The same Next.js server process
also starts the BullMQ worker and consumes jobs from Redis.

## Build and push the image

```bash
docker buildx build --platform linux/amd64 \
  --target app \
  -t zhujingyang/run-review:latest \
  --push .
```

For production, use an immutable tag instead of `latest`, then update `deployment.yaml`.

## Configure environment

The Kubernetes manifests read runtime configuration from a Secret named
`run-review-secret`. Create it from your local `.env` and kubeconfig before
applying the Deployments.

Required keys:

```text
REDIS_PASSWORD
REDIS_URL
OPENAI_API_KEY
OPENAI_BASE_URL
OPENREVIEW_MODEL_PROVIDER
OPENREVIEW_MODEL
OPENREVIEW_WORKER_CONCURRENCY
OPENREVIEW_JOB_ATTEMPTS
OPENREVIEW_JOB_BACKOFF_MS
DEVBOX_JWT_SIGNING_KEY
DEVBOX_JWT_TTL_SECONDS
DEVBOX_ARCHIVE_AFTER_PAUSE_TIME
DEVBOX_PAUSE_AFTER_MINUTES
DEVBOX_COMMAND_TIMEOUT_SECONDS
DEVBOX_STORAGE_LIMIT
GITHUB_APP_ID
GITHUB_APP_PRIVATE_KEY
GITHUB_APP_WEBHOOK_SECRET
DEVBOX_KUBECONFIG
```

For local test deployments, render this Secret into a temporary manifest, apply
that generated file, and do not commit it.

## Deploy

```bash
kubectl apply -f deploy/kubernetes/namespace.yaml
kubectl apply -f /tmp/run-review-secret.yaml
kubectl apply -f deploy/kubernetes/redis.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/ingress.yaml
```

Point your Ingress or platform HTTP route to:

```text
Service: run-review
Port: 3000
Path: /api/webhooks
```

The GitHub App webhook URL should be:

```text
https://your-domain.example/api/webhooks
```

Recommended GitHub App settings:

- Leave Callback URL empty unless you implement GitHub OAuth login.
- Disable "Request user authorization during installation".
- Disable Device Flow.
- Leave Setup URL empty until you have an installation setup page. Do not trust the `installation_id` query parameter without verifying it through GitHub.
- Keep webhook SSL verification enabled.
- Subscribe to `issue_comment` and `pull_request_review_comment`.

The included dev ingress uses:

```text
https://run-review.192.168.10.189.nip.io/api/webhooks
```

## Verify

```bash
kubectl -n run-review get pods
kubectl -n run-review get svc
kubectl -n run-review logs deploy/run-review
```

Scale app pods carefully. Each pod starts one BullMQ worker, so effective
concurrency is `replicas * OPENREVIEW_WORKER_CONCURRENCY`.

```bash
kubectl -n run-review scale deployment/run-review --replicas=2
```
