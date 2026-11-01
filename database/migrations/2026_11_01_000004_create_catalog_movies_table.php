<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('catalog_movies', function (Blueprint $table) {
            $table->string('id', 40)->primary();
            $table->string('title', 500);
            $table->unsignedSmallInteger('year')->index();
            $table->json('genres');
            $table->json('details');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('catalog_movies');
    }
};
