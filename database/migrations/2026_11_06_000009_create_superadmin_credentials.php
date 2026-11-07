<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
return new class extends Migration {
    public function up(): void { Schema::create('superadmin_credentials', function (Blueprint $table): void { $table->unsignedInteger('id')->primary(); $table->string('pin_hash'); }); }
    public function down(): void { Schema::dropIfExists('superadmin_credentials'); }
};
