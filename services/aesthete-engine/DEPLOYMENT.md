# Aesthete Engine Deployment Guide

**Production Deployment for Patina Design Platform**

---

## Prerequisites

### Infrastructure Requirements

**Compute:**
- Kubernetes cluster (OKE) with 3+ nodes
- Node specs: 4 vCPU, 16GB RAM minimum
- GPU nodes (optional) for batch embedding jobs

**Databases:**
- PostgreSQL 16 with pgvector extension
- Redis 7+ cluster (3+ nodes recommended)

**Storage:**
- OCI Object Storage for MLflow artifacts
- Persistent volumes for logs/cache

**Networking:**
- Load Balancer (OCI LB)
- WAF for DDoS protection
- Private subnets for services

### Required Services

1. **MLflow Tracking Server**
   - Deployed on OKE
   - PostgreSQL backend for metadata
   - Object Storage for artifacts

2. **OpenSearch** (optional)
   - For lexical search fallback
   - 3+ node cluster

3. **Observability Stack**
   - OpenTelemetry Collector
   - Prometheus
   - Grafana
   - OCI Logging/APM

---

## Quick Start

### 1. Database Setup

**PostgreSQL with pgvector:**

```sql
-- Create database
CREATE DATABASE patina;

-- Connect to database
\c patina;

-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table
CREATE TABLE embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id VARCHAR(255) NOT NULL,
    variant_id VARCHAR(255),
    model_name VARCHAR(255) NOT NULL,
    vector vector(768),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(product_id, model_name)
);

-- Create HNSW index
CREATE INDEX embeddings_hnsw_idx ON embeddings
USING hnsw (vector vector_cosine_ops)
WITH (m = 16, ef_construction = 200);

-- Create other tables from schema
-- (See prisma/schema.prisma for complete schema)
```

**Redis Setup:**
```bash
# Using Redis cluster
redis-cli --cluster create \
  redis-1:6379 redis-2:6379 redis-3:6379 \
  --cluster-replicas 1
```

### 2. Configuration

**Create Kubernetes secrets:**

```bash
# Create namespace
kubectl create namespace patina

# Database secret
kubectl create secret generic aesthete-engine-secrets \
  -n patina \
  --from-literal=database-url='postgresql+asyncpg://user:pass@postgres:5432/patina'

# MLflow credentials (if using S3-compatible storage)
kubectl create secret generic mlflow-credentials \
  -n patina \
  --from-literal=aws-access-key-id='YOUR_ACCESS_KEY' \
  --from-literal=aws-secret-access-key='YOUR_SECRET_KEY'
```

**Update ConfigMap:**

```bash
# Edit k8s/configmap.yaml with your values
kubectl apply -f k8s/configmap.yaml
```

### 3. Build & Push Docker Image

```bash
# Build image
docker build -t aesthete-engine:1.0.0 \
  --target production \
  .

# Tag for registry
docker tag aesthete-engine:1.0.0 \
  your-registry.oci.oraclecloud.com/patina/aesthete-engine:1.0.0

# Push to registry
docker push your-registry.oci.oraclecloud.com/patina/aesthete-engine:1.0.0
```

### 4. Deploy to Kubernetes

```bash
# Apply all manifests
kubectl apply -f k8s/configmap.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/hpa.yaml
kubectl apply -f k8s/ingress.yaml
kubectl apply -f k8s/servicemonitor.yaml

# Verify deployment
kubectl get pods -n patina -l app=aesthete-engine
kubectl logs -n patina -l app=aesthete-engine --tail=100 -f

# Check service
kubectl get svc -n patina aesthete-engine

# Check ingress
kubectl get ingress -n patina aesthete-engine
```

### 5. Verify Health

```bash
# Port-forward for testing
kubectl port-forward -n patina svc/aesthete-engine 8000:8000

# Health check
curl http://localhost:8000/healthz
curl http://localhost:8000/readyz

# API docs
open http://localhost:8000/docs

# Metrics
curl http://localhost:8000/metrics
```

---

## Production Deployment Steps

### Phase 1: Infrastructure

1. **Provision Resources:**
   ```bash
   # Using Terraform or OCI CLI
   terraform init
   terraform plan -out=plan.tfplan
   terraform apply plan.tfplan
   ```

2. **Setup Databases:**
   - Deploy PostgreSQL with pgvector
   - Configure replication (read replicas)
   - Setup automated backups
   - Deploy Redis cluster

3. **Deploy MLflow:**
   ```bash
   helm install mlflow mlflow/mlflow \
     -n patina \
     --set backend-store-uri=postgresql://... \
     --set default-artifact-root=s3://...
   ```

### Phase 2: Application Deployment

