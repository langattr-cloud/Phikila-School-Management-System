# CBC / KPSEA / KJSEA Grading Amendment

This amendment adds Kenya CBC education-level separation to the existing
Examinations module. It amends — it does **not** rebuild — the existing
implementation: all current functionality, database structures, workflows,
reports, permissions, timelines and audit mechanisms are preserved unless a
change below specifically requires modification.

## 1. Education-level separation

| Structure | Levels | Assessment | National exam |
|---|---|---|---|
| **Primary School** | Grade 4, 5, 6 | CBC/CBA, SBA | KPSEA |
| **Junior School**  | Grade 7, 8, 9 | CBC/CBE, SBA | KJSEA |
| **Senior School**  | everything else | existing structure | — |

The level is resolved from the student's `Level` record (its code/name, e.g.
`G5`, `Grade 8`), falling back to the current class and its grade. Grade
numbers 4–6 map to primary, 7–9 to junior; everything else (Form 1–4, Grade
10+, pre-primary, unclassified) keeps the existing configurable `GradeScale`
behaviour — CBC/KPSEA/KJSEA bands are **never** applied there, and the legacy
raw-score scale is **never** applied to primary/junior.

## 2. Primary School — CBC / KPSEA grading

Four performance bands, percentage based:

| Code | Performance level        | Percentage |
|------|--------------------------|-----------:|
| EE   | Exceeding Expectations   | 80–100%    |
| ME   | Meeting Expectations     | 50–79%     |
| AE   | Approaching Expectations | 40–49%     |
| BE   | Below Expectations       | 0–39%      |

The underlying numerical score and percentage are always retained alongside
the band (the band never replaces the score).

### Calculation flow

```
Raw Score → Percentage → EE/ME/AE/BE → Mean/Average → Deviation → Progress → Analysis
```

* **Percentage** — `score ÷ subject total × 100` (subject total from the
  exam's subject assignment, falling back to the exam's `total_marks`).
* **Band** — built-in KNEC bands above, or school-specific `grade_scales`
  rows scoped with `education_level = 'primary'` / `'junior'` (percentage
  boundaries) when configured.
* **Mean** — student's mean percentage across subjects (the existing raw
  `average` is also kept).
* **Deviation** — student mean − cohort mean (percentage points).
* **Progress** — student mean vs their previous exam in the same series
  (percentage points).
* **Analysis** — `GET /api/v1/examinations/{exam_id}/results/analysis`:
  cohort mean, band distribution, per-subject means and band distributions,
  education-level counts, and progress summary (improved/declined/unchanged).

## Junior School — KJSEA

Junior school uses the same four performance levels and percentage ranges as
primary (EE 80–100, ME 50–79, AE 40–49, BE 0–39). The bands are defined
per-level in `app/modules/examinations/grading.py` (`CBC_BANDS`) so each
level's scale can be amended independently if a school's policy requires it.

## Schema changes (additive, non-destructive)

* `grade_scales.education_level` — optional `primary | junior | senior`
  (NULL = legacy rows, behaviour unchanged). Migration:
  `alembic/versions/5f8c9d2e7b1a_add_cbc_grading_education_level_scope.py`.
* API additions (all optional fields; existing fields and endpoints unchanged):
  * `ExamEntryResponse.percentage`
  * `StudentResult.education_level`, `.percentage`, `.band`, `.band_label`,
    `.deviation`, `.progress`; subject score dicts gain `percentage`,
    `band`, `band_label`
  * New endpoint `GET /examinations/{exam_id}/results/analysis`
  * `GradeScaleCreate/Response.education_level`

## Files

* `app/modules/examinations/grading.py` — band definitions, level
  classification, grade resolution (new)
* `app/modules/examinations/results.py` — results/analysis computation (new)
* `app/modules/examinations/models_v2.py` — `GradeScale.education_level`
* `app/modules/examinations/schemas_v2.py` — amended schemas
* `app/modules/examinations/router_v2.py` — amended score entry, entries,
  results, analysis, grade-scale endpoints
* `frontend/src/lib/examinations.ts`, `frontend/src/pages/Examinations.tsx` —
  band/mean/deviation/progress columns, band legend, analysis summary
* `app/modules/examinations/tests/`, `conftest.py` — verification suite
