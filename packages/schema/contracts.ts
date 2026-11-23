import fs from "node:fs";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true, strict: true });
addFormats(ajv);

function compileSchema(relativePath: string) {
  const schema = JSON.parse(
    fs.readFileSync(new URL(relativePath, import.meta.url), "utf8")
  );
  return ajv.compile(schema);
}

// Ajv's default dialect is Draft-07, as declared by both community schemas.
export const validators = {
  event: compileSchema("../../schemas/events-schema.json"),
  speaker: compileSchema("../../schemas/speaker.schema.json"),
};

export type ContractName = keyof typeof validators;
