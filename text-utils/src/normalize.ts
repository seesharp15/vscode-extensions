import { TextUtilsConfig } from "./config";

export type NormalizeResult = {
  text: string;
  unmappedInputSamples: string[];
  illegalOutputSamples: string[];
};

export function normalizeText(
  input: string,
  config: TextUtilsConfig,
): NormalizeResult {
  // Your earlier behavior included NFKC; keep it or remove it.
  // If you truly want “dumb”, delete the next line.
  const normalized = input.normalize("NFKC");

  const unmapped = new Set<string>();
  const outParts: string[] = [];

  // Iterate by Unicode code points (for-of does the right thing)
  for (const ch of normalized) {
    const replacement = config.map.get(ch);
    if (replacement === undefined) {
      unmapped.add(ch);
      outParts.push(ch); // coalesce to itself
    } else {
      outParts.push(replacement);
    }
  }

  const out = outParts.join("");

  // Strict output validation: output must consist ONLY of chars that appear
  // in replacement VALUES (derived allowlist).
  const illegalOutput = new Set<string>();
  for (const ch of out) {
    if (!config.allowedOutputChars.has(ch)) {
      illegalOutput.add(ch);
    }
  }

  return {
    text: out,
    unmappedInputSamples: Array.from(unmapped).slice(0, 20),
    illegalOutputSamples: Array.from(illegalOutput).slice(0, 20),
  };
}
