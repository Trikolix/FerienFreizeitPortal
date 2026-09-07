<?php

return [
    'APP_ENV' => 'production',
    'APP_BASE_URL' => 'https://portal.example.org',
    'APP_KEY' => '', // Generate with: php -r "echo bin2hex(random_bytes(32));"
    'APP_LOG_DIR' => '/var/log/ferienfreizeitportal',
    'MAIL_FROM' => 'noreply@example.org',
    // Set only for the first production start, then remove these two values.
    'BOOTSTRAP_ADMIN_EMAIL' => '',
    'BOOTSTRAP_ADMIN_PASSWORD' => '',
    // Exact proxy IPs only. Leave empty for a directly reachable Apache server.
    'TRUSTED_PROXIES' => '',
    'DB_CONNECTION' => 'mysql',
    'DB_HOST' => '127.0.0.1',
    'DB_NAME' => 'westsachsen_camps',
    'DB_USER' => 'database_user',
    'DB_PASSWORD' => 'database_password',
    'SEED_DEMO_DATA' => false,
    'CONTACT_TO' => 'kontakt@westsachsen-camps.de',
    'CONTACT_SUBJECT_PREFIX' => '[Ferienfreizeitportal]',
    'CONTACT_RATE_LIMIT_MAX' => 5,
    'CONTACT_RATE_LIMIT_WINDOW_SECONDS' => 900,
    'CONTACT_MIN_SECONDS' => 3,
    'CONTACT_LOG_SALT' => 'change-this-random-contact-log-salt',
    'PLACE_REQUEST_SUBJECT_PREFIX' => '[Ferienfreizeitportal]',
    'PLACE_REQUEST_RATE_LIMIT_MAX' => 5,
    'PLACE_REQUEST_RATE_LIMIT_WINDOW_SECONDS' => 900,
    'PLACE_REQUEST_MIN_SECONDS' => 3,
    'PLACE_REQUEST_EVENT_RETENTION_DAYS' => 90,
    'PLACE_REQUEST_LOG_SALT' => 'change-this-random-place-request-log-salt',
];
