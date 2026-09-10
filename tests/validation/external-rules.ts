import type { Rule } from "@bunwire/validation";

/** Simulates a rule exported by a separately published package. */
export const sourceFileRule: Rule = {
  name: "source-file",
  defaultMessage: "The :attribute field must be a TypeScript source file.",
  caller: ({ value }) => typeof value === "string" && /\.(ts|tsx)$/.test(value)
    ? { valid: true }
    : { valid: false, code: "SOURCE_FILE", metadata: { acceptedExtensions: [".ts", ".tsx"] } },
};
