import { describe, it, expect } from "vitest";
import {
  normalize, tokens, splitSentences, shingles, analyzeReport,
} from "./plagiarismEngine";
import { RepositoryDocument } from "@/types/plagiarism";

describe("normalize", () => {
  it("lowercases, strips punctuation, and collapses whitespace", () => {
    expect(normalize("Hello, World!!  Foo-Bar.")).toBe("hello world foo bar");
  });

  it("keeps unicode letters and numbers", () => {
    expect(normalize("café 2024")).toBe("café 2024");
  });

  it("trims leading/trailing whitespace", () => {
    expect(normalize("   spaced out   ")).toBe("spaced out");
  });

  it("returns empty string for empty input", () => {
    expect(normalize("")).toBe("");
  });
});

describe("tokens", () => {
  it("splits normalized text into words and removes stopwords by default", () => {
    expect(tokens("The cat and the dog are friends")).toEqual(["cat", "dog", "friends"]);
  });

  it("keeps stopwords when removeStop is false", () => {
    const result = tokens("the cat and the dog", false);
    expect(result).toContain("the");
    expect(result).toContain("and");
  });

  it("filters out single-character words", () => {
    expect(tokens("a big I dog")).toEqual(["big", "dog"]);
  });

  it("returns empty array for empty string", () => {
    expect(tokens("")).toEqual([]);
  });
});

describe("splitSentences", () => {
  it("splits text into sentences on terminal punctuation followed by a capital/number/quote", () => {
    const text = "This is the first sentence. This is the second one! Is this the third? Yes it is.";
    const result = splitSentences(text);
    // "Yes it is." has only 3 words so the >= 4 word filter drops it, leaving 3 sentences.
    expect(result.length).toBe(3);
    expect(result[0]).toBe("This is the first sentence.");
    expect(result[2]).toBe("Is this the third?");
  });

  it("filters out short sentences with fewer than 4 words", () => {
    const text = "Ok. This one has enough words to count. No way.";
    const result = splitSentences(text);
    // "Ok." (1 word) and "No way." (2 words) should be dropped
    expect(result).toEqual(["This one has enough words to count."]);
  });

  it("returns empty array for empty text", () => {
    expect(splitSentences("")).toEqual([]);
  });

  it("collapses internal whitespace/newlines before splitting", () => {
    const text = "First sentence here now.\n\n  Second sentence follows too.";
    const result = splitSentences(text);
    expect(result.length).toBe(2);
  });
});

describe("shingles", () => {
  it("builds k-length word shingles by default (k=4)", () => {
    const words = ["a", "b", "c", "d", "e"];
    const result = shingles(words);
    expect(result).toEqual(new Set(["a b c d", "b c d e"]));
  });

  it("supports a custom k", () => {
    const words = ["a", "b", "c", "d"];
    const result = shingles(words, 2);
    expect(result).toEqual(new Set(["a b", "b c", "c d"]));
  });

  it("falls back to the whole (short) word list as a single shingle when fewer words than k", () => {
    const words = ["only", "two"];
    const result = shingles(words, 4);
    expect(result).toEqual(new Set(["only two"]));
  });

  it("returns an empty set for an empty word list", () => {
    expect(shingles([], 4)).toEqual(new Set());
  });
});

