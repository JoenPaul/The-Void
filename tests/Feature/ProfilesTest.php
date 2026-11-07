<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfilesTest extends TestCase
{
    use RefreshDatabase;

    public function test_profiles_can_be_created_and_renamed_after_pin_login(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex', ['name' => 'Alexandra', 'avatar' => 'star', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertOk();
        $this->getJson('/profiles')->assertOk()->assertJsonCount(1, 'profiles')
            ->assertJsonPath('profiles.0.name', 'Alexandra')->assertJsonPath('profiles.0.avatar', 'star');
    }

    public function test_archiving_hides_a_profile_and_preserves_its_saved_data(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->putJson('/profiles/guest', ['name' => 'Guest', 'avatar' => 'star', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/movie:42', $this->title())->assertOk();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/history/movie:42', [...$this->title(), 'position' => 60, 'duration' => 600, 'finished' => false])->assertOk();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->loginAdmin();
        $this->putJson('/superadmin/profiles/alex/archive', ['archived' => true])->assertOk()->assertJsonPath('archived', true);
        $this->assertDatabaseMissing('viewer_profiles', ['id' => 'alex', 'deleted_at' => null]);
        $this->assertDatabaseHas('viewer_profiles', ['id' => 'alex', 'name' => 'Alex']);
        $this->assertDatabaseHas('watchlist_entries', ['profile_id' => 'alex', 'title_key' => 'movie:42']);
        $this->assertDatabaseHas('watch_history', ['profile_id' => 'alex', 'position' => 60]);
        $this->getJson('/profiles')->assertJsonCount(1, 'profiles')->assertJsonPath('profiles.0.id', 'guest')->assertJsonPath('archived_ids.0', 'alex');
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertNotFound();
        $this->getJson('/profiles/alex/watchlist')->assertNotFound();
        $this->putJson('/profiles/alex/watchlist/movie:42', $this->title())->assertNotFound();
        $this->deleteJson('/profiles/alex/watchlist/movie:42')->assertNotFound();
        $this->getJson('/profiles/alex/history')->assertNotFound();
        $this->putJson('/profiles/alex/history/movie:42', [...$this->title(), 'position' => 65, 'duration' => 600, 'finished' => false])->assertNotFound();
        $this->deleteJson('/profiles/alex')->assertStatus(405);
    }

    public function test_the_last_profile_cannot_be_archived_and_new_profiles_can_be_added_after_archiving(): void
    {
        $this->putJson('/profiles/one', ['name' => 'One', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->postJson('/profiles/one/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->loginAdmin();
        $this->putJson('/superadmin/profiles/one/archive', ['archived' => true])->assertUnprocessable()->assertJsonValidationErrors('profile');
        $this->putJson('/superadmin/profiles/missing/archive', ['archived' => true])->assertNotFound();
        foreach (range(2, 6) as $number) {
            $this->putJson('/profiles/profile-'.$number, ['name' => 'Profile '.$number, 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        }
        $this->postJson('/profiles/one/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/superadmin/profiles/one/archive', ['archived' => true])->assertOk();
        $this->putJson('/profiles/seven', ['name' => 'Seven', 'avatar' => 'star', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->getJson('/profiles')->assertJsonCount(6, 'profiles');
    }

    public function test_duplicate_and_blank_names_and_invalid_avatars_are_rejected(): void
    {
        $this->putJson('/profiles/one', ['name' => 'Alex', 'avatar' => 'violet', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        $this->putJson('/profiles/two', ['name' => '  alex  ', 'avatar' => 'violet', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertUnprocessable();
        $this->putJson('/profiles/two', ['name' => ' ', 'avatar' => '<script>', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertUnprocessable()
            ->assertJsonValidationErrors(['name', 'avatar']);
        $this->assertDatabaseCount('viewer_profiles', 1);
    }

    public function test_more_than_six_profiles_can_be_created_and_edited(): void
    {
        foreach (range(1, 12) as $number) {
            $this->putJson('/profiles/profile-'.$number, ['name' => 'Profile '.$number, 'avatar' => 'violet', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertCreated();
        }
        $this->postJson('/profiles/profile-1/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/profile-1', ['name' => 'Renamed', 'avatar' => 'orbit', 'pin' => '4567', 'pin_confirmation' => '4567'])->assertOk();
        $this->getJson('/profiles')->assertOk()->assertJsonCount(12, 'profiles');
        $this->assertDatabaseHas('viewer_profiles', ['id' => 'profile-1', 'name' => 'Renamed', 'avatar' => 'orbit']);
    }

    public function test_watchlists_persist_across_sessions_and_are_separate_for_each_profile(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567']);
        $this->putJson('/profiles/guest', ['name' => 'Guest', 'avatar' => 'star', 'pin' => '4567', 'pin_confirmation' => '4567']);
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/movie:42', $this->title())->assertOk();
        $this->flushSession();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/alex/watchlist')->assertOk()->assertJsonPath('titles.0.id', 'movie:42');
        $this->postJson('/profiles/guest/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/guest/watchlist')->assertOk()->assertJsonCount(0, 'titles');
    }

    public function test_repeated_saves_do_not_duplicate_and_removal_only_affects_selected_profile(): void
    {
        foreach (['alex', 'guest'] as $id) {
            $this->putJson('/profiles/'.$id, ['name' => $id, 'avatar' => 'violet', 'pin' => '4567', 'pin_confirmation' => '4567']);
            $this->postJson('/profiles/'.$id.'/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
            $this->putJson('/profiles/'.$id.'/watchlist/movie:42', $this->title())->assertOk();
        }
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/movie:42', $this->title())->assertOk();
        $this->assertDatabaseCount('watchlist_entries', 2);
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->deleteJson('/profiles/alex/watchlist/movie:42')->assertOk();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->deleteJson('/profiles/alex/watchlist/movie:42')->assertOk();
        $this->postJson('/profiles/guest/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/guest/watchlist')->assertJsonCount(1, 'titles');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/alex/watchlist')->assertJsonCount(0, 'titles');
    }

    public function test_invalid_titles_do_not_create_records(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'violet', 'pin' => '4567', 'pin_confirmation' => '4567']);
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/movie:42', [...$this->title(), 'image' => 'javascript:alert(1)'])
            ->assertUnprocessable()->assertJsonValidationErrors('image');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/tv:42', $this->title())->assertUnprocessable();
        $this->putJson('/profiles/missing/watchlist/movie:42', $this->title())->assertNotFound();
        $this->assertDatabaseCount('watchlist_entries', 0);
    }

    public function test_wikipedia_and_tvmaze_titles_keep_source_credits_after_saving(): void
    {
        $this->putJson('/profiles/alex', ['name' => 'Alex', 'avatar' => 'moon', 'pin' => '4567', 'pin_confirmation' => '4567']);
        foreach ([['wiki:'.str_repeat('a', 24), 'Movies', 'upload.wikimedia.org', 'https://en.wikipedia.org/wiki/Example'],
            ['tvmaze:42', 'Series', 'static.tvmaze.com', 'https://www.tvmaze.com/shows/42'],
            ['movie:42', 'Movies', 'image.tmdb.org', 'https://www.themoviedb.org/movie/42']] as [$id, $type, $host, $source]) {
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
            $this->putJson('/profiles/alex/watchlist/'.$id, [...$this->title(), 'type' => $type,
                'genres' => [], 'image' => 'https://'.$host.'/poster.jpg', 'source_url' => $source])->assertOk();
        }
        $this->flushSession();
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->getJson('/profiles/alex/watchlist')->assertJsonCount(3, 'titles')
            ->assertJsonPath('titles.0.source_url', 'https://en.wikipedia.org/wiki/Example');
        $this->postJson('/profiles/alex/login', ['pin' => '4567'])->assertOk();
        $this->travel(1)->minutes();
        $this->putJson('/profiles/alex/watchlist/tvmaze:42', $this->title())->assertUnprocessable();
    }

    private function loginAdmin(): void
    {
        \Illuminate\Support\Facades\DB::table('superadmin_credentials')->updateOrInsert(['id' => 1], ['pin_hash' => \Illuminate\Support\Facades\Hash::make('654321')]);
        $this->postJson('/superadmin/login', ['pin' => '654321'])->assertOk();
    }

    /** @return array<string, mixed> */
    private function title(): array
    {
        return ['title' => 'A movie', 'year' => '2024', 'type' => 'Movies', 'genre' => 'Drama',
            'genres' => ['Drama'], 'rating' => '8.0', 'image' => null, 'description' => 'A story.'];
    }
}
