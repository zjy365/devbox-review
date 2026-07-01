# Kubernetes Deployment

This directory deploys DevBox Review with the long-term production shape:

- one web image and one worker image
- one public `web` Deployment and Service
- one private `worker` Deployment
- one Redis queue

Only the web Service needs external ingress. The worker does not receive HTTP traffic; it consumes jobs from Redis.

## Build and push the image

```bash
docker buildx build --platform linux/amd64 \
  --target web \
  -t zhujingyang/devbox-review-web:latest \
  --push .

docker buildx build --platform linux/amd64 \
  --target worker \
  -t zhujingyang/devbox-review-worker:latest \
  --push .
```

For production, use an immutable tag instead of `latest`, then update `deployment.yaml`.

## Configure secrets

Edit `secret.example.yaml`, replace every placeholder, paste your Sealos
kubeconfig under `DEVBOX_KUBECONFIG`, and apply it as a Secret. The Deployment
mounts that kubeconfig key as `/var/run/secrets/devbox/kubeconfig` and injects
only the specific secret keys each container needs.

```bash
cp deploy/kubernetes/secret.example.yaml /tmp/devbox-review-secret.yaml
# edit /tmp/devbox-review-secret.yaml
kubectl apply -f /tmp/devbox-review-secret.yaml
```

Do not commit real secrets.

## Deploy

```bash
kubectl apply -f deploy/kubernetes/namespace.yaml
kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f /tmp/devbox-review-secret.yaml
kubectl apply -f deploy/kubernetes/redis.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/ingress.yaml
```

Point your Ingress or platform HTTP route to:

```text
Service: devbox-review-web
Port: 3000
Path: /api/webhooks
```

The GitHub App webhook URL should be:

```text
https://your-domain.example/api/webhooks
```

The included dev ingress uses:

```text
https://devbox-review.192.168.10.189.nip.io/api/webhooks
```

## Verify

```bash
kubectl -n devbox-review get pods
kubectl -n devbox-review get svc
kubectl -n devbox-review logs deploy/devbox-review-web
kubectl -n devbox-review logs deploy/devbox-review-worker
```

Scale workers independently:

```bash
kubectl -n devbox-review scale deployment/devbox-review-worker --replicas=2
```
