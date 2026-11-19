export type MatchingInput = {
  id: string;
  reference: string;
  category: string;
  county: string;
  itemDescription: string;
  privateMetadata?: Record<string, unknown> | null;
};

export type MatchTier = "exact_approved_rule" | "subcategory" | "category";
export type MatchEvaluation = {
  tier: MatchTier;
  score: number;
  reasons: string[];
};

const stopWords = new Set(["the", "and", "with", "from", "this", "that", "item", "found", "lost", "have", "has", "was", "were", "for", "near"]);

function normalized(value: string) {
  return value.toLocaleLowerCase("en-KE").normalize("NFKD").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: string) {
  return new Set(normalized(value).split(" ").filter((token) => token.length >= 3 && !stopWords.has(token)));
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === "string" ? value.trim() : undefined;
}

/**
 * This function ranks candidate records for authorised human review.
 * It never establishes ownership, fraud or a valid claim.
 */
export function evaluatePotentialMatch(lost: MatchingInput, found: MatchingInput): MatchEvaluation | null {
  if (lost.id === found.id || lost.category.toLowerCase() !== found.category.toLowerCase()) return null;

  const lostApprovedKey = metadataText(lost.privateMetadata, "approvedMatchKey");
  const foundApprovedKey = metadataText(found.privateMetadata, "approvedMatchKey");
  const lostRuleApproved = lost.privateMetadata?.approvedMatchRule === true;
  const foundRuleApproved = found.privateMetadata?.approvedMatchRule === true;
  const reasons: string[] = [];
  let tier: MatchTier = "category";
  let score = 52;

  if (lostRuleApproved && foundRuleApproved && lostApprovedKey && foundApprovedKey && normalized(lostApprovedKey) === normalized(foundApprovedKey)) {
    tier = "exact_approved_rule";
    score = 92;
    reasons.push("Same approved item rule");
  } else {
    const lostSubcategory = metadataText(lost.privateMetadata, "subcategory");
    const foundSubcategory = metadataText(found.privateMetadata, "subcategory");
    if (lostSubcategory && foundSubcategory && normalized(lostSubcategory) === normalized(foundSubcategory)) {
      tier = "subcategory";
      score = 72;
      reasons.push("Same item subcategory");
    } else {
      reasons.push("Same approved item category");
    }
  }

  if (lost.county === found.county) {
    score += 8;
    reasons.push("Same county");
  }

  const left = tokens(lost.itemDescription);
  const right = tokens(found.itemDescription);
  const intersection = [...left].filter((token) => right.has(token));
  const union = new Set([...left, ...right]);
  const overlap = union.size ? intersection.length / union.size : 0;
  if (overlap > 0) {
    const lexicalPoints = Math.min(12, Math.round(overlap * 16));
    score += lexicalPoints;
    reasons.push("Some description terms overlap");
  }

  return { tier, score: Math.min(99, score), reasons };
}

export function matchingIsOwnershipProof(): false {
  return false;
}
