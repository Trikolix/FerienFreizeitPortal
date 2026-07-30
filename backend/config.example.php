<?php

return [
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
];
