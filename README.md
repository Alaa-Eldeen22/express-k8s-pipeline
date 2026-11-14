# Express K8s Pipeline

An Express.js service shipped to Kubernetes through a fully automated GitHub Actions pipeline: tested, containerised, pushed to a private registry, rolled out with zero downtime, autoscaled on CPU, and rolled back automatically if a deploy fails.

## Architecture

```
 git push (main)
      │
      ▼
┌──────────────────────────── GitHub Actions ────────────────────────────┐
│                                                                        │
│  Job 1: test-build-push (GitHub-hosted runner)                         │
│    npm ci ─► jest tests ─► docker buildx (GHA layer cache)             │
│                              │                                         │
│                              └─► push  user/express-k8s-pipeline:<sha> │
│                                        user/express-k8s-pipeline:latest│
│                                                                        │
│  Job 2: deploy (self-hosted runner, next to the cluster)               │
│    create/update regcred secret                                        │
│    inject <sha> image tag into manifest ─► kubectl apply -f k8s/       │
│    kubectl rollout status --timeout=120s                               │
│         ├─ success ─► done                                             │
│         └─ failure ─► kubectl rollout undo  (pipeline fails)           │
└────────────────────────────────────────────────────────────────────────┘
                               │
                               ▼
              ┌──────────── Minikube ─────────────┐
              │  Service (NodePort :80 → :3000)   │
              │        │                          │
              │  Deployment  ◄── HPA (2–5 pods,   │
              │   pods ×N        60% CPU target)  │
              │        ▲                          │
              │  ConfigMap (NODE_ENV, PORT)       │
              └───────────────────────────────────┘
```

## Features

| Area | What it does |
|---|---|
| **CI** | Unit and HTTP tests (Jest + Supertest) must pass before an image is built |
| **Immutable images** | Every build is tagged with the commit SHA, and deployments always reference the SHA tag, never `latest` |
| **Fast builds** | Docker Buildx with GitHub Actions layer cache, plus `npm` dependency cache |
| **Zero-downtime deploys** | `RollingUpdate` with `maxUnavailable: 0`, readiness probe gating traffic, and graceful `SIGTERM` shutdown |
| **Automatic rollback** | If the rollout doesn't become healthy within 120s, the pipeline runs `kubectl rollout undo` and fails |
| **Autoscaling** | HPA scales 2 → 5 replicas at 60% CPU, with instant scale-up and a 120s scale-down stabilisation window |
| **Security** | Non-root container (UID 1000), read-only root filesystem, all Linux capabilities dropped, seccomp `RuntimeDefault`, private registry with pull secret, least-privilege workflow permissions, secrets kept in GitHub Secrets |
| **Self-healing** | Liveness probe restarts unhealthy containers |

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Health check used by liveness and readiness probes, returns `{"status":"pass"}` |
| GET | `/hello?name=X` | Returns `Hello, X!` |
| GET | `/stress?ms=N` | Busy-loops the CPU for `N` ms (default 200, max 5000), used to trigger the HPA |

## Project structure

```
.
├── index.js                    # Express app + graceful shutdown
├── index.test.js               # Jest/Supertest tests
├── Dockerfile                  # Production image (node:20-alpine, non-root)
├── k8s/
│   ├── configmap.yaml          # App configuration
│   ├── deployment.yaml         # Rolling update, probes, resources, securityContext
│   ├── service.yaml            # NodePort service
│   └── hpa.yaml                # CPU-based autoscaling
└── .github/workflows/ci-cd.yaml
```

## Running it yourself

### Prerequisites

- [Minikube](https://minikube.sigs.k8s.io/) and `kubectl`
- metrics-server (required for the HPA): `minikube addons enable metrics-server`
- A private Docker Hub repository named `express-k8s-pipeline`
- A [GitHub self-hosted runner](https://docs.github.com/en/actions/hosting-your-own-runners) installed on the machine running Minikube, with `kubectl` access to the cluster

### GitHub Secrets

| Secret | Value |
|---|---|
| `DOCKERHUB_USERNAME` | Your Docker Hub username |
| `DOCKERHUB_TOKEN` | A Docker Hub access token (Read & Write) |

### Deploy

Push to `main`. The pipeline handles the rest. Then:

```bash
minikube service myapp --url        # get the service URL
curl "$(minikube service myapp --url)/health"
```

### Run locally

```bash
npm ci
npm test
npm start                           # http://localhost:3000
```

## Demo: watching the HPA scale

```bash
URL=$(minikube service myapp --url)

# Terminal 1 — watch the autoscaler
kubectl get hpa myapp -w

# Terminal 2 — generate CPU load
for i in $(seq 1 4); do
  (while true; do curl -s "$URL/stress?ms=500" > /dev/null; done) &
done

# Stop the load when done
kill $(jobs -p)
```

CPU climbs past the 60% target, replicas scale up toward 5, and they scale back down to 2 about 2 minutes after the load stops.

## Demo: automatic rollback

Push a commit that breaks the health check (for example, make `/health` return 500). The new pods never become ready, `rollout status` times out, and the pipeline rolls the Deployment back to the previous healthy revision. Because `maxUnavailable: 0`, the old pods keep serving traffic the whole time.

## What I'd change for production

- Use a managed cluster (EKS/GKE/AKS) and deploy via GitOps (Argo CD / Flux) instead of a self-hosted runner with cluster credentials
- Put an Ingress with TLS in front of the Service instead of a NodePort
- Scan images (Trivy) and validate manifests (kubeconform) in CI
- Package manifests with Kustomize or Helm, with per-environment overlays and a dedicated namespace
- Add a PodDisruptionBudget, and observability with Prometheus metrics and structured logs
