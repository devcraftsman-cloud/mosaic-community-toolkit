import fs from "node:fs";
import path from "node:path";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const ajv = new Ajv({ allErrors: true });
addFormats(ajv);

const schema = JSON.parse(
  fs.readFileSync(path.resolve("packages/schema/corkboard-item.schema.json"), "utf8")
);
const validate = ajv.compile(schema);

const pubDir = path.resolve("instances/cnmid/data/published");
const files = fs.readdirSync(pubDir).filter((f) => f.endsWith(".json"));

let failed = 0;
for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(pubDir, file), "utf8"));
  const valid = validate(data);
  if (!valid) {
    console.error(`❌ Invalid: ${file}`, validate.errors);
    failed++;
  } else {
    console.log(`✅ Valid: ${file}`);
  }
}

if (failed > 0) process.exit(1);
console.log(`All ${files.length} published items passed AJV validation.`);
