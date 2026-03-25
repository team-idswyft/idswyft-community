import winston from 'winston';

const nodeEnv = process.env.NODE_ENV || 'development';

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${metaStr}`;
  })
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'idswyft-engine',
    environment: nodeEnv,
  },
  transports: [
    new winston.transports.Console({
      format: nodeEnv === 'development' ? consoleFormat : logFormat,
    }),
  ],
});

export const logVerificationEvent = (event: string, verificationId: string, meta: any = {}) => {
  logger.info(`Verification ${event}`, { event, verificationId, ...meta });
};

export default logger;
