import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL =
  "https://raw.githubusercontent.com/upbound-web/worldcup-live.json/master/2026/worldcup.json";
const OUTPUT_FILE = path.resolve("data/worldcup.json");

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "world-cup-sweepstake-updater",
    },
  });

  if (!response.ok) {
    throw new Error(`Result fetch failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  data.lastUpdated = new Date().toISOString();
  data.source = SOURCE_URL;

  await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await writeFile(OUTPUT_FILE, `${JSON.stringify(data, null, 2)}\n`);

  console.log(`Updated ${OUTPUT_FILE} from ${SOURCE_URL}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
