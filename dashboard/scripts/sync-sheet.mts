// Sinkron spreadsheet dari command line / cron: npm run sync-sheet -- [OKTOBER NOVEMBER]
// Atau impor dari file JSON hasil export Sheets API: npm run sync-sheet -- --file OKTOBER=path.json
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const { importSheetRows, syncSpreadsheet } = await import("../src/lib/sheet-sync.ts");
if (args[0] === "--file") {
  const [tab, path] = args[1].split("=");
  const values = JSON.parse(readFileSync(path, "utf8")).values as unknown[][];
  console.log(await importSheetRows(tab, values));
} else {
  for (const s of await syncSpreadsheet(args)) console.log(s.tab, { total: s.total, inserted: s.inserted, updated: s.updated, unchanged: s.unchanged, warnings: s.warnings.length });
}
process.exit(0);
