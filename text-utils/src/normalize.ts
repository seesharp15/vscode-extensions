import { TextUtilsConfig } from "./config";

export type CharMapping = {
  original: string;
  originalCodePoint: number;
  /** The replacement string if mapped; the char itself if not mapped (pass-through). */
  replacement: string;
  /** True when the char was found in config.map. */
  mapped: boolean;
  /** True when the char is disallowed by the regex AND was not in config.map. */
  unmapped: boolean;
  /** True when the pass-through char is disallowed and not in allowedOutputChars. */
  illegalOutput: boolean;
};

export type NormalizeResult = {
  text: string;
  unmappedInputSamples: string[];
  illegalOutputSamples: string[];
  charMappings: CharMapping[];
};

export type NormalizeTraceEvent =
  | {
      kind: "input";
      index: number;
      char: string;
      codePoint: number;
      mapped: boolean;
      replacement: string;
      disallowed: boolean;
    }
  | {
      kind: "output";
      index: number;
      char: string;
      codePoint: number;
      disallowed: boolean;
      allowedByReplacementValue: boolean;
      illegal: boolean;
    };

export type NormalizeOptions = {
  onTrace?: (event: NormalizeTraceEvent) => void;
};

function matches(regex: RegExp, input: string): boolean {
  regex.lastIndex = 0;
  return regex.test(input);
}

export function normalizeText(
  input: string,
  config: TextUtilsConfig,
  options?: NormalizeOptions,
): NormalizeResult {
  // Your earlier behavior included NFKC; keep it or remove it.
  // If you truly want “dumb”, delete the next line.
  const normalized = input.normalize("NFKC");

  const unmapped = new Set<string>();
  const outParts: string[] = [];
  const charMappings: CharMapping[] = [];
  let inputIndex = 0;

  // Iterate by Unicode code points (for-of does the right thing)
  for (const ch of normalized) {
    const replacement = config.map.get(ch);
    const mapped = replacement !== undefined;
    const value = mapped ? replacement : ch;
    const disallowedInput = matches(config.disallowedRegex, ch);

    if (replacement === undefined) {
      if (disallowedInput) {
        unmapped.add(ch);
      }
      outParts.push(ch); // coalesce to itself
    } else {
      outParts.push(replacement);
    }

    charMappings.push({
      original: ch,
      originalCodePoint: ch.codePointAt(0) ?? 0,
      replacement: value,
      mapped,
      unmapped: !mapped && disallowedInput,
      illegalOutput: !mapped && disallowedInput && !config.allowedOutputChars.has(ch),
    });

    options?.onTrace?.({
      kind: "input",
      index: inputIndex,
      char: ch,
      codePoint: ch.codePointAt(0) ?? 0,
      mapped,
      replacement: value,
      disallowed: disallowedInput,
    });
    inputIndex += 1;
  }

  const out = outParts.join("");

  // Strict output validation: output must consist ONLY of chars that appear
  // in replacement VALUES (derived allowlist).
  const illegalOutput = new Set<string>();
  let outputIndex = 0;
  for (const ch of out) {
    const disallowedOutput = matches(config.disallowedRegex, ch);
    const allowedByReplacementValue = config.allowedOutputChars.has(ch);
    const illegal = disallowedOutput && !allowedByReplacementValue;

    if (
      disallowedOutput &&
      !allowedByReplacementValue
    ) {
      illegalOutput.add(ch);
    }

    options?.onTrace?.({
      kind: "output",
      index: outputIndex,
      char: ch,
      codePoint: ch.codePointAt(0) ?? 0,
      disallowed: disallowedOutput,
      allowedByReplacementValue,
      illegal,
    });
    outputIndex += 1;
  }

  return {
    text: out,
    unmappedInputSamples: Array.from(unmapped).slice(0, 20),
    illegalOutputSamples: Array.from(illegalOutput).slice(0, 20),
    charMappings,
  };
}
