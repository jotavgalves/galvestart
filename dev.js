const { spawn } = require('child_process');
const path = require('path');
const opts = { stdio: 'inherit', cwd: __dirname };
const site = spawn(process.execPath, [path.join(__dirname, 'server.js')], opts);
const admin = spawn(process.execPath, [path.join(__dirname, 'admin-server.js')], opts);
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { site.kill(sig); admin.kill(sig); });
