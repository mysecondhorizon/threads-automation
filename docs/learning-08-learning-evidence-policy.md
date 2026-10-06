# LEARNING-08 — Learning Evidence Policy V1

## Purpose

LEARNING-07 describes repeated performance patterns. LEARNING-08 decides when a
pattern is safe to expose as a learning signal for future content generation.
The policy must prevent a positive aggregate from becoming an instruction such
as “use this style more” without enough, consistent, and correctly scoped
evidence.

This tranche is a policy boundary only. It does not change prompts, selection,
publishing, KV storage, or the meaning of any L02–L07 observation.

## Input contract

The evaluator receives two L07 aggregation results for the same exact scope:

- `D1`: observations collected at age 24 to under 48 hours, with a 48-hour cohort maturity boundary;
- `D3`: observations collected at age 72 to under 96 hours, with a 96-hour cohort maturity boundary.

Both inputs must have the same valid `period.asOf`. Each publication period is
the 14 days ending at its own maturity boundary, with `maxPosts: 100`. The two
publication ranges are intentionally different; their cohorts are not matched.
Malformed periods or mismatched as-of instants make the result unavailable.
V1 evaluates historical aligned pairs too: it has no wall-clock freshness cutoff.

The scope must match exactly on `workspaceId`, `connectedAccountId`, and
`threadsUserId`. General and Commerce groupings remain separate. The evaluator
does not reconstruct an aggregation from raw logs or snapshots.

An input is unavailable when either window is unavailable, has a different
scope, has a different schema version, or does not preserve
`interpretationMode: "DESCRIPTIVE"` and `causalClaimAllowed: false`.

## Candidate eligibility

A grouping/value is a candidate only when it exists in both windows and both
windows report the grouping as available. A candidate is held back when any of
these conditions applies:

1. either window has fewer than 10 valid target samples;
2. either window has fewer than 10 valid delta samples for every metric being
   considered;
3. the grouping has a missing/invalid/nonzero `excludedCount` or exceeds the L07 cardinality
   limit;
4. either window reports any excluded delta sample in any present allowlisted metric,
   or its exclusion counts are missing/malformed;
5. the value is not present in the same kind-specific field in both windows.

No value is inferred from absence. Unknown provenance never becomes an
`UNKNOWN` learning group.

Nonzero grouping exclusions hold the candidate as `UNAVAILABLE` with
`provenance_coverage_uncertain`: L07 combines invalid provenance and
`not_applicable`, so this policy cannot distinguish them. Delta exclusions hold
the entire candidate as `UNAVAILABLE`, even when other families have support.
Exclusion counts are nonnegative integers; explicit zero counts are permitted.
An absent metric supplies no support. A present metric must have valid exclusion
counts. Supporting metrics require both target and delta counts to be finite
integers from 10 through 100, delta count no greater than target count, finite
delta medians, and finite nonnegative target medians.

## Consistency rules

The evaluator checks each metric independently and then combines the results.
For a metric, a window direction is positive, negative, or neutral according to
the sign of its delta median. A metric is directionally consistent when D1 and
D3 have the same non-neutral direction, or when both are neutral.

The candidate has cross-metric support when at least two of the available
metric families (`reach`, `engagement`, `conversation`, `distribution`) have
directionally consistent medians in the same direction. One metric by itself
cannot produce a learnable signal.

The candidate is `LEARNABLE_DESCRIPTIVE` only when:

- at least two metric families support the same direction;
- no available metric family has the opposite direction;
- both windows meet the sample and provenance rules; and
- the candidate is present in both windows with the same kind and field.

Opposing non-neutral directions across families also produce `INCONSISTENT`,
even if two other families agree. Neutral families do not count as directional
support. These rules add no effect-size or significance threshold.

If the required sample exists but the metric directions disagree, the result is
`INCONSISTENT`, not a recommendation. If only one metric family is available,
the result is `INSUFFICIENT_SUPPORT`.

## Output contract

The evaluator returns a read-only object with:

- exact valid scope and the two window IDs (malformed scope identifiers are null);
- `interpretationMode: "DESCRIPTIVE"`;
- `causalClaimAllowed: false`;
- policy version and thresholds;
- group string labels are nonblank, limited to 200 characters and exclude control
  characters; commerce `usedCurrentTopic` and `usedUserExperience` retain boolean
  values exactly. No string/boolean coercion occurs;
- deterministic candidate ordering by kind, field, and value;
- per-candidate status: `LEARNABLE_DESCRIPTIVE`, `INCONSISTENT`,
  `INSUFFICIENT_SUPPORT`, or `UNAVAILABLE`;
- per-metric D1/D3 medians, directions, and support reasons;
- coverage counts for matched candidates, considered, learnable, and held back;
  rejected groupings/values have bounded diagnostic entries;
- limitations stating that the result is observational, descriptive, and not a
  causal estimate or an automatic content instruction.

No post body, raw log metadata, experience note, topic text, product text, or
unbounded source record is returned. The output contains labels and aggregate
statistics only.

At most 14 grouping containers per window and 20 values per grouping are
accepted (at most 280 matched candidates and 560 diagnostics across both
windows). Excess containers make the result unavailable; excess values reject
the grouping. Duplicate allowed grouping containers or duplicate value keys make
the result unavailable. Diagnostics use fixed reasons and allowlisted field/kind
names, never upstream arbitrary reason strings or rejected labels. Unsupported
groups are reported in diagnostics rather than emitted as candidates. Policy
arrays and all returned objects are deeply frozen; caller inputs are untouched.
Scope identifiers use the same nonblank/control-free 200-character bound.

## Consumer boundary

Until a later tranche explicitly approves a consumer, the result is not passed
into AI generation or content selection. A future consumer may use a
`LEARNABLE_DESCRIPTIVE` result only as bounded guidance and must preserve the
same scope, kind separation, sample thresholds, and non-causal wording.

## V1 limitations

- D1 and D3 are overlapping observations, so agreement is not independent
  replication.
- A ten-post threshold is an operational guard, not statistical significance.
- L07 discovery coverage and KV consistency limits still apply.
- Stored labels are not semantically clustered; similar labels remain separate.
- Account baselines may mix General and Commerce history as defined by L05.