1. **Create Namespace & RBAC:**
   ```bash
   kubectl apply -f k8s/namespace.yaml
   kubectl apply -f k8s/serviceaccount.yaml
   kubectl apply -f k8s/rbac.yaml
   ```

2. **Deploy Secrets:**
   ```bash
   # Use sealed-secrets or external-secrets operator
   kubectl apply -f k8s/sealed-secrets.yaml
   ```

3. **Deploy Application:**
   ```bash
   # Apply in order
   kubectl apply -f k8s/configmap.yaml
   kubectl apply -f k8s/deployment.yaml
   kubectl apply -f k8s/service.yaml
   ```

4. **Setup Auto-scaling:**
   ```bash
   kubectl apply -f k8s/hpa.yaml

   # Verify HPA
   kubectl get hpa -n patina
   ```

5. **Configure Ingress:**
   ```bash
   # Install cert-manager first
   kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

   # Apply ingress
   kubectl apply -f k8s/ingress.yaml
   ```

### Phase 3: Observability

1. **Setup Prometheus:**
   ```bash
   # Install Prometheus Operator
   helm install prometheus prometheus-community/kube-prometheus-stack \
     -n monitoring \
     --create-namespace

   # Apply ServiceMonitor
   kubectl apply -f k8s/servicemonitor.yaml
   ```

2. **Configure Grafana Dashboards:**
   ```bash
   # Import dashboards
   kubectl apply -f k8s/grafana-dashboards.yaml
   ```

3. **Setup Alerting:**
   ```bash
   kubectl apply -f k8s/prometheus-rules.yaml
   ```

4. **OpenTelemetry Collector:**
   ```bash
   helm install opentelemetry-collector open-telemetry/opentelemetry-collector \
     -n patina \
     --set config.exporters.otlp.endpoint=oci-apm:4318
   ```

### Phase 4: Initial Data Load

1. **Precompute Embeddings:**
   ```bash
   # Trigger batch embedding job
   curl -X POST https://api.patina.com/aesthete/v1/embeddings/batch \
     -H "Content-Type: application/json" \
     -d '{
       "products": [...],
       "batch_size": 100
     }'
   ```

2. **Build Vector Index:**
   ```bash
   # Connect to PostgreSQL
   psql $DATABASE_URL

   # Create index (if not exists)
   CREATE INDEX CONCURRENTLY embeddings_hnsw_idx ON embeddings
   USING hnsw (vector vector_cosine_ops)
   WITH (m = 16, ef_construction = 200);
   ```

3. **Warm Cache:**
   ```bash
   # Trigger precompute for active profiles
   curl -X POST https://api.patina.com/aesthete/v1/batch/precompute \
     -H "Content-Type: application/json" \
     -d '{
       "limit": 100,
       "priority": "high"
     }'
   ```

---

## Configuration Management

### Environment-Specific Configs

**Development:**
```yaml
# k8s/overlays/dev/kustomization.yaml
resources:
  - ../../base
configMapGenerator:
  - name: aesthete-engine-config
    literals:
      - ENV=development
      - LOG_LEVEL=DEBUG
      - ENABLE_TRACING=true
replicas:
  - name: aesthete-engine
    count: 1
```

**Staging:**
```yaml
# k8s/overlays/staging/kustomization.yaml
resources:
  - ../../base
configMapGenerator:
  - name: aesthete-engine-config
    literals:
      - ENV=staging
      - LOG_LEVEL=INFO
replicas:
  - name: aesthete-engine
    count: 2
```

**Production:**
```yaml
# k8s/overlays/production/kustomization.yaml
resources:
  - ../../base
configMapGenerator:
  - name: aesthete-engine-config
    literals:
      - ENV=production
      - LOG_LEVEL=WARNING
      - ENABLE_METRICS=true
replicas:
  - name: aesthete-engine
    count: 3
```

### Apply with Kustomize

```bash
# Development
kubectl apply -k k8s/overlays/dev

# Staging
kubectl apply -k k8s/overlays/staging

# Production
kubectl apply -k k8s/overlays/production
```

---

## Monitoring & Alerting

### Key Metrics to Monitor

**Application Metrics:**
- Request rate (QPS)
- Latency (p50, p95, p99)
- Error rate
- Cache hit/miss ratio

**ML Metrics:**
- Embedding computation rate
- Model inference latency
- Candidate generation time
- Diversity score

**Infrastructure Metrics:**
- CPU/Memory utilization
- Pod restart count
- Network I/O
- Disk usage

### Alert Rules

