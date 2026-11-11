/**
 * Structured Application Logger
 */
const LEVELS = {
  DEBUG: 'DEBUG',
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR'
};

function formatMessage(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaString = Object.keys(meta).length > 0 ? ` | ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaString}`;
}

const logger = {
  debug: (message, meta) => {
    if (process.env.NODE_ENV !== 'production' || process.env.DEBUG) {
      console.debug(formatMessage(LEVELS.DEBUG, message, meta));
    }
  },
  info: (message, meta) => {
    console.info(formatMessage(LEVELS.INFO, message, meta));
  },
  warn: (message, meta) => {
    console.warn(formatMessage(LEVELS.WARN, message, meta));
  },
  error: (message, meta) => {
    console.error(formatMessage(LEVELS.ERROR, message, meta));
  }
};

module.exports = logger;

