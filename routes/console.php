<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('catalog:import-wikipedia', function (): int {
    foreach (range(1900, 2020, 10) as $decade) {
        $this->info("Importing {$decade}s movies…");
        $items = Http::acceptJson()->withOptions(['verify' => config('services.catalog.ca_bundle')])->connectTimeout(5)->timeout(45)
            ->get("https://raw.githubusercontent.com/servant-42/wikipedia-movie-data/master/movies-{$decade}s.json")
            ->throw()->json();
        if (! is_array($items) || ! array_is_list($items) || $items === []) {
            $this->error('Invalid Wikipedia dataset. Existing movies have been preserved.');

            return 1;
        }
        $rows = [];
        foreach ($items as $item) {
            if (! is_array($item) || empty($item['title']) || empty($item['year'])) {
                continue;
            }
            $genres = array_values(array_unique(array_map(fn (string $genre): string => match ($genre) {
                'Science Fiction', 'Science fiction', 'Science-Fiction' => 'Sci-Fi',
                'Animated' => 'Animation',
                default => $genre,
            }, $item['genres'] ?? [])));
            $id = 'wiki:'.substr(hash('sha256', $item['title'].'|'.$item['year']), 0, 24);
            $image = $item['thumbnail'] ?? null;
            $details = [
                'id' => $id, 'title' => $item['title'], 'year' => (string) $item['year'], 'type' => 'Movies',
                'genre' => $genres[0] ?? 'Movie', 'genres' => $genres, 'rating' => '—',
                'image' => is_string($image) && preg_match('~^https://upload\.wikimedia\.org/[^\s]+$~', $image) ? $image : null,
                'description' => $item['extract'] ?? 'No synopsis is available for this title yet.',
                'source_url' => 'https://en.wikipedia.org/wiki/'.rawurlencode($item['href'] ?? str_replace(' ', '_', $item['title'])),
            ];
            $rows[] = ['id' => $id, 'title' => $item['title'], 'year' => $item['year'],
                'genres' => json_encode($genres), 'details' => json_encode($details)];
        }
        DB::transaction(function () use ($rows): void {
            foreach (array_chunk($rows, 100) as $chunk) {
                DB::table('catalog_movies')->upsert($chunk, ['id'], ['title', 'year', 'genres', 'details']);
            }
        });
    }
    $this->info(DB::table('catalog_movies')->count().' Wikipedia movies ready.');

    return 0;
})->purpose('Import the public Wikipedia movie dataset without API credentials');
