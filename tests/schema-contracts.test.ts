import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { validators } from "../packages/schema/contracts.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const eventFile = fileURLToPath(new URL("./fixtures/events/valid-cnmid.json", import.meta.url));
const invalidEventFile = fileURLToPath(new URL("./fixtures/events/invalid-unknown-group.json", import.meta.url));
const speakerFile = path.join(root, "examples/speaker-example.json");
const invalidSpeakerFile = fileURLToPath(new URL("./fixtures/speakers/invalid-email.json", import.meta.url));
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const event = readJson(eventFile);
const speaker = readJson(speakerFile);

function runCli(args: string[] = [], cwd = root) {
  const result = spawnSync(
    process.execPath,
    ["--import", import.meta.resolve("tsx"), path.join(root, "packages/schema/validate-contracts.ts"), ...args],
    { cwd, encoding: "utf8", timeout: 10000 }
  );
  assert.ifError(result.error);
  return result;
}

test("accepts the CNMid event fixture", () => {
  assert.equal(validators.event(event), true);
});

for (const primaryGroup of ["CNMad", "AAIF", "DevFest", "WomenInTech", "MOSAIC"]) {
  test(`preserves the existing ${primaryGroup} event host`, () => {
    assert.equal(validators.event({ ...event, primaryGroup }), true);
  });
}

test("rejects the unknown-group event fixture", () => {
  assert.equal(validators.event(readJson(invalidEventFile)), false);
  assert.ok(validators.event.errors?.some((error) => error.keyword === "enum"));
});

test("requires eventId", () => {
  const { eventId, ...missingId } = event;
  assert.equal(validators.event(missingId), false);
});

test("rejects invalid event date-time formats", () => {
  assert.equal(validators.event({ ...event, dateTime: "tomorrow morning" }), false);
  assert.ok(validators.event.errors?.some((error) => error.keyword === "format"));
});

test("requires venue.isVirtual to be present and boolean", () => {
  assert.equal(validators.event({ ...event, venue: { name: "Example" } }), false);
  assert.equal(validators.event({ ...event, venue: { name: "Example", isVirtual: "false" } }), false);
});

test("requires crossPromoted to be an array and the root to be an object", () => {
  assert.equal(validators.event({ ...event, crossPromoted: "CNMad" }), false);
  assert.equal(validators.event([event]), false);
});

test("leaves geography and holiday-social policy out of the event schema", () => {
  assert.equal(validators.event({
    ...event,
    title: "Example holiday social",
    venue: { ...event.venue, address: "Example address, Janesville, WI" },
  }), true);
});

test("does not introduce freshness or extra-property restrictions", () => {
  assert.equal(validators.event({ ...event, dateTime: "2000-01-01T09:00:00-06:00", extra: true }), true);
});

test("accepts the repository speaker example", () => {
  assert.equal(validators.speaker(speaker), true);
});

test("rejects the invalid-email speaker fixture", () => {
  assert.equal(validators.speaker(readJson(invalidSpeakerFile)), false);
  assert.ok(validators.speaker.errors?.some((error) => error.keyword === "format"));
});

test("requires speaker bio", () => {
  const { bio, ...missingBio } = speaker;
  assert.equal(validators.speaker(missingBio), false);
});

test("rejects duplicate or empty speaker topics", () => {
  assert.equal(validators.speaker({ ...speaker, topics: ["Python", "Python"] }), false);
  assert.equal(validators.speaker({ ...speaker, topics: [] }), false);
});

test("rejects unknown speaker properties", () => {
  assert.equal(validators.speaker({ ...speaker, extra: true }), false);
  assert.equal(validators.speaker({ ...speaker, socials: { unsupported: "https://example.org" } }), false);
});

test("CLI smoke test validates both positive fixtures from outside the repo", () => {
  const result = runCli([], os.homedir());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /All 2 files passed/);
});

test("CLI accepts an explicit valid event file", () => {
  const result = runCli(["event", eventFile]);
  assert.equal(result.status, 0, result.stderr);
});

test("CLI accepts an explicit valid speaker file", () => {
  const result = runCli(["speaker", speakerFile]);
  assert.equal(result.status, 0, result.stderr);
});

test("CLI returns failure for an invalid event but still checks the remaining files", () => {
  const result = runCli(["event", invalidEventFile, eventFile]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid event:/);
  assert.match(result.stdout, /Valid event:/);
  assert.doesNotMatch(result.stdout, /All .* passed/);
});

test("CLI returns failure for the invalid speaker fixture", () => {
  const result = runCli(["speaker", invalidSpeakerFile]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid speaker:/);
});

test("CLI rejects unknown contracts and missing file arguments", () => {
  for (const args of [["unknown", eventFile], ["event"]]) {
    const result = runCli(args);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage:/);
  }
});

test("CLI returns failure for malformed JSON and missing files", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "mosaic-schema-test-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const malformed = path.join(dir, "malformed.json");
  fs.writeFileSync(malformed, "{not-json");
  for (const file of [malformed, path.join(dir, "missing.json")]) {
    const result = runCli(["event", file]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Could not validate/);
  }
});
