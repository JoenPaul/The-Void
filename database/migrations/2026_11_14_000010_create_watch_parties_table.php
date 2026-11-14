<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('watch_parties', function (Blueprint $table): void {
            $table->string('code', 24)->primary();
            $table->string('host_profile_id', 64);
            $table->string('title_key', 40);
            $table->json('details');
            $table->unsignedSmallInteger('season')->nullable();
            $table->unsignedSmallInteger('episode')->nullable();
            $table->unsignedInteger('position')->default(0);
            $table->boolean('is_playing')->default(false);
            $table->timestamp('synced_at', 6);
            $table->timestamps();
            $table->foreign('host_profile_id')->references('id')->on('viewer_profiles')->cascadeOnDelete();
        });

        Schema::create('watch_party_members', function (Blueprint $table): void {
            $table->string('party_code', 24);
            $table->string('profile_id', 64);
            $table->timestamp('last_seen_at', 6);
            $table->primary(['party_code', 'profile_id']);
            $table->foreign('party_code')->references('code')->on('watch_parties')->cascadeOnDelete();
            $table->foreign('profile_id')->references('id')->on('viewer_profiles')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watch_party_members');
        Schema::dropIfExists('watch_parties');
    }
};
