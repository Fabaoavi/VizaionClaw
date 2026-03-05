import Database from "better-sqlite3";
const db = new Database("data/users.db");
try {
    db.exec(`
        CREATE INDEX IF NOT EXISTS idx_pending_users_status ON pending_users(status);

        CREATE TABLE IF NOT EXISTS system_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            level TEXT NOT NULL CHECK(level IN ('info', 'warn', 'error')),
            message TEXT NOT NULL,
            metadata TEXT,
            created_at TEXT DEFAULT (datetime('now'))
        );
        CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at);
  `);
    console.log("Success");
} catch (e) {
    console.error("Error:", e);
}
