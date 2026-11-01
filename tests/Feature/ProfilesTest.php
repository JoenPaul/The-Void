<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfilesTest extends TestCase
{
    use RefreshDatabase;

    public function test_profiles_can_be_created_and_renamed_without_login(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon'])->assertCreated();
        $this->putJson('/profiles/alex', ['name' => 'Alexandra', 'avatar' => 'star'])->assertOk();
        $this->getJson('/profiles')->assertOk()->assertJsonCount(1, 'profiles')
            ->assertJsonPath('profiles.0.name', 'Alexandra')->assertJsonPath('profiles.0.avatar', 'star');
    }

    public function test_duplicate_and_blank_names_and_invalid_avatars_are_rejected(): void
    {
        $this->putJson('/profiles/one', ['name' => 'Alex', 'avatar' => 'violet'])->assertCreated();
        $this->putJson('/profiles/two', ['name' => '  alex  ', 'avatar' => 'violet'])->assertUnprocessable();
        $this->putJson('/profiles/two', ['name' => ' ', 'avatar' => '<script>'])->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'avatar']);
        $this->assertDatabaseCount('viewer_profiles', 1);
    }

    public function test_six_profile_limit_still_allows_editing(): void
    {
        foreach (range(1, 6) as $number) {
            $this->putJson('/profiles/profile-'.$number, ['name' => 'Profile '.$number, 'avatar' => 'violet'])->assertCreated();
        }
        $this->putJson('/profiles/seven', ['name' => 'Seventh', 'avatar' => 'violet'])->assertUnprocessable();
        $this->putJson('/profiles/profile-1', ['name' => 'Renamed', 'avatar' => 'orbit'])->assertOk();
    }

    public function test_watchlists_persist_across_sessions_and_are_separate_for_each_profile(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon']);
        $this->putJson('/profiles/guest', ['name' => 'Guest', 'avatar' => 'star']);
        $this->putJson('/profiles/alex/watchlist/movie:42', $this->title())->assertOk();
        $this->flushSession();
        $this->getJson('/profiles/alex/watchlist')->assertOk()->assertJsonPath('titles.0.id', 'movie:42');
        $this->getJson('/profiles/guest/watchlist')->assertOk()->assertJsonCount(0, 'titles');
    }

    public function test_repeated_saves_do_not_duplicate_and_removal_only_affects_selected_profile(): void
    {
        foreach (['alex', 'guest'] as $id) {
            $this->putJson('/profiles/'.$id, ['name' => $id, 'avatar' => 'violet']);
            $this->putJson('/profiles/'.$id.'/watchlist/movie:42', $this->title())->assertOk();
        }
        $this->putJson('/profiles/alex/watchlist/movie:42', $this->title())->assertOk();
        $this->assertDatabaseCount('watchlist_entries', 2);
        $this->deleteJson('/profiles/alex/watchlist/movie:42')->assertOk();
        $this->deleteJson('/profiles/alex/watchlist/movie:42')->assertOk();
        $this->getJson('/profiles/guest/watchlist')->assertJsonCount(1, 'titles');
        $this->getJson('/profiles/alex/watchlist')->assertJsonCount(0, 'titles');
    }

    public function test_invalid_titles_do_not_create_records(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'violet']);
        $this->putJson('/profiles/alex/watchlist/movie:42', [...$this->title(), 'image' => 'javascript:alert(1)'])
            ->assertUnprocessable()->assertJsonValidationErrors('image');
        $this->putJson('/profiles/alex/watchlist/tv:42', $this->title())->assertUnprocessable();
        $this->putJson('/profiles/missing/watchlist/movie:42', $this->title())->assertNotFound();
        $this->assertDatabaseCount('watchlist_entries', 0);
    }

    public function test_wikipedia_and_tvmaze_titles_keep_source_credits_after_saving(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon']);
        foreach ([['wiki:'.str_repeat('a', 24), 'Movies', 'upload.wikimedia.org', 'https://en.wikipedia.org/wiki/Example'],
            ['tvmaze:42', 'Series', 'static.tvmaze.com', 'https://www.tvmaze.com/shows/42'],
            ['movie:42', 'Movies', 'image.tmdb.org', 'https://www.themoviedb.org/movie/42']] as [$id, $type, $host, $source]) {
            $this->putJson('/profiles/alex/watchlist/'.$id, [...$this->title(), 'type' => $type,
                'genres' => [], 'image' => 'https://'.$host.'/poster.jpg', 'source_url' => $source])->assertOk();
        }
        $this->flushSession();
        $this->getJson('/profiles/alex/watchlist')->assertJsonCount(3, 'titles')
            ->assertJsonPath('titles.0.source_url', 'https://en.wikipedia.org/wiki/Example');
        $this->putJson('/profiles/alex/watchlist/tvmaze:42', $this->title())->assertUnprocessable();
    }

    /** @return array<string, mixed> */
    private function title(): array
    {
        return ['title' => 'A movie', 'year' => '2024', 'type' => 'Movies', 'genre' => 'Drama',
            'genres' => ['Drama'], 'rating' => '8.0', 'image' => null, 'description' => 'A story.'];
    }
}
