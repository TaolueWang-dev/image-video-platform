import process from 'node:process';

function write(stream, record) {
  stream.write(`${JSON.stringify(record)}\n`);
}

export function createLogger({ env }) {
  function log(level, event, fields = {}) {
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      env,
      ...fields,
    };

    if (level === 'error') {
      write(process.stderr, record);
      return;
    }

    write(process.stdout, record);
  }

  return {
    debug(event, fields) {
      log('debug', event, fields);
    },
    info(event, fields) {
      log('info', event, fields);
    },
    warn(event, fields) {
      log('warn', event, fields);
    },
    error(event, fields) {
      log('error', event, fields);
    },
  };
}
