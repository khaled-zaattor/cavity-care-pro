<?php

use App\Http\Controllers\Api\ActivityLogController;
use App\Http\Controllers\Api\AppointmentController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ClinicSettingController;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\DoctorController;
use App\Http\Controllers\Api\FinanceController;
use App\Http\Controllers\Api\MedicineController;
use App\Http\Controllers\Api\MoneyController;
use App\Http\Controllers\Api\PatientController;
use App\Http\Controllers\Api\PatientFileController;
use App\Http\Controllers\Api\PatientHistoryController;
use App\Http\Controllers\Api\PatientMedicalController;
use App\Http\Controllers\Api\PrescriptionController;
use App\Http\Controllers\Api\PrescriptionTemplateController;
use App\Http\Controllers\Api\ReportController;
use App\Http\Controllers\Api\RolePermissionController;
use App\Http\Controllers\Api\SpecialtyController;
use App\Http\Controllers\Api\TreatmentCatalogController;
use App\Http\Controllers\Api\UserAdminController;
use App\Http\Controllers\Api\WaitingListController;
use Illuminate\Support\Facades\Route;

/*
| Routes have NO "/api" prefix inside Laravel: in production Laravel's public/
| is mounted at https://domain/api, and locally Vite proxies /api -> :8000.
| So "/auth/login" here is "https://domain/api/auth/login" in the browser.
| Sanctum's CSRF route is /sanctum/csrf-cookie (=> /api/sanctum/csrf-cookie).
*/

