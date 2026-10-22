import { createValidator, rules } from "@bunwire/validation";
import { describe, expect, it } from "vitest";

const png = new File(["png"], "picture.png", { type: "image/png" });
const jpeg = new File(["jpeg"], "picture.jpg", { type: "image/jpeg" });
const text = new File(["long text"], "picture.png", { type: "text/plain" });

describe("file validation rules", () => {
  it("requires a File or a nonempty array of Files", () => {
    const validator = createValidator();
    for (const value of [png, [png, jpeg]]) {
      expect(validator.validate({ upload: value }, { upload: "file" }).valid).toBe(true);
    }
    for (const value of [undefined, null, "picture.png", [], [png, "bad"]]) {
      expect(validator.validate({ upload: value }, { upload: "file" }).valid).toBe(false);
    }
    expect(validator.validate({}, { upload: "optional|file" }).valid).toBe(true);
  });

  it("checks every file size in bytes and rejects invalid limits", () => {
    const validator = createValidator();
    expect(validator.validate({ upload: [png, jpeg] }, { upload: "file|maxFileBytes:3" }).valid).toBe(false);
    expect(validator.validate({ upload: [png, jpeg] }, { upload: rules.maxFileBytes(5) }).valid).toBe(true);
    expect(validator.validate({ upload: text }, { upload: "maxFileBytes:5" }).valid).toBe(false);
    expect(() => validator.validate({ upload: png }, { upload: "maxFileBytes:-1" })).toThrow(/byte limit/i);
  });

  it("checks declared MIME metadata, independent of the filename", () => {
    const validator = createValidator();
    expect(validator.validate({ upload: [png, jpeg] }, { upload: "mime:image/png,image/jpeg" }).valid).toBe(true);
    expect(validator.validate({ upload: text }, { upload: rules.mime("image/png") }).valid).toBe(false);
    expect(validator.validate({ upload: "image/png" }, { upload: "mime:image/png" }).valid).toBe(false);
    expect(() => validator.validate({ upload: png }, { upload: "mime:" })).toThrow(/MIME types/i);
  });
});
