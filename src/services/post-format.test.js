import assert from "node:assert/strict";

import {
  analyzePostFormat,
  getPostFormatPool,
  selectConcreteTargetPattern,
} from "./post-format.js";

function format(paragraphSentenceCounts) {
  return analyzePostFormat(
    paragraphSentenceCounts
      .map((sentenceCount, paragraphIndex) =>
        Array.from(
          { length: sentenceCount },
          (_, sentenceIndex) =>
            `문단${paragraphIndex + 1} 문장${sentenceIndex + 1}.`
        ).join(" ")
      )
      .join("\n\n")
  );
}

const compactSingle =
  getPostFormatPool().find(
    (target) =>
      target.id === "compact_single"
  );

const recentFormats = [
  format([2, 2]),
  format([2, 1, 2]),
  format([3, 2]),
  format([1, 1, 2]),
  format([5]),
];

const selected =
  selectConcreteTargetPattern(
    compactSingle,
    recentFormats
  );

assert.ok(selected);
assert.notEqual(
  selected.signature,
  "p1:s5",
  "a concrete pattern blocked inside the final exact-signature window must not be selected"
);

const explicitlyExcluded =
  selectConcreteTargetPattern(
    compactSingle,
    [],
    {
      excludedPatternSignatures: [
        "p1:s3",
        "p1:s4",
      ],
    }
  );

assert.equal(
  explicitlyExcluded.signature,
  "p1:s5"
);

console.log(
  "post format selection fixtures passed"
);
