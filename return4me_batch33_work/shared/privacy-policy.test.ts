import { describe, expect, it } from "vitest";
import { publicDisclosureIssue } from "../server/services/privacy";

describe("public disclosure screening", () => {
  it("flags common private identifiers", () => {
    for (const sample of ["Contact user@example.com", "Call 0712345678", "IMEI: 123456789012345", "Pickup code: 123456", "Case R4M-AB1234", "National ID: 12345678"]) {
      expect(publicDisclosureIssue(sample)).not.toBeNull();
    }
  });
  it("allows general public-safe item descriptions", () => {
    const sample = "Black backpack with a blue zip and a stitched star pattern, found in a public area.";
    expect(publicDisclosureIssue(sample)).toBeNull();
  });
});
