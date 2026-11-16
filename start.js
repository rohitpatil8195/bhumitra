const { spawn } = require('child_process');

const children = [
  spawn(process.execPath, [require.resolve('./server.js')], { stdio: 'inherit', env: process.env }),
  spawn(process.execPath, [require.resolve('react-scripts/scripts/start')], { stdio: 'inherit', env: process.env }),
];

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  children.forEach(child => { if (!child.killed) child.kill('SIGTERM'); });
  process.exitCode = code;
}

children.forEach(child => {
  child.on('error', error => { console.error(error.message); stop(1); });
  child.on('exit', (code, signal) => {
    if (!stopping) stop(code || (signal ? 1 : 0));
  });
});

['SIGINT', 'SIGTERM'].forEach(signal => process.on(signal, () => stop(0)));