**Critical Alerts:**
```yaml
# prometheus-rules.yaml
groups:
  - name: aesthete-engine
    interval: 30s
    rules:
      - alert: HighLatency
        expr: histogram_quantile(0.95, rate(aesthete_recommendation_latency_seconds_bucket[5m])) > 0.3
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "High latency detected"
          description: "p95 latency is {{ $value }}s"

      - alert: HighErrorRate
        expr: rate(aesthete_recommendation_requests_total{status="error"}[5m]) > 0.01
        for: 2m
        labels:
          severity: critical
        annotations:
          summary: "High error rate"

      - alert: LowCacheHitRate
        expr: rate(aesthete_cache_hits_total[5m]) / (rate(aesthete_cache_hits_total[5m]) + rate(aesthete_cache_misses_total[5m])) < 0.4
        for: 10m
        labels:
          severity: warning
```

---

## Scaling Strategies

### Horizontal Scaling

**Auto-scaling based on metrics:**
```yaml
# HPA with custom metrics
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: aesthete-engine-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: aesthete-engine
  minReplicas: 3
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Pods
      pods:
        metric:
          name: aesthete_recommendation_requests_per_second
        target:
          type: AverageValue
          averageValue: "100"
```

### Vertical Scaling

**Resource adjustments:**
```yaml
resources:
  requests:
    memory: "2Gi"
    cpu: "1000m"
  limits:
    memory: "4Gi"
    cpu: "2000m"
```

### Database Scaling

**Read Replicas:**
```yaml
# Deploy read replica
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata:
  name: patina-postgres
spec:
  instances: 3
  primaryUpdateStrategy: unsupervised
  postgresql:
    parameters:
      max_connections: "200"
      shared_buffers: "2GB"
```

---

## Backup & Disaster Recovery

### Database Backup

**Automated Backups:**
```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
pg_dump $DATABASE_URL | gzip > /backups/patina-$DATE.sql.gz

# Upload to Object Storage
oci os object put -bn patina-backups -f /backups/patina-$DATE.sql.gz

# Retention: 30 days
find /backups -mtime +30 -delete
```

**Point-in-Time Recovery:**
```sql
-- Restore to specific timestamp
pg_restore -d patina -t "2025-10-03 12:00:00" backup.sql
```

### Redis Backup

**RDB Snapshots:**
```bash
# Configure Redis persistence
redis-cli CONFIG SET save "900 1 300 10 60 10000"

# Manual backup
redis-cli BGSAVE
```

### Application State

**MLflow Artifacts:**
- Stored in Object Storage (auto-replicated)
- Versioned models with metadata
- Export/import scripts for migration

---

## Troubleshooting

### Common Issues

**1. High Latency**

**Diagnosis:**
```bash
# Check database query performance
kubectl exec -it postgres-0 -- psql -U patina -c "
  SELECT query, mean_exec_time
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 10;
"

# Check Redis latency
kubectl exec -it redis-0 -- redis-cli --latency-history
```

**Solutions:**
- Increase `ef_search` for HNSW index
- Add database connection pool
- Enable query result caching
- Scale horizontally (add replicas)

**2. Out of Memory**

**Diagnosis:**
```bash
# Check memory usage
kubectl top pods -n patina -l app=aesthete-engine

# Check for memory leaks
kubectl exec -it aesthete-engine-xxx -- python -c "
import tracemalloc
tracemalloc.start()
# ... run application logic
print(tracemalloc.get_traced_memory())
"
```

**Solutions:**
- Increase memory limits
- Implement batch size limits
- Clear embedding model cache
- Enable garbage collection

**3. Database Connection Exhausted**

**Diagnosis:**
```bash
# Check active connections
kubectl exec -it postgres-0 -- psql -U patina -c "
  SELECT count(*) FROM pg_stat_activity;
"
```

**Solutions:**
- Increase `max_connections` in PostgreSQL
- Reduce connection pool size per pod
- Implement connection pooler (PgBouncer)

---

## Security Hardening

### Network Policies

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: aesthete-engine-netpol
  namespace: patina
spec:
  podSelector:
    matchLabels:
      app: aesthete-engine
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - podSelector:
            matchLabels:
              app: ingress-nginx
      ports:
        - protocol: TCP
          port: 8000
  egress:
    - to:
        - podSelector:
            matchLabels:
              app: postgres
      ports:
        - protocol: TCP
          port: 5432
    - to:
        - podSelector:
            matchLabels:
              app: redis
      ports:
        - protocol: TCP
          port: 6379
```

### Pod Security

```yaml
apiVersion: policy/v1beta1
kind: PodSecurityPolicy
metadata:
  name: aesthete-engine-psp
spec:
  privileged: false
  allowPrivilegeEscalation: false
  runAsUser:
    rule: MustRunAsNonRoot
  seLinux:
    rule: RunAsAny
  fsGroup:
    rule: RunAsAny
  volumes:
    - configMap
    - secret
    - emptyDir
```

### Secrets Management

**Using External Secrets Operator:**
```yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: vault-backend
  namespace: patina
spec:
  provider:
    vault:
      server: "https://vault.patina.com"
      path: "secret"
      version: "v2"
      auth:
        kubernetes:
          mountPath: "kubernetes"
          role: "aesthete-engine"
