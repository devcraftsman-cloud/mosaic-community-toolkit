import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { validators, type ContractName } from "./contracts.ts";

const args = process.argv.slice(2);
const usage = "Usage: npm run validate:schemas -- <event|speaker> <file.json> [file.json ...]";

// With no arguments, smoke-test the checked-in positive fixtures.
const inputs: Array<{ contract: ContractName; file: string }> = [];
if (args.length === 0) {
  inputs.push(
    {
      contract: "event",
      file: fileURLToPath(new URL("../../tests/fixtures/events/valid-cnmid.json", import.meta.url)),
    },
    {
      contract: "speaker",
      file: fileURLToPath(new URL("../../examples/speaker-example.json", import.meta.url)),
    }
  );
} else if ((args[0] === "event" || args[0] === "speaker") && args.length >= 2) {
  const contract = args[0];
  inputs.push(...args.slice(1).map((file) => ({ contract, file })));
} else {
  console.error(usage);
  process.exit(1);
}

let failed = 0;
for (const { contract, file } of inputs) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    const validate = validators[contract];
    if (!validate(data)) {
      console.error(`Invalid ${contract}: ${file}`, validate.errors);
      failed++;
    } else {
      console.log(`Valid ${contract}: ${file}`);
    }
  } catch (error) {
    console.error(`Could not validate ${file}:`, error instanceof Error ? error.message : error);
    failed++;
  }
}

if (failed > 0) process.exit(1);
console.log(`All ${inputs.length} files passed community schema validation.`);
