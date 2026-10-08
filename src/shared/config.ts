// TEMPORARY placeholder so the app can start.
// Module 0 task: replace this file with a validated loader (see the Module 0 doc).
// This is the only file allowed to read process.env.
export const config = {
  port: Number(process.env.PORT ?? 3000),
  logLevel: process.env.LOG_LEVEL ?? 'info',
};
