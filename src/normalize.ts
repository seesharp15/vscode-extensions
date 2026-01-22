// export const UNICODE_NORMALIZATION_MAP: Record<string, string> = {
//   "\u2014": "-", // EM DASH —
//   "\u2013": "-", // EN DASH –
//   "\u2212": "-", // MINUS SIGN −
//   "\u2010": "-", // HYPHEN ‐
//   "\u2011": "-", // NON-BREAKING HYPHEN
//   "\u2012": "-", // FIGURE DASH
//   "\u2015": "-", // HORIZONTAL BAR
//   "\u2043": "-", // HYPHEN BULLET

//   "\u201C": "\"", // “
//   "\u201D": "\"", // ”
//   "\u201E": "\"", // „
//   "\u201F": "\"", // ‟

//   "\u2018": "'", // ‘
//   "\u2019": "'", // ’
//   "\u201A": "'", // ‚
//   "\u201B": "'", // ‛
//   "\u2032": "'", // ′
//   "\u2035": "'", // ‵

//   "\u2026": "...", // …

//   "\u2022": "*", // •
//   "\u00B7": ".", // ·

//   "\u00A0": " ", // NBSP
//   "\u00AD": "",  // soft hyphen

//   "\u200B": "", // ZWSP
//   "\u200C": "", // ZWNJ
//   "\u200D": "", // ZWJ
//   "\u2060": "", // word joiner

//   "\u200E": "", // LRM
//   "\u200F": "", // RLM

//   "\u202A": "", // LRE
//   "\u202B": "", // RLE
//   "\u202C": "", // PDF
//   "\u202D": "", // LRO
//   "\u202E": "", // RLO

//   "\u2066": "", // LRI
//   "\u2067": "", // RLI
//   "\u2068": "", // FSI
//   "\u2069": "", // PDI

//   "\uFEFF": "", // BOM
//   "\u2044": "/", // fraction slash

//   "\u2192": "->", // RIGHTWARDS ARROW →

//   "\u2502": "|", // BOX DRAWINGS LIGHT VERTICAL │
//   "\u2503": "|", // BOX DRAWINGS HEAVY VERTICAL ┃
//   "\u2223": "|", // DIVIDES ∣
//   "\uFF5C": "|", // FULLWIDTH VERTICAL LINE ｜ 

// };
import { TextUtilsConfig } from "./config";
export type NormalizeResult = {
  text: string;
  hasDisallowedChars: boolean;
  disallowedSamples: string[];
};

// const DISALLOWED_CHAR =
//   /[^A-Za-z0-9 ,."'()\[\];:/?><!@#$%^&*+=\-\\ \t\r\n{}|]/g;

export function normalizeText(input: string, config: TextUtilsConfig): NormalizeResult {

  let out = input.normalize("NFKC");

  for (const [from, to] of Object.entries(config.mappings)) {
    out = out.split(from).join(to);
  }

  const matches = out.match(config.disallowedCharRegex) ?? [];
  const uniqueSamples = Array.from(new Set(matches)).slice(0, 10);

  return {
    text: out,
    hasDisallowedChars: matches.length > 0,
    disallowedSamples: uniqueSamples,
  };
}
