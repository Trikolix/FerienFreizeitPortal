<?php
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../utils.php';

class ConfigValueTest extends TestCase {

    protected function setUp(): void {
        parent::setUp();
        // Clear environment variables before each test
        putenv('TEST_VAR_1');
        putenv('TEST_VAR_2');
        putenv('TEST_VAR_3');
        putenv('TEST_VAR_4');
    }

    protected function tearDown(): void {
        parent::tearDown();
        // Clean up environment variables after each test
        putenv('TEST_VAR_1');
        putenv('TEST_VAR_2');
        putenv('TEST_VAR_3');
        putenv('TEST_VAR_4');
    }

    public function testConfigValueReturnsEnvVariable() {
        putenv('TEST_VAR_1=env_value');
        $config = ['TEST_VAR_1' => 'config_value'];
        $default = 'default_value';

        $result = configValue($config, 'TEST_VAR_1', $default);
        $this->assertEquals('env_value', $result);
    }

    public function testConfigValueReturnsConfigVariable() {
        // Environment variable not set
        $config = ['TEST_VAR_2' => 'config_value'];
        $default = 'default_value';

        $result = configValue($config, 'TEST_VAR_2', $default);
        $this->assertEquals('config_value', $result);
    }

    public function testConfigValueReturnsDefaultVariable() {
        // Environment variable and config variable not set
        $config = [];
        $default = 'default_value';

        $result = configValue($config, 'TEST_VAR_3', $default);
        $this->assertEquals('default_value', $result);
    }

    public function testConfigValueHandlesEmptyEnvString() {
        // Empty string in env should fall back to config or default
        putenv('TEST_VAR_4=');

        $config = ['TEST_VAR_4' => 'config_value'];
        $default = 'default_value';

        $result = configValue($config, 'TEST_VAR_4', $default);
        $this->assertEquals('config_value', $result);

        // If config is also empty/missing, it falls back to default
        $config2 = [];
        $result2 = configValue($config2, 'TEST_VAR_4', $default);
        $this->assertEquals('default_value', $result2);
    }
}
