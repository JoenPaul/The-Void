<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('viewer_profiles', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            $table->string('name', 24);
            $table->string('name_key', 72)->unique();
            $table->string('avatar', 16)->default('violet');
            $table->timestamps();
        });

        Schema::create('watchlist_entries', function (Blueprint $table) {
            $table->id();
            $table->string('profile_id', 64);
            $table->string('title_key', 40);
            $table->json('details');
            $table->timestamps();
            $table->foreign('profile_id')->references('id')->on('viewer_profiles')->cascadeOnDelete();
            $table->unique(['profile_id', 'title_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watchlist_entries');
        Schema::dropIfExists('viewer_profiles');
    }
};
