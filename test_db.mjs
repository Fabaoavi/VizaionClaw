import DB from 'better-sqlite3';

try {
    const db = new DB('data/users.db');
    console.log('USERS:', db.prepare('SELECT id, display_name, telegram_id FROM users LIMIT 5').all());

    try {
        console.log('TASKS:', db.prepare('SELECT id, user_id, title, assignee_id FROM tasks LIMIT 5').all());
    } catch (err) {
        console.log('TASKS TABLE ERROR:', err.message);
    }
} catch (e) {
    console.error("ERROR:", e);
}
