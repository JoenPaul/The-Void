<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class WatchHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_history_persists_across_sessions_and_is_scoped_to_each_profile(): void
    {
        $this->profile('alex');
        $this->profile('guest');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:42', $this->entry())->assertOk()->assertJsonPath('entry.position', 120);
        $this->flushSession();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/alex/history')->assertOk()->assertJsonCount(1, 'entries')->assertJsonPath('entries.0.title', 'A movie');
        $this->postJson('/profiles/guest/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/guest/history')->assertOk()->assertJsonCount(0, 'entries');
        $this->assertDatabaseCount('watchlist_entries', 0);
    }

    public function test_rewatching_updates_one_record_and_moves_it_to_the_front(): void
    {
        $this->profile('alex');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:42', $this->entry())->assertOk();
        $this->travel(1)->minutes();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:43', [...$this->entry(), 'title' => 'Another movie'])->assertOk();
        $this->travel(1)->minutes();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:42', [...$this->entry(), 'position' => 950, 'finished' => true])->assertOk();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/alex/history')->assertJsonCount(2, 'entries')
            ->assertJsonPath('entries.0.id', 'movie:42')->assertJsonPath('entries.0.finished', true);
        $this->assertDatabaseCount('watch_history', 2);
    }

    public function test_series_history_keeps_the_last_episode_and_validates_progress(): void
    {
        $this->profile('alex');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/tv:42', [...$this->entry(), 'type' => 'Series', 'season' => 2, 'episode' => 3])
            ->assertOk()->assertJsonPath('entry.season', 2)->assertJsonPath('entry.episode', 3);
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:43', [...$this->entry(), 'position' => 0])->assertUnprocessable();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:43', [...$this->entry(), 'position' => 1200])->assertUnprocessable();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/tv:43', [...$this->entry(), 'type' => 'Series', 'season' => -1, 'episode' => 0])->assertUnprocessable();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:43', [...$this->entry(), 'image' => 'javascript:alert(1)'])->assertUnprocessable();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/tv:43', $this->entry())->assertUnprocessable();
        $this->putJson('/profiles/missing/history/movie:43', $this->entry())->assertNotFound();
        $this->assertDatabaseCount('watch_history', 1);
    }

    public function test_retention_keeps_one_hundred_titles_and_does_not_touch_other_profiles_or_watchlists(): void
    {
        $this->profile('alex');
        $this->profile('guest');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/movie:1', $this->entry())->assertOk();
        $this->postJson('/profiles/guest/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/guest/history/movie:1', $this->entry())->assertOk();
        foreach (range(1, 100) as $id) {
            DB::table('watch_history')->insert(['profile_id' => 'alex', 'title_key' => 'movie:'.$id,
                'details' => json_encode(['id' => 'movie:'.$id, ...$this->entry()]), 'position' => 120,
                'duration' => 1000, 'finished' => false, 'watched_at' => now()->subDays(101 - $id)]);
        }
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:101', $this->entry())->assertOk();
        $this->assertSame(100, DB::table('watch_history')->where('profile_id', 'alex')->count());
        $this->assertDatabaseMissing('watch_history', ['profile_id' => 'alex', 'title_key' => 'movie:1']);
        $this->assertDatabaseHas('watch_history', ['profile_id' => 'guest', 'title_key' => 'movie:1']);
        $this->assertDatabaseCount('watchlist_entries', 1);
    }

    private function profile(string $id): void
    {
        $this->putJson('/profiles/'.$id, ['name' => $id, 'avatar' => 'violet', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
    }

    /** @return array<string, mixed> */
    private function entry(): array
    {
        return ['title' => 'A movie', 'year' => '2026', 'type' => 'Movies', 'genre' => 'Drama', 'genres' => [],
            'rating' => '8.0', 'image' => null, 'description' => 'A story.', 'position' => 120, 'duration' => 1000, 'finished' => false];
    }
}
