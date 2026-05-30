<?php

// Helper: send JSON response
function jsonResponse($data, $statusCode = 200, $shouldExit = true) {
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    if ($shouldExit) {
        exit();
    }
}
