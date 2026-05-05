/**
 * Minimal structured logger.
 * Every line is prefixed with an ISO timestamp and a level tag.
 * Railway / Render capture stdout/stderr automatically.
 */

function timestamp() {
  return new Date().toISOString();
}

function fmt(level, msg, extra) {
  const base = `[${timestamp()}] [${level}] ${msg}`;
  if (extra === undefined) return base;
  if (extra instanceof Error) return `${base}\n  ${extra.stack}`;
  if (typeof extra === "object") return `${base} ${JSON.stringify(extra)}`;
  return `${base} ${extra}`;
}

const logger = {
  info: (msg, extra) => console.log(fmt("INFO ", msg, extra)),
  warn: (msg, extra) => console.warn(fmt("WARN ", msg, extra)),
  error: (msg, extra) => console.error(fmt("ERROR", msg, extra)),
};

module.exports = logger;
