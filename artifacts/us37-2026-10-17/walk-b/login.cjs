// usage: node login.js <portal> [email]
const { login } = require('./lib.cjs');
login(process.argv[2], process.argv[3]).catch((e) => { console.error(e); process.exit(1); });
