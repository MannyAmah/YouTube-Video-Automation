const { Database } = require('./db');

(async () => {
  try {
    const db = new Database();
    await db.initialize();
    await db.close();
    console.log('Database initialized successfully.');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
})();
