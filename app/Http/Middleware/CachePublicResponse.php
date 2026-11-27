<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Marks successful, non-personalized GET responses as cacheable by shared
 * caches (Vercel / Cloudflare CDN) so repeat requests never reach PHP.
 */
class CachePublicResponse
{
    public function handle(Request $request, Closure $next, int $edgeSeconds = 300, int $browserSeconds = 60): Response
    {
        $response = $next($request);

        if (! $request->isMethodCacheable() || $response->getStatusCode() !== 200) {
            return $response;
        }

        $directives = sprintf('public, max-age=%d, s-maxage=%d, stale-while-revalidate=%d', $browserSeconds, $edgeSeconds, $edgeSeconds);

        $response->headers->set('Cache-Control', $directives);
        $response->headers->set('CDN-Cache-Control', sprintf('public, s-maxage=%d, stale-while-revalidate=%d', $edgeSeconds, $edgeSeconds));
        $response->headers->set('Vary', 'Accept, Accept-Encoding');
        $response->headers->remove('Set-Cookie');

        return $response;
    }
}