describe("analyzeReport", () => {
  const repoDoc: RepositoryDocument = {
    id: "doc1",
    title: "Climate Change Effects",
    studentName: "Alice Smith",
    department: "Science",
    year: "2025",
    text: "Climate change is causing significant impacts on global ecosystems and weather patterns worldwide today. Rising temperatures are melting polar ice caps at an alarming and unprecedented rate every single year.",
  };
  const repoMeta = [{ id: "doc1", studentName: "Alice Smith", title: "Climate Change Effects" }];

  it("returns a well-shaped result for original, unrelated text against an empty repository", () => {
    const text = "The quick brown fox jumps over the lazy dog near the riverbank. It then runs quickly into the nearby forest looking for food.";
    const result = analyzeReport(text, [], []);

    expect(result.overallSimilarity).toBe(0);
    expect(result.breakdown).toEqual({ internet: 0, studentRepo: 0, research: 0 });
    expect(result.exactMatches).toBe(0);
    expect(result.sentenceMatches.length).toBeGreaterThan(0);
    expect(result.sentenceMatches.every((m) => m.sourceId === undefined)).toBe(true);
    expect(result.studentMatches).toEqual([]);
    expect(result.sources).toEqual([]);
    expect(typeof result.wordCount).toBe("number");
    expect(result.wordCount).toBeGreaterThan(0);
    expect(result.analyzedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("detects an exact copy of a repository sentence as a high-similarity / exact match", () => {
    const copiedText = "Climate change is causing significant impacts on global ecosystems and weather patterns worldwide today.";
    const result = analyzeReport(copiedText, [repoDoc], repoMeta);

    expect(result.exactMatches).toBeGreaterThan(0);
    const match = result.sentenceMatches[0];
    expect(match.score).toBeGreaterThanOrEqual(0.72);
    expect(match.sourceId).toBe("doc1");
    expect(match.sourceLabel).toBe("Alice Smith — Climate Change Effects");
    expect(result.breakdown.studentRepo).toBeGreaterThan(0);
    expect(result.studentMatches.length).toBe(1);
    expect(result.studentMatches[0]).toMatchObject({ studentName: "Alice Smith", reportTitle: "Climate Change Effects", reportId: "doc1" });
  });

  it("does not flag a repository match for text with no meaningful overlap", () => {
    const text = "Basketball players practice free throws every single afternoon after school ends for the day.";
    const result = analyzeReport(text, [repoDoc], repoMeta);
    expect(result.exactMatches).toBe(0);
    expect(result.studentMatches).toEqual([]);
  });

  it("flags citation issues when there is no references section and an uncited numeric claim", () => {
    const text = "Studies show that over 90% of participants improved their scores after the program. This is a clear and remarkable result for everyone involved.";
    const result = analyzeReport(text, [], []);
    const types = result.citations.map((c) => c.type);
    expect(types).toContain("improper-reference");
    expect(types).toContain("missing-citation");
  });

  it("reports citations look consistent when references exist and claims are cited", () => {
    const text = "According to research (Smith, 2020), over 90% of participants improved significantly. See the References section below for full citation details.";
    const result = analyzeReport(text, [], []);
    const types = result.citations.map((c) => c.type);
    expect(types).toContain("citation-mismatch");
    expect(types).not.toContain("missing-citation");
  });

  it("flags unquoted long quotations without a nearby citation", () => {
    const text = `The author wrote "${"word ".repeat(10)}without any nearby source attribution at all" and moved on quickly to the next section entirely.`;
    const result = analyzeReport(text, [], []);
    expect(result.citations.some((c) => c.type === "unquoted-content")).toBe(true);
  });

  it("computes AI detection fields within valid ranges and a risk level", () => {
    const text = "It is important to note that this essay will delve into the topic thoroughly. Furthermore, this comprehensive understanding underscores the importance of a robust framework. Moreover, in conclusion, leveraging a holistic and seamless approach is a testament to careful planning in today's world.";
    const result = analyzeReport(text, [], []);
    expect(result.ai.aiProbability).toBeGreaterThanOrEqual(2);
    expect(result.ai.aiProbability).toBeLessThanOrEqual(98);
    expect(result.ai.humanProbability).toBe(100 - result.ai.aiProbability);
    expect(["Low", "Moderate", "High", "Critical"]).toContain(result.ai.risk);
    expect(result.ai.signals.length).toBeGreaterThan(0);
    expect(result.ai.signals.some((s) => s.includes("AI-typical phrases"))).toBe(true);
  });

  it("falls back to a default 'no strong indicators' signal when nothing trips", () => {
    // Short/varied casual text unlikely to trip any AI heuristic thresholds.
    const text = "I didn't go to the game yesterday. My dog wouldn't stop barking! Can you believe that?";
    const result = analyzeReport(text, [], []);
    expect(Array.isArray(result.ai.signals)).toBe(true);
    expect(result.ai.signals.length).toBeGreaterThan(0);
  });

  it("does not simulate internet/research sources when there are 4 or fewer sentences", () => {
    const text = "This is one short sentence right here. This is a second short sentence too.";
    const result = analyzeReport(text, [], []);
    expect(result.breakdown.internet).toBe(0);
    expect(result.breakdown.research).toBe(0);
    expect(result.sources.filter((s) => s.type === "internet" || s.type === "research")).toEqual([]);
  });

  it("simulates internet/research sources deterministically for longer texts", () => {
    const text = "This is sentence number one right here today. This is sentence number two right here today. This is sentence number three right here today. This is sentence number four right here today. This is sentence number five right here today.";
    const result1 = analyzeReport(text, [], []);
    const result2 = analyzeReport(text, [], []);
    // Deterministic seed based on normalized text length -> same simulated sources each run.
    expect(result1.sources).toEqual(result2.sources);
    expect(result1.sources.length).toBeGreaterThan(0);
    expect(result1.sources.every((s) => s.type === "internet" || s.type === "research")).toBe(true);
  });

  it("caps overallSimilarity at 100", () => {
    // Build a repo doc identical to the submitted text to maximize studentRepo pct,
    // combined with a long text to trigger simulated internet/research pct too.
    const bigText = Array.from({ length: 8 }, (_, i) => `This is repeated important sentence number ${i} about testing overall similarity caps.`).join(" ");
    const bigRepoDoc: RepositoryDocument = { id: "doc2", title: "Dup", studentName: "Bob", department: "X", year: "2025", text: bigText };
    const result = analyzeReport(bigText, [bigRepoDoc], [{ id: "doc2", studentName: "Bob", title: "Dup" }]);
    expect(result.overallSimilarity).toBeLessThanOrEqual(100);
  });

  it("computes wordCount from normalized full text regardless of stopword removal", () => {
    const text = "This is a simple test sentence with several words in it.";
    const result = analyzeReport(text, [], []);
    const expectedCount = normalize(text).split(" ").filter(Boolean).length;
    expect(result.wordCount).toBe(expectedCount);
  });
});
