<?php

function normalizeRole($role) {
    return $role === 'club' ? 'user' : $role;
}

function isAdminRole($user) {
    return in_array(normalizeRole($user['role'] ?? ''), ['master_admin', 'admin'], true);
}

function isMasterAdmin($user) {
    return normalizeRole($user['role'] ?? '') === 'master_admin';
}
