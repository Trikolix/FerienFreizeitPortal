<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../helpers.php';

class HelpersTest extends TestCase {
    private array $originalServer;

    protected function setUp(): void {
        // Save original $_SERVER
        $this->originalServer = $_SERVER;
    }

    protected function tearDown(): void {
        putenv('APP_BASE_URL'); // Unset env var after each test
        // Restore original $_SERVER
        $_SERVER = $this->originalServer;
    }

    public function testAppBaseUrlDefault() {
        $this->assertEquals('http://localhost:5173', appBaseUrl());
    }

    public function testAppBaseUrlFromEnv() {
        putenv('APP_BASE_URL=https://my-app.example.com');
        $this->assertEquals('https://my-app.example.com', appBaseUrl());
    }

    public function testAppBaseUrlStripsTrailingSlash() {
        putenv('APP_BASE_URL=https://my-app.example.com/');
        $this->assertEquals('https://my-app.example.com', appBaseUrl());

        putenv('APP_BASE_URL=https://my-app.example.com///');
        $this->assertEquals('https://my-app.example.com', appBaseUrl());
    }

    public function testApiBaseUrlDefault() {
        unset($_SERVER['HTTPS']);
        unset($_SERVER['HTTP_HOST']);
        $this->assertEquals('http://localhost:8000', apiBaseUrl());
    }

    public function testApiBaseUrlHttpsOn() {
        $_SERVER['HTTPS'] = 'on';
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('https://api.example.com', apiBaseUrl());
    }

    public function testApiBaseUrlHttpsOff() {
        $_SERVER['HTTPS'] = 'off';
        $_SERVER['HTTP_HOST'] = 'api.example.com';
        $this->assertEquals('http://api.example.com', apiBaseUrl());
    }

    public function testApiBaseUrlWithHostOnly() {
        unset($_SERVER['HTTPS']);
        $_SERVER['HTTP_HOST'] = 'localhost:9000';
        $this->assertEquals('http://localhost:9000', apiBaseUrl());
    }
}
