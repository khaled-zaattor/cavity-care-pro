<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

/**
 * A patient document (x-ray, lab test, report, photo…).
 * Patients' medical files are shared clinical history (like patients
 * themselves); money stays private, files do not.
 */
class PatientFile extends Model
{
    use HasUuids, SoftDeletes;

    public const CATEGORIES = ['xray', 'radiology', 'lab_test', 'report', 'photo', 'prescription_scan', 'other'];

    public const CATEGORY_LABELS = [
        'xray' => 'صورة أشعة',
        'radiology' => 'تصوير شعاعي (بانوراما/طبقي)',
        'lab_test' => 'تحليل مخبري',
        'report' => 'تقرير طبي',
        'photo' => 'صورة',
        'prescription_scan' => 'وصفة خارجية',
        'other' => 'ملف آخر',
    ];

    protected $fillable = [
        'patient_id', 'appointment_id', 'doctor_id', 'specialty_id', 'uploaded_by', 'category', 'title',
        'taken_at', 'notes', 'disk', 'path', 'thumbnail_path', 'original_name', 'mime', 'size',
    ];

    /** Storage paths are internal. */
    protected $hidden = ['disk', 'path', 'thumbnail_path'];

    protected $appends = ['is_image', 'has_thumbnail'];

    protected function casts(): array
    {
        return ['taken_at' => 'date:Y-m-d', 'size' => 'integer'];
    }

    public function getIsImageAttribute(): bool
    {
        return str_starts_with((string) $this->mime, 'image/');
    }

    public function getHasThumbnailAttribute(): bool
    {
        return ! empty($this->thumbnail_path);
    }

    public function patient(): BelongsTo
    {
        return $this->belongsTo(Patient::class);
    }

    public function doctor(): BelongsTo
    {
        return $this->belongsTo(Doctor::class);
    }

    public function specialty(): BelongsTo
    {
        return $this->belongsTo(Specialty::class);
    }

    public function uploader(): BelongsTo
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
