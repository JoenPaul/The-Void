<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Artisan::command('superadmin:configure {--generate : Generate a temporary PIN}', function (): void {
    if (! app()->environment('local')) { $this->error('Local environments only.'); return; }
    $pin = $this->option('generate') ? (string) random_int(10000000, 99999999) : $this->secret('New superadmin PIN (6–12 digits)');
    if (! is_string($pin) || ! preg_match('/^[0-9]{6,12}$/', $pin)) { $this->error('Use 6–12 digits.'); return; }
    \Illuminate\Support\Facades\DB::table('superadmin_credentials')->updateOrInsert(['id' => 1], ['pin_hash' => \Illuminate\Support\Facades\Hash::make($pin)]);
    $this->info('Local superadmin PIN configured.');
    if ($this->option('generate')) { $this->line('Temporary PIN: '.$pin); }
})->purpose('Set the local superadmin PIN');