Route::post('/auth/login', [AuthController::class, 'login'])->middleware('throttle:login');

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/auth/me', [AuthController::class, 'me']);
    Route::post('/auth/logout', [AuthController::class, 'logout']);

    // Users & permissions (super_admin)
    Route::get('/admin/users', [UserAdminController::class, 'index']);
    Route::post('/admin/users', [UserAdminController::class, 'store']);
    Route::patch('/admin/users/{user}', [UserAdminController::class, 'update']);
    Route::post('/admin/users/{user}/reset-password', [UserAdminController::class, 'resetPassword']);
    Route::get('/role-permissions', [RolePermissionController::class, 'index']);
    Route::put('/role-permissions', [RolePermissionController::class, 'update']);

    // Specialties & doctors
    Route::apiResource('specialties', SpecialtyController::class)->except('show');
    Route::apiResource('doctors', DoctorController::class);

    // Treatment catalog
    Route::get('/treatments', [TreatmentCatalogController::class, 'index']);
    Route::post('/treatments', [TreatmentCatalogController::class, 'storeTreatment']);
    Route::patch('/treatments/{treatment}', [TreatmentCatalogController::class, 'updateTreatment']);
    Route::delete('/treatments/{treatment}', [TreatmentCatalogController::class, 'destroyTreatment']);
    Route::post('/sub-treatments', [TreatmentCatalogController::class, 'storeSubTreatment']);
    Route::patch('/sub-treatments/{subTreatment}', [TreatmentCatalogController::class, 'updateSubTreatment']);
    Route::delete('/sub-treatments/{subTreatment}', [TreatmentCatalogController::class, 'destroySubTreatment']);
    Route::post('/sub-treatment-steps', [TreatmentCatalogController::class, 'storeStep']);
    Route::patch('/sub-treatment-steps/{step}', [TreatmentCatalogController::class, 'updateStep']);
    Route::delete('/sub-treatment-steps/{step}', [TreatmentCatalogController::class, 'destroyStep']);

    // Patients
    Route::get('/patients/search', [PatientController::class, 'search']);
    Route::get('/patients/duplicates/cleanup', [PatientController::class, 'duplicatesPreview']);
    Route::post('/patients/duplicates/cleanup', [PatientController::class, 'duplicatesCleanup']);
    Route::post('/patients/import', [PatientController::class, 'import']);
    Route::apiResource('patients', PatientController::class);
    Route::get('/patients/{patient}/appointments', [PatientHistoryController::class, 'appointments']);
    Route::get('/patients/{patient}/treatment-records', [PatientHistoryController::class, 'treatmentRecords']);
    Route::get('/patients/{patient}/payments', [PatientHistoryController::class, 'payments']);
    Route::get('/patients/{patient}/balance', [PatientHistoryController::class, 'balance']);
    Route::get('/patients/{patient}/treatment-plans', [PatientHistoryController::class, 'plans']);
    Route::get('/patients/{patient}/unfinished', [PatientHistoryController::class, 'unfinished']);
    Route::get('/patients/{patient}/gynecology-profile', [PatientMedicalController::class, 'showGynecology']);
    Route::put('/patients/{patient}/gynecology-profile', [PatientMedicalController::class, 'updateGynecology']);
    Route::get('/patients/{patient}/medical-summary', [PatientMedicalController::class, 'summary']);

    // Appointments
    Route::get('/appointments/today', [AppointmentController::class, 'today']);
    Route::get('/appointments/bulk-delete-preview', [AppointmentController::class, 'bulkDeletePreview']);
    Route::post('/appointments/bulk-delete', [AppointmentController::class, 'bulkDelete']);
    Route::post('/appointments/import', [AppointmentController::class, 'import']);
    Route::apiResource('appointments', AppointmentController::class);
    Route::post('/appointments/{appointment}/treatments', [AppointmentController::class, 'recordTreatment']);
    Route::post('/appointments/{appointment}/resume', [AppointmentController::class, 'resumeTreatment']);
    Route::post('/appointments/{appointment}/execute-plan', [AppointmentController::class, 'executePlan']);
    Route::get('/appointments/{appointment}/completed-steps', [AppointmentController::class, 'completedSteps']);
    Route::get('/appointments/{appointment}/payments', [MoneyController::class, 'appointmentPayments']);

    // Money, records, plans
    Route::post('/payments', [MoneyController::class, 'storePayment']);
    Route::patch('/payments/{payment}', [MoneyController::class, 'updatePayment']);
    Route::delete('/payments/{payment}', [MoneyController::class, 'destroyPayment']);
    Route::patch('/treatment-records/{record}', [MoneyController::class, 'updateRecord']);
    Route::delete('/treatment-records/{record}', [MoneyController::class, 'destroyRecord']);
    Route::post('/treatment-plans', [MoneyController::class, 'storePlan']);
    Route::delete('/treatment-plans/{plan}', [MoneyController::class, 'destroyPlan']);

    // Waiting room
    Route::get('/waiting-list', [WaitingListController::class, 'index']);
    Route::post('/waiting-list', [WaitingListController::class, 'store']);
    Route::post('/waiting-list/complete-in-exam', [WaitingListController::class, 'completeInExam']);
    Route::post('/waiting-list/clear-completed', [WaitingListController::class, 'clearCompleted']);
    Route::patch('/waiting-list/{entry}', [WaitingListController::class, 'update']);
    Route::delete('/waiting-list/{entry}', [WaitingListController::class, 'destroy']);

    // Reports
    Route::get('/stats', [ReportController::class, 'stats']);
    Route::get('/reports/revenue', [ReportController::class, 'revenue']);

    // سجل النشاطات (super_admin)
    Route::get('/activity-logs', [ActivityLogController::class, 'index']);
    Route::get('/activity-logs/users', [ActivityLogController::class, 'users']);

    // Phase E: medicines, prescriptions, templates, printed header
    Route::apiResource('medicines', MedicineController::class)->except('show');
    Route::post('/prescriptions/{prescription}/printed', [PrescriptionController::class, 'markPrinted']);
    Route::apiResource('prescriptions', PrescriptionController::class);
    Route::get('/prescription-templates', [PrescriptionTemplateController::class, 'index']);
    Route::post('/prescription-templates', [PrescriptionTemplateController::class, 'store']);
    Route::patch('/prescription-templates/{template}', [PrescriptionTemplateController::class, 'update']);
    Route::delete('/prescription-templates/{template}', [PrescriptionTemplateController::class, 'destroy']);
    Route::get('/clinic-settings', [ClinicSettingController::class, 'show']);
    Route::put('/clinic-settings', [ClinicSettingController::class, 'update']);
    Route::get('/clinic-settings/logo', [ClinicSettingController::class, 'logo']);
    Route::post('/clinic-settings/logo', [ClinicSettingController::class, 'uploadLogo']);
    Route::delete('/clinic-settings/logo', [ClinicSettingController::class, 'deleteLogo']);

    // Phase F: patient files, medical timeline, storage usage
    Route::get('/patients/{patient}/files', [PatientFileController::class, 'index']);
    Route::post('/patients/{patient}/files', [PatientFileController::class, 'store']);
    Route::get('/patients/{patient}/timeline', [PatientHistoryController::class, 'timeline']);
    Route::get('/patient-files/{file}/content', [PatientFileController::class, 'content']);
    Route::get('/patient-files/{file}/thumbnail', [PatientFileController::class, 'thumbnail']);
    Route::patch('/patient-files/{file}', [PatientFileController::class, 'update']);
    Route::delete('/patient-files/{file}', [PatientFileController::class, 'destroy']);
    Route::get('/admin/storage', [ReportController::class, 'storage']);

    // Phase G: attendance and finance
    Route::get('/attendance', [AttendanceController::class, 'index']);
    Route::get('/attendance/today', [AttendanceController::class, 'today']);
    Route::post('/attendance/check-in', [AttendanceController::class, 'checkIn']);
    Route::post('/attendance/check-out', [AttendanceController::class, 'checkOut']);
    Route::post('/attendance', [AttendanceController::class, 'store']);
    Route::patch('/attendance/{attendance}', [AttendanceController::class, 'update']);
    Route::delete('/attendance/{attendance}', [AttendanceController::class, 'destroy']);
    Route::get('/settlements', [FinanceController::class, 'settlements']);
    Route::post('/settlements/close', [FinanceController::class, 'close']);
    Route::post('/settlements/reopen', [FinanceController::class, 'reopen']);
    Route::get('/my-settlement', [FinanceController::class, 'mySettlement']);
    Route::get('/compensation-rules', [FinanceController::class, 'rules']);
    Route::post('/compensation-rules', [FinanceController::class, 'storeRule']);
    Route::delete('/compensation-rules/{rule}', [FinanceController::class, 'destroyRule']);
    Route::get('/expense-categories', [FinanceController::class, 'categories']);
    Route::post('/expense-categories', [FinanceController::class, 'storeCategory']);
    Route::patch('/expense-categories/{category}', [FinanceController::class, 'updateCategory']);
    Route::get('/expenses', [FinanceController::class, 'expenses']);
    Route::post('/expenses', [FinanceController::class, 'storeExpense']);
    Route::patch('/expenses/{expense}', [FinanceController::class, 'updateExpense']);
    Route::delete('/expenses/{expense}', [FinanceController::class, 'destroyExpense']);
    Route::get('/recurring-expenses', [FinanceController::class, 'recurring']);
    Route::post('/recurring-expenses', [FinanceController::class, 'storeRecurring']);
    Route::post('/recurring-expenses/generate', [FinanceController::class, 'generateRecurring']);
    Route::patch('/recurring-expenses/{recurring}', [FinanceController::class, 'updateRecurring']);
    Route::delete('/recurring-expenses/{recurring}', [FinanceController::class, 'destroyRecurring']);
    Route::get('/payouts', [FinanceController::class, 'payouts']);
    Route::post('/payouts', [FinanceController::class, 'storePayout']);
    Route::delete('/payouts/{payout}', [FinanceController::class, 'destroyPayout']);

    // Dashboard and payment receipts
    Route::get('/dashboard', DashboardController::class);
    Route::get('/payments/{payment}', [MoneyController::class, 'showPayment']);

    Route::post('/auth/password', [AuthController::class, 'changePassword']);
});
