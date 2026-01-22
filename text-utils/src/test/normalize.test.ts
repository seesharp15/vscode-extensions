import * as assert from "assert";
import { normalizeText } from "../normalize";
import { buildConfigFromRaw } from "../config";
import {TextUtilsConfig} from "../config";
// type TestConfig = {
//   map: Map<string, string>;
//   allowedOutputChars: Set<string>;
// };

function makeConfig(entries: Array<[string, string]>): TextUtilsConfig {
  return buildConfigFromRaw(
    Object.fromEntries(
      entries.map(([k, v]) => [k, { replaceWith: v, description: "" }]),
    ),
  );
}

function identity(chars: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const ch of chars) {
    out.push([ch, ch]);
  }
  return out;
}

function expectNoIssues(result: {
  unmappedInputSamples: string[];
  illegalOutputSamples: string[];
}) {
  assert.deepStrictEqual(
    result.unmappedInputSamples,
    [],
    `Expected no unmapped input characters, got: ${result.unmappedInputSamples.join(" ")}`,
  );
  assert.deepStrictEqual(
    result.illegalOutputSamples,
    [],
    `Expected no illegal output characters, got: ${result.illegalOutputSamples.join(" ")}`,
  );
}

suite("normalizeText (map-only strict)", () => {
  test("supports multi-character replacement (ellipsis)", () => {
    const input = "wait…";
    const config = makeConfig([...identity("wait"), ["…", "..."], [".", "."]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "wait...");
    expectNoIssues(result);
  });

  test("supports multi-character replacement (arrow)", () => {
    const input = "a→b";
    const config = makeConfig([
      ...identity("ab"),
      ["→", "->"],
      ["-", "-"],
      [">", ">"],
    ]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a->b");
    expectNoIssues(result);
  });

  test("supports empty replacement (removal)", () => {
    const input = "a\u200Bb";
    const config = makeConfig([...identity("ab"), ["\u200B", ""]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "ab");
    expectNoIssues(result);
  });

  test("supports blank replacement value (empty string)", () => {
    const input = "a\u00ADb";
    const config = makeConfig([...identity("ab"), ["\u00AD", ""]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "ab");
    expectNoIssues(result);
  });

  test("supports identity replacement (replaced by itself)", () => {
    const input = "{a}|";
    const config = makeConfig([...identity("{a}|")]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "{a}|");
    expectNoIssues(result);
  });

  test("handles repeated occurrences and mixed replacements", () => {
    const input = "“a…b…c”";
    const config = makeConfig([
      ...identity("abc"),
      ["“", '"'],
      ["”", '"'],
      ['"', '"'],
      ["…", "..."],
      [".", "."],
    ]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, '"a...b...c"');
    expectNoIssues(result);
  });

  test("replaces multiple unicode pipe variants to ASCII pipe", () => {
    const input = "a│b┃c∣d｜e";
    const config = makeConfig([
      ...identity("abcde|"),
      ["│", "|"],
      ["┃", "|"],
      ["∣", "|"],
      ["｜", "|"],
    ]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c|d|e");
    expectNoIssues(result);
  });

  test("flags unmapped input characters and illegal output characters (unmapped char kept)", () => {
    const input = "hello ☃";
    const config = makeConfig([...identity("hello ")]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "hello ☃");
    assert.ok(result.unmappedInputSamples.includes("☃"));
    assert.ok(result.illegalOutputSamples.includes("☃"));
  });

  test("dedupes unmapped/illegal samples", () => {
    const input = "☃☃☃";
    const config = makeConfig([]);
    const result = normalizeText(input, config);
    assert.ok(result.unmappedInputSamples.includes("☃"));
    assert.ok(result.illegalOutputSamples.includes("☃"));
    assert.strictEqual(
      result.unmappedInputSamples.filter((x) => x === "☃").length,
      1,
    );
    assert.strictEqual(
      result.illegalOutputSamples.filter((x) => x === "☃").length,
      1,
    );
  });

  test("caps samples at 20 unique characters", () => {
    // 30 unique “bad” chars (use a Unicode range that’s easy)
    const badChars = Array.from({ length: 30 }, (_, i) =>
      String.fromCharCode(0x0100 + i),
    ).join("");
    const input = badChars;
    const config = makeConfig([]);
    const result = normalizeText(input, config);

    assert.strictEqual(result.unmappedInputSamples.length, 20);
    assert.strictEqual(result.illegalOutputSamples.length, 20);
  });

  test("derived output allowlist allows characters that appear in replacement values", () => {
    const input = "x";
    const config = makeConfig([["x", "y"]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "y");
    assert.deepStrictEqual(result.unmappedInputSamples, []);
    assert.deepStrictEqual(result.illegalOutputSamples, []);
  });

  test("supports newlines when explicitly allowed (identity)", () => {
    const input = "a\nb";
    const config = makeConfig([...identity("ab"), ["\n", "\n"]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a\nb");
    expectNoIssues(result);
  });

  test("supports replacement that PRODUCES a newline", () => {
    const input = "a;b";
    const config = makeConfig([
      ...identity("ab"),
      [";", "\n"],
      ["\n", "\n"], // not required if allowlist is derived from values, but good explicitness
    ]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a\nb");
    expectNoIssues(result);
  });

  test("handles astral codepoints (emoji) correctly (unmapped)", () => {
    const input = "ok 🙂";
    const config = makeConfig([...identity("ok ")]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "ok 🙂");
    assert.ok(result.unmappedInputSamples.includes("🙂"));
    assert.ok(result.illegalOutputSamples.includes("🙂"));
  });

  test("NFKC normalization occurs before mapping and before unmapped detection (fullwidth digit)", () => {
    const input = "１";
    const config = makeConfig([["1", "1"]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "1");
    expectNoIssues(result); // ensures unmappedInputSamples is also empty
  });

  test("supports multi-character replacement when the replacement text isn't explicitly mapped", () => {
    const input = "a→b";
    const config = makeConfig([...identity("ab"), ["→", "->"]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a->b");
    expectNoIssues(result);
  });

  test("All values in a multi-character replacement are implicitly allowed", () => {
    const input = "a";
    const config = makeConfig([["a", "bcdefg"]]);
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "bcdefg");
    expectNoIssues(result);
  });

  test("multi-character replacement allows output chars but still flags unmapped input", () => {
    const input = "abcdefg";
    const config = makeConfig([["a", "bcdefg"]]);
    const result = normalizeText(input, config);

    assert.strictEqual(result.text, "bcdefgbcdefg");

    assert.deepStrictEqual(result.unmappedInputSamples.sort(), [
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
    assert.deepStrictEqual(result.illegalOutputSamples, []);
  });
});

suite("buildConfigFromRaw (config normalization)", () => {
  test("coalesces null/undefined replacement values to empty string", () => {
    // This assumes buildConfigFromRaw accepts Record<string, any>
    const config = buildConfigFromRaw({
      "\u200B": undefined,
      "\u200C": null,
      "\u00AD": "",
      a: "a",
    } as any);

    // Normalize should remove these chars if present
    const input = "a\u200Ba\u200Ca\u00ADa";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "aaaa");
    expectNoIssues(result);
  });

  test("decodes unicode escape keys like \\\\u201D when building config", () => {
    const config = buildConfigFromRaw({
      "\\u201D": '"',
      '"': '"',
      a: "a",
    } as any);

    const input = "a”a";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, 'a"a');
    expectNoIssues(result);
  });

  test("decodes unicode escape keys in the replacement value like \\\\u201D when building config", () => {
    const config = buildConfigFromRaw({
      '"': "\\u201D",
      a: "a",
    } as any);

    const input = 'a"a';
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a”a");
    expectNoIssues(result);
  });
});
