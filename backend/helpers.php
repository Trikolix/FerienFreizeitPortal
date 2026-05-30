<?php

function appBaseUrl() {
    return rtrim(getenv('APP_BASE_URL') ?: 'http://localhost:5173', '/');
}

function apiBaseUrl() {
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost:8000';
    return $scheme . '://' . $host;
}
