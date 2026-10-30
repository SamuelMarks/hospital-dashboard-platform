@echo off
:: # generate_client.cmd
::
:: ## Overview
:: Generates both the Angular TypeScript client and Kotlin Multiplatform (KMP)
:: client from the Backend OpenAPI schema on Windows.
::
:: ## Usage
:: generate_client.cmd

setlocal EnableDelayedExpansion
set "THIS_FILE=%~f0"

if defined STACK (
    echo !STACK! | findstr /C:":%THIS_FILE%:" >nul 2>&1
    if not errorlevel 1 (
        echo [STOP] processing "%THIS_FILE%" >&2
        exit /b 0
    )
)
set "STACK=%STACK%:%THIS_FILE%:"

set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

if not defined LIBSCRIPT_ROOT_DIR (
    set "d=%SCRIPT_DIR%"
    call :find_root
)
goto :root_found

:: ## find_root
:: Ascends the directory tree looking for ROOT or libscript.cmd.
:find_root
if exist "!d!\libscript.cmd" (
    set "LIBSCRIPT_ROOT_DIR=!d!"
    exit /b 0
)
if exist "!d!\ROOT" (
    set "LIBSCRIPT_ROOT_DIR=!d!"
    exit /b 0
)
for %%P in ("!d!") do set "parent=%%~dpP"
set "d=!parent:~0,-1!"
if "!d!"=="" (
    set "LIBSCRIPT_ROOT_DIR=%USERPROFILE%\repos\libscript"
    exit /b 0
)
goto :find_root

:: ## root_found
:: Continues execution once LIBSCRIPT_ROOT_DIR is verified.
:root_found

set "BACKEND_DIR=%SCRIPT_DIR%\pulse-query-backend"
set "FRONTEND_DEST=%SCRIPT_DIR%\pulse-query-ng-web\src\app\api-client"
set "KMP_DEST=%SCRIPT_DIR%\PulseQuery\composeApp\src\commonMain\kotlin\io\healthplatform\pulsequery\api"
set "SCHEMA_FILE=%SCRIPT_DIR%\openapi.json"
set "TMP_KMP_DIR=%TEMP%\kmp_client_gen"

echo ==================================================
echo Starting Full-Stack Client Generation Process
echo ==================================================

echo Step 1: Extracting OpenAPI JSON from Backend...
pushd "%BACKEND_DIR%"
call uv run python scripts/extract_openapi.py --output "%SCHEMA_FILE%"
set "RC=!ERRORLEVEL!"
popd
if not "!RC!"=="0" exit /b !RC!

if not exist "%SCHEMA_FILE%" (
    echo Error: openapi.json was not generated. 1>&2
    exit /b 1
)

for %%T in ("ServiceUnitConstraint" "OptimizationSolutionPayload" "SystemHealthResponse" "SystemDiagnosticsResponse" "ReingestResponse" "DashboardShareResponse") do (
    findstr /C:"%%~T" "%SCHEMA_FILE%" >nul 2>&1
    if errorlevel 1 (
        echo Error: Schema is missing critical type '%%~T'. 1>&2
        exit /b 1
    )
)

echo Step 2: Cleaning old Angular client files...
if exist "%FRONTEND_DEST%" rmdir /S /Q "%FRONTEND_DEST%"
if not exist "%FRONTEND_DEST%" mkdir "%FRONTEND_DEST%"

echo Step 3: Generating Angular TypeScript Client...
call npx -y @openapitools/openapi-generator-cli generate -i "%SCHEMA_FILE%" -g typescript-angular -o "%FRONTEND_DEST%" --additional-properties=ngVersion=17.0.0,fileNaming=kebab-case --skip-validate-spec
if errorlevel 1 exit /b 1

echo Step 4: Generating Kotlin Multiplatform (KMP) Client...
if exist "%TMP_KMP_DIR%" rmdir /S /Q "%TMP_KMP_DIR%"
if not exist "%TMP_KMP_DIR%" mkdir "%TMP_KMP_DIR%"

call npx -y @openapitools/openapi-generator-cli generate -i "%SCHEMA_FILE%" -g kotlin --library multiplatform -o "%TMP_KMP_DIR%" --additional-properties=packageName=io.healthplatform.pulsequery.api,collectionType=list,dateLibrary=kotlinx-datetime --skip-validate-spec
if errorlevel 1 exit /b 1

if exist "%KMP_DEST%\apis" rmdir /S /Q "%KMP_DEST%\apis"
if exist "%KMP_DEST%\models" rmdir /S /Q "%KMP_DEST%\models"
if not exist "%KMP_DEST%\apis" mkdir "%KMP_DEST%\apis"
if not exist "%KMP_DEST%\models" mkdir "%KMP_DEST%\models"
if not exist "%KMP_DEST%\infrastructure" mkdir "%KMP_DEST%\infrastructure"

xcopy /E /I /Y "%TMP_KMP_DIR%\src\commonMain\kotlin\io\healthplatform\pulsequery\api\apis\*" "%KMP_DEST%\apis\" >nul 2>&1
xcopy /E /I /Y "%TMP_KMP_DIR%\src\commonMain\kotlin\io\healthplatform\pulsequery\api\models\*" "%KMP_DEST%\models\" >nul 2>&1
xcopy /E /I /Y "%TMP_KMP_DIR%\src\commonMain\kotlin\io\healthplatform\pulsequery\api\infrastructure\*" "%KMP_DEST%\infrastructure\" >nul 2>&1

if exist "%TMP_KMP_DIR%" rmdir /S /Q "%TMP_KMP_DIR%"

if exist "%BACKEND_DIR%\.venv\Scripts\python.exe" (
    call "%BACKEND_DIR%\.venv\Scripts\python.exe" "%SCRIPT_DIR%\scripts\normalize_api_client.py"
) else (
    pushd "%BACKEND_DIR%"
    call uv run python "%SCRIPT_DIR%\scripts\normalize_api_client.py"
    popd
)

if exist "%SCHEMA_FILE%" del /F /Q "%SCHEMA_FILE%"

echo ==================================================
echo Full-Stack Client Generation Complete!
echo Angular Client: %FRONTEND_DEST%
echo KMP Client:     %KMP_DEST%
echo ==================================================
exit /b 0
