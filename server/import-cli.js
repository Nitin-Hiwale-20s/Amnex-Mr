// Loads every .xlsx in server/data into the database.  Run:  npm run import
const fs = require('fs');
const path = require('path');
const { connect } = require('./db');
require('./models');
const { importFiles } = require('./importer');

(async () => {
  try { await connect(); } catch (e) { console.error(e.message); process.exit(1); }
  const dir = path.join(__dirname, 'data');
  const files = fs.readdirSync(dir).filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$')).map(f => ({ name: f, buffer: fs.readFileSync(path.join(dir, f)) }));
  if (!files.length) { console.log('No .xlsx files found in server/data'); process.exit(0); }
  for (const r of await importFiles(files)) {
    console.log(`\n${r.ok ? 'OK ' : 'FAILED'}  ${r.name}  [${r.kind || 'unknown'}]`);
    r.summary.forEach(s => console.log('   + ' + s));
    r.warnings.forEach(s => console.log('   ! ' + s));
  }
  process.exit(0);
})();
