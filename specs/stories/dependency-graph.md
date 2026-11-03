# Dependency Graph

## Group A

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E1-S1 | Authentication and role guard | API | 5 | — |
| E1-S3 | JSON logs, correlation IDs, and redaction | Config | 5 | — |
| E1-S4 | Health, migrations, and architecture guards | Config | 8 | — |
| E3-S2 | Credit-scoring stub | Service | 3 | — |

## Group B

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E1-S2 | Audit trail | Repository | 3 | E1-S1 (contract) |
| E2-S1 | Product catalog from the active policy | API | 3 | E1-S1 (contract), E1-S4 (data) |

## Group C

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E2-S2 | Apply for a loan | API | 5 | E2-S1 (data), E1-S1 (contract) |
| E4-S1 | Create and approve policy versions | Service | 5 | E1-S4 (data), E1-S2 (contract), E1-S1 (contract) |

## Group D

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E2-S3 | Upload documents and submit | Service | 5 | E2-S2 (data) |
| E4-S2 | Policy editor UI | UI | 5 | E4-S1 (contract) |

## Group E

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E3-S1 | Verification queue | Service | 3 | E2-S3 (data), E1-S2 (contract) |
| E3-S3 | Underwriting decision with reason codes | Service | 5 | E3-S2 (contract), E2-S3 (data) |

## Group F

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E2-S4 | Apply wizard and verification queue UI | UI | 5 | E2-S3 (contract), E3-S1 (contract) |
| E3-S4 | Minimum-income violation | Service | 2 | E3-S3 (behavior) |
| E3-S5 | Manual review and override | Service | 5 | E3-S3 (data), E1-S2 (contract) |

## Group G

| Story | Title | Layer | Points | Dependencies |
|---|---|---|---|---|
| E3-S6 | Decision review and override UI | UI | 5 | E3-S5 (contract) |

## Ownership Clusters

- C1: E1-S1, E1-S2 (8 pts)
- C2: E1-S3 (5 pts)
- C3: E1-S4, E2-S1, E2-S2, E4-S1 (21 pts)
- C4: E2-S3, E3-S1, E3-S3, E3-S4, E3-S5 (20 pts)
- C5: E2-S4 (5 pts)
- C6: E3-S2 (3 pts)
- C7: E3-S6 (5 pts)
- C8: E4-S2 (5 pts)
