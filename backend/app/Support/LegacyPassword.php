<?php

namespace App\Support;

/**
 * Supabase (GoTrue, Go's bcrypt) stores hashes as "$2a$10$...".
 * PHP's password_verify() accepts them, but Laravel's bcrypt hasher refuses
 * any hash that password_get_info() does not report as "bcrypt", and PHP only
 * reports "$2y$" as such. Go's $2a$ output is byte-identical in meaning to
 * PHP's $2y$ (both are the correct, non-buggy bcrypt), so the prefix is
 * rewritten once during the import and users keep their passwords.
 */
final class LegacyPassword
{
    public static function normalize(string $hash): string
    {
        if (str_starts_with($hash, '$2a$') || str_starts_with($hash, '$2b$')) {
            return '$2y$'.substr($hash, 4);
        }

        return $hash;
    }
}
