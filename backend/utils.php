<?php

function configValue($config, $key, $default) {
    $envValue = getenv($key);
    if ($envValue !== false && $envValue !== '') {
        return $envValue;
    }

    return $config[$key] ?? $default;
}
