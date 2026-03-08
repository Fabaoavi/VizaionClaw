import DB from 'better-sqlite3';

try {
    const db = new DB('data/users.db');
    console.log("Adding column...");
    try {
        db.exec('ALTER TABLE tasks ADD COLUMN assignee_id TEXT;');
        console.log("Column added.");
    } catch (err) {
        console.log("ERROR adding column (may already exist):", err.message);
    }
} catch (e) {
    console.error("ERROR:", e);
}
