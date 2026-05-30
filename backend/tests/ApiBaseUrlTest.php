<?php
use PHPUnit\Framework\TestCase;

if (!defined('IS_TEST')) {
    define('IS_TEST', true);
}

require_once __DIR__ . '/../index.php';

class ApiBaseUrlTest extends TestCase {

    public function testApiBaseUrlWithHttpsOn() {
        $_SERVER['HTTPS'] = 'on';
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('https://api.example.com', apiBaseUrl());
    }

    public function testApiBaseUrlWithHttpsTrue() {
        $_SERVER['HTTPS'] = '1';
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('https://api.example.com', apiBaseUrl());
    }

    public function testApiBaseUrlWithHttpsOff() {
        $_SERVER['HTTPS'] = 'off';
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('http://api.example.com', apiBaseUrl());
    }

    public function testApiBaseUrlWithoutHttps() {
        unset($_SERVER['HTTPS']);
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('http://api.example.com', apiBaseUrl());
    }

    public function testApiBaseUrlWithoutHttpHost() {
        unset($_SERVER['HTTPS']);
        unset($_SERVER['HTTP_HOST']);
        $this->assertEquals('http://localhost:8000', apiBaseUrl());
    }

    public function testApiBaseUrlWithHttpsEmptyString() {
        $_SERVER['HTTPS'] = '';
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('http://api.example.com', apiBaseUrl());
    }
}
