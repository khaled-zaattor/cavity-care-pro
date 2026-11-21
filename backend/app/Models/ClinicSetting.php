<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Key → value clinic settings (printed header: name, address, phone, logo). */
class ClinicSetting extends Model
{
    protected $primaryKey = 'key';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = ['key', 'value'];

    public const KEYS = ['clinic_name', 'clinic_name_en', 'clinic_address', 'clinic_phone', 'prescription_footer', 'logo_path'];

    /** @return array<string, ?string> */
    public static function all_values(): array
    {
        $stored = static::query()->pluck('value', 'key')->all();

        return array_merge(array_fill_keys(self::KEYS, null), array_intersect_key($stored, array_flip(self::KEYS)));
    }

    public static function put(string $key, ?string $value): void
    {
        static::query()->updateOrCreate(['key' => $key], ['value' => $value]);
    }
}
