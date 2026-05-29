CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'club')),
    club_name TEXT,
    contact_info TEXT
);

CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS camps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    club_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    min_age INTEGER,
    max_age INTEGER,
    description TEXT,
    location_text TEXT,
    location_lat REAL,
    location_lng REAL,
    type TEXT,
    starts_at DATETIME,
    ends_at DATETIME,
    price_eur REAL,
    registration_deadline DATETIME,
    is_active BOOLEAN DEFAULT 1,
    FOREIGN KEY(club_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS camp_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    camp_id INTEGER NOT NULL,
    image_url TEXT NOT NULL,
    FOREIGN KEY(camp_id) REFERENCES camps(id) ON DELETE CASCADE
);
