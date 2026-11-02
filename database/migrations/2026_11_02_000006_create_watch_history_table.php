<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('watch_history', function (Blueprint $table) {
            $table->id();
            $table->string('profile_id', 64);
            $table->string('title_key', 40);
            $table->json('details');
            $table->unsignedInteger('position');
            $table->unsignedInteger('duration');
            $table->unsignedSmallInteger('season')->nullable();
            $table->unsignedSmallInteger('episode')->nullable();
            $table->boolean('finished')->default(false);
            $table->timestamp('watched_at', 6);
            $table->foreign('profile_id')->references('id')->on('viewer_profiles')->cascadeOnDelete();
            $table->unique(['profile_id', 'title_key']);
            $table->index(['profile_id', 'watched_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('watch_history');
    }
};
