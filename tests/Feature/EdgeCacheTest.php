<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class EdgeCacheTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['services.tmdb.token' => 'private-test-token']);
        Cache::flush();
        Http::preventStrayRequests();
    }

    public function test_public_catalog_responses_are_cacheable_by_the_cdn_without_cookies(): void
    {
        Http::fake(['*' => Http::response(['results' => [], 'total_pages' => 1])]);

        $response = $this->getJson('/catalog?type=movie')->assertOk();

        $this->assertStringContainsString('public', $response->headers->get('Cache-Control'));
        $this->assertStringContainsString('s-maxage=900', $response->headers->get('Cache-Control'));
        $this->assertEmpty($response->headers->getCookies());
    }

    public function test_failed_catalog_responses_are_not_cached_by_the_cdn(): void
    {
        config(['services.tmdb.token' => '']);

        $response = $this->getJson('/catalog')->assertStatus(503);

        $this->assertStringNotContainsString('s-maxage', (string) $response->headers->get('Cache-Control'));
    }

    public function test_private_profile_endpoints_are_not_publicly_cached(): void
    {
        $response = $this->getJson('/profiles');

        $this->assertStringNotContainsString('public', (string) $response->headers->get('Cache-Control'));
    }
}
