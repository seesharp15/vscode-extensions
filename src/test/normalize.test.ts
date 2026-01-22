import * as assert from "assert";
import { normalizeText } from "../normalize";
import { getTextUtilsConfig } from "../config";
suite("normalizeText", () => {
  test("replaces smart quotes with straight quotes", () => {
    const config = getTextUtilsConfig();
		const input = "“hello” ‘there’";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "\"hello\" 'there'");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("replaces em/en dashes with hyphen", () => {
    const config = getTextUtilsConfig();
		const input = "a—b–c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a-b-c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("replaces ellipsis with three dots", () => {
    const config = getTextUtilsConfig();
		const input = "wait…";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "wait...");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("removes zero-width/invisible characters", () => {
    const config = getTextUtilsConfig();
		const input = "a\u200Bb\u2060c\uFEFFd";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "abcd");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("normalizes NBSP to regular space", () => {
    const config = getTextUtilsConfig();
		const input = "a\u00A0b";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a b");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("flags unsupported characters instead of silently replacing", () => {
    const config = getTextUtilsConfig();
		const input = "hello ☃";
    const result = normalizeText(input, config);
    assert.strictEqual(result.hasDisallowedChars, true);
    assert.ok(result.disallowedSamples.includes("☃"));
  });

  test("does not treat commas as disallowed", () => {
    const config = getTextUtilsConfig();
		const input = "a,b,c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a,b,c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("does not treat curly braces as disallowed", () => {
    const config = getTextUtilsConfig();
		const input = "{a}{b}{}}{";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "{a}{b}{}}{");
    assert.strictEqual(result.hasDisallowedChars, false);
  });
  
  test("does not treat pipe as disallowed", () => {
    const config = getTextUtilsConfig();
		const input = "a|b|c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("replaces unsupported pipes", () => {
    const config = getTextUtilsConfig();
		const input = "a│b｜c∣d│e";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c|d|e");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

  test("replaces BOX DRAWINGS LIGHT VERTICAL │", () => {
    const config = getTextUtilsConfig();
		const input = "a│b│c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

    test("replaces BOX DRAWINGS HEAVY VERTICAL ┃", () => {
    const config = getTextUtilsConfig();
		const input = "a┃b┃c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

    test("replaces DIVIDES ∣", () => {
    const config = getTextUtilsConfig();
		const input = "a∣b∣c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });

    test("replaces FULLWIDTH VERTICAL LINE ｜", () => {
    const config = getTextUtilsConfig();
		const input = "a｜b｜c";
    const result = normalizeText(input, config);
    assert.strictEqual(result.text, "a|b|c");
    assert.strictEqual(result.hasDisallowedChars, false);
  });


});