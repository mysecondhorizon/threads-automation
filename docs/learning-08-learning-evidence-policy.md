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

- `D1`: the 48-hour observation window;
- `D3`: the 96-hour observation window.

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
3. the grouping has missing/invalid provenance or exceeds the L07 cardinality
   limit;
4. either window reports an unavailable baseline or an excluded delta sample;
5. the value is not present in the same kind-specific field in both windows.

No value is inferred from absence. Unknown provenance never becomes an
`UNKNOWN` learning group.

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

If the required sample exists but the metric directions disagree, the result is
`INCONSISTENT`, not a recommendation. If only one metric family is available,
the result is `INSUFFICIENT_SUPPORT`.

## Output contract

The evaluator returns a read-only object with:

- exact scope and the two window IDs;
- `interpretationMode: "DESCRIPTIVE"`;
- `causalClaimAllowed: false`;
- policy version and thresholds;
- group labels are limited to 200 characters; longer or malformed labels are
  out of scope;
- deterministic candidate ordering by kind, field, and value;
- per-candidate status: `LEARNABLE_DESCRIPTIVE`, `INCONSISTENT`,
  `INSUFFICIENT_SUPPORT`, `UNAVAILABLE`, or `OUT_OF_SCOPE`;
- per-metric D1/D3 medians, directions, and support reasons;
- coverage counts for candidates considered, held back, and unavailable;
- limitations stating that the result is observational, descriptive, and not a
  causal estimate or an automatic content instruction.

No post body, raw log metadata, experience note, topic text, product text, or
unbounded source record is returned. The output contains labels and aggregate
statistics only.

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
