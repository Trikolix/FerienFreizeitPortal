<?php
namespace {
    use PHPUnit\Framework\TestCase;

    // Include helpers.
    require_once __DIR__ . '/../helpers.php';

    class JsonResponseTest extends TestCase {

        /**
         * @runInSeparateProcess
         * @preserveGlobalState disabled
         */
        public function testJsonResponseOutputAndStatus() {
            $data = ['status' => 'ok', 'unicode' => 'äöü'];

            ob_start();
            jsonResponse($data, 404, false); // shouldExit = false
            $output = ob_get_clean();

            $expectedJson = json_encode($data, JSON_UNESCAPED_UNICODE);

            $this->assertEquals($expectedJson, $output);
            $this->assertEquals(404, http_response_code());
        }

        /**
         * @runInSeparateProcess
         * @preserveGlobalState disabled
         */
        public function testJsonResponseDefaultStatus() {
            $data = ['message' => 'success'];

            ob_start();
            jsonResponse($data, 200, false);
            $output = ob_get_clean();

            $expectedJson = json_encode($data, JSON_UNESCAPED_UNICODE);

            $this->assertEquals($expectedJson, $output);
            $this->assertEquals(200, http_response_code());
        }
    }
}
