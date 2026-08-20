# Evidence-led bullet framework

Use the strongest supported subset of:

1. **Action**: what the candidate actually did.
2. **Technical mechanism**: how it was done.
3. **Scope**: the supported system, organizational, data, traffic, or customer boundary.
4. **Outcome**: the supported engineering or business result.

Not every bullet needs all four parts. Never manufacture a missing part.

## Useful metric families

- Scale: requests, events, users, tenants, services, repositories, regions, or data volume.
- Performance: p50/p95/p99 latency, throughput, CPU, memory, build time, or query time.
- Reliability: availability, SLO, error rate, incidents, MTTR, or recovery time.
- Efficiency: cloud spend, utilization, engineering hours, or toil.
- Delivery: lead time, migration duration, deploy frequency, or release cadence.
- Product: adoption, conversion, retention, customers, or revenue influenced.
- Developer productivity, quality, security, organizational scope, and ML/data quality.

Use a metric only when it already appears in candidate evidence or the user supplies it. Preserve forms such as `~2M` and `about 30 engineers`.

## Examples

Supported metrics: `Built Prometheus/Grafana observability across 12 production services, reducing median incident recovery time from 55 to 31 minutes.`

No supported metrics: `Built Prometheus/Grafana observability for production services, improving incident diagnosis and on-call visibility.`

Prohibited escalation:

- `helped with migration` to `led the migration`
- `worked on APIs` to `architected a platform`
- `used Kafka` to `designed a billion-event distributed system`
- adding a plausible percentage, team size, customer count, or reliability target
