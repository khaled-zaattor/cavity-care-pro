<?php

namespace App\Support;

/**
 * Small JPEG thumbnails with PHP's GD extension (available on shared hosts;
 * no extra Composer package). Returns the JPEG bytes, or null when the file
 * is not a supported image or GD fails — the upload still succeeds.
 */
final class Thumbnailer
{
    public static function make(string $sourcePath, string $mime, int $maxSide = 480): ?string
    {
        if (! extension_loaded('gd')) {
            return null;
        }

        $img = match ($mime) {
            'image/jpeg' => @imagecreatefromjpeg($sourcePath),
            'image/png' => @imagecreatefrompng($sourcePath),
            'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($sourcePath) : false,
            default => false,
        };
        if (! $img) {
            return null;
        }

        // Phone photos: honour the EXIF orientation so x-ray photos are not sideways.
        if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
            $exif = @exif_read_data($sourcePath);
            $angle = match ((int) ($exif['Orientation'] ?? 1)) {
                3 => 180, 6 => -90, 8 => 90, default => 0,
            };
            if ($angle !== 0) {
                $rotated = imagerotate($img, $angle, 0);
                if ($rotated) {
                    imagedestroy($img);
                    $img = $rotated;
                }
            }
        }

        $w = imagesx($img);
        $h = imagesy($img);
        $scale = min(1, $maxSide / max($w, $h));
        $tw = max(1, (int) round($w * $scale));
        $th = max(1, (int) round($h * $scale));

        $thumb = imagecreatetruecolor($tw, $th);
        imagefill($thumb, 0, 0, imagecolorallocate($thumb, 255, 255, 255)); // flatten transparency
        imagecopyresampled($thumb, $img, 0, 0, 0, 0, $tw, $th, $w, $h);

        ob_start();
        imagejpeg($thumb, null, 80);
        $bytes = ob_get_clean();

        imagedestroy($img);
        imagedestroy($thumb);

        return $bytes ?: null;
    }
}
