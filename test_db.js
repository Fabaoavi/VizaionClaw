const DB = require('better-sqlite3');
try {
    const db = new DB('data/users.db');
    console.log('USERS:');
    console.dir(db.prepare('SELECT * FROM users LIMIT 3').all(), { depth: null });
    console.log('TASKS:');
    console.dir(db.prepare('SELECT * FROM tasks LIMIT 5').all(), { depth: null });
} catch (e) {
    console.error("ERROR:", e);
}