```

---

## Performance Tuning

### Database Optimization

**PostgreSQL Configuration:**
```sql
-- Increase shared buffers
ALTER SYSTEM SET shared_buffers = '4GB';

-- Optimize work_mem for sorting
ALTER SYSTEM SET work_mem = '256MB';

-- Increase effective_cache_size
ALTER SYSTEM SET effective_cache_size = '12GB';

-- Optimize random page cost for SSD
ALTER SYSTEM SET random_page_cost = 1.1;

-- Reload configuration
SELECT pg_reload_conf();
```

**Index Tuning:**
```sql
-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM embeddings
ORDER BY vector <=> '[...]'::vector
LIMIT 20;

-- Adjust HNSW parameters
DROP INDEX embeddings_hnsw_idx;
CREATE INDEX embeddings_hnsw_idx ON embeddings
USING hnsw (vector vector_cosine_ops)
WITH (m = 32, ef_construction = 400);  -- Higher recall, slower build
```

### Application Optimization

**Connection Pooling:**
```python
# app/db/database.py
from sqlalchemy.ext.asyncio import create_async_engine

engine = create_async_engine(
    DATABASE_URL,
    pool_size=30,           # Increase pool size
    max_overflow=20,        # Allow overflow
    pool_pre_ping=True,     # Verify connections
    pool_recycle=3600,      # Recycle after 1 hour
    echo_pool=True,         # Debug pool
)
```

**Caching Strategy:**
```python
# Implement multi-level cache
L1_CACHE_TTL = 60        # In-memory, 1 min
L2_CACHE_TTL = 600       # Redis, 10 min
L3_CACHE_TTL = 3600      # Precompute, 1 hour
```

---

## CI/CD Pipeline

### GitLab CI Example

```yaml
# .gitlab-ci.yml
stages:
  - test
  - build
  - deploy

test:
  stage: test
  image: python:3.11
  script:
    - pip install -r requirements-dev.txt
    - pytest --cov=app --cov-report=xml
    - coverage report --fail-under=70
  coverage: '/TOTAL.*\s+(\d+%)$/'

build:
  stage: build
  image: docker:latest
  services:
    - docker:dind
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only:
    - main
    - staging

deploy-staging:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/aesthete-engine
        aesthete-engine=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
        -n patina-staging
    - kubectl rollout status deployment/aesthete-engine -n patina-staging
  only:
    - staging

deploy-production:
  stage: deploy
  image: bitnami/kubectl:latest
  script:
    - kubectl set image deployment/aesthete-engine
        aesthete-engine=$CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
        -n patina
    - kubectl rollout status deployment/aesthete-engine -n patina
  when: manual
  only:
    - main
```

---

## Maintenance

### Rolling Updates

```bash
# Update image
kubectl set image deployment/aesthete-engine \
  aesthete-engine=new-image:tag \
  -n patina

# Monitor rollout
kubectl rollout status deployment/aesthete-engine -n patina

# Rollback if needed
kubectl rollout undo deployment/aesthete-engine -n patina
```

### Database Migrations

```bash
# Run migrations
kubectl exec -it aesthete-engine-xxx -- alembic upgrade head

# Rollback migration
kubectl exec -it aesthete-engine-xxx -- alembic downgrade -1
```

### Cache Invalidation

```bash
# Clear all caches
kubectl exec -it redis-0 -- redis-cli FLUSHDB

# Clear specific pattern
kubectl exec -it redis-0 -- redis-cli --scan --pattern "rec:*" | xargs redis-cli DEL
```

---

## Support & Runbook

### On-Call Procedures

**1. Service Degradation:**
- Check Grafana dashboards
- Review recent deployments
- Check error logs: `kubectl logs -n patina -l app=aesthete-engine --tail=1000 | grep ERROR`
- Escalate to engineering if needed

**2. Database Issues:**
- Check connection pool: `SELECT count(*) FROM pg_stat_activity`
- Check slow queries: `SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC`
- Restart connections: `kubectl rollout restart deployment/aesthete-engine -n patina`

**3. Cache Issues:**
- Check Redis health: `kubectl exec -it redis-0 -- redis-cli PING`
- Check memory: `kubectl exec -it redis-0 -- redis-cli INFO memory`
- Restart Redis if needed (careful with data loss)

### Contacts

- **Engineering Team:** team-echo@patina.com
- **On-Call:** +1-555-PATINA-1
- **Slack:** #team-echo-alerts

---

## Changelog

**v1.0.0** (2025-10-03)
- Initial production release
- All core features implemented
- 70%+ test coverage
- Full observability stack

---

**Generated with Claude Code**
_Patina Design Platform - Aesthete Engine Deployment Guide_
