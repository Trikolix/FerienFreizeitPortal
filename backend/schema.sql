CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'club')),
    club_name TEXT,
    contact_info TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS camps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    age_from INTEGER,
    age_to INTEGER,
    description TEXT,
    location_lat REAL,
    location_lng REAL,
    type TEXT,
    period TEXT,
    cost TEXT,
    accessibility TEXT,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY(club_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS camp_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camp_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE
);
