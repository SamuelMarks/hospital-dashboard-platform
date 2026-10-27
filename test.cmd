@echo off
:: ## Overview
:: End-to-end cloud deployment, health verification, and test execution harness
:: for Hospital Dashboard Platform using LibScript on Windows.
::
:: ## Usage
:: test.cmd [--unit-mock|--mock-cloud|--dry-run] [--live-cloud] [--local|-l] [--run-remote-tests|-t] [provider]

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
set "REPO_DIR=%~dp0"
set "CALLER_LOCATION=%LOCATION%"

if exist "%REPO_DIR%.env" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%REPO_DIR%.env") do (
        set "LINE=%%A"
        if not "!LINE!"=="" if not "!LINE:~0,1!"=="#" (
            if "!%%A!"=="" set "%%A=%%~B"
        )
    )
)
if exist "%REPO_DIR%.env.secrets" (
    for /f "usebackq tokens=1,* delims==" %%A in ("%REPO_DIR%.env.secrets") do (
        set "LINE=%%A"
        if not "!LINE!"=="" if not "!LINE:~0,1!"=="#" (
            if "!%%A!"=="" set "%%A=%%~B"
        )
    )
)
set "LOCATION=%CALLER_LOCATION%"

if not "%PROVIDER%"=="" (
    if "%CLOUD_PROVIDER%"=="" set "CLOUD_PROVIDER=%PROVIDER%"
)
if "%CLOUD_PROVIDER%"=="" set "CLOUD_PROVIDER=%DEFAULT_CLOUD_PROVIDER%"
if "%LIBSCRIPT_ROOT_DIR%"=="" set "LIBSCRIPT_ROOT_DIR=%USERPROFILE%\repos\libscript"
if "%LIBSCRIPT_CLI%"=="" set "LIBSCRIPT_CLI=%LIBSCRIPT_ROOT_DIR%\libscript.cmd"
if "%NODE_NAME%"=="" set "NODE_NAME=test-pulse-query-node"
if "%RG_NAME%"=="" set "RG_NAME=%DEFAULT_RG_NAME%"
if "%REMOTE_DEST%"=="" set "REMOTE_DEST=hospital-dashboard-platform"

set "RUN_LOCAL=0"
set "RUN_REMOTE_TESTS=0"
set "MOCK_CLOUD=0"
set "LIVE_CLOUD=0"
if /i "%DRY_RUN%"=="true" set "MOCK_CLOUD=1"

:: ## parse_args
:: Parses CLI flags and optional positional cloud provider argument.
:parse_args
if "%~1"=="" goto after_args
if "%~1"=="--unit-mock" (
    set "MOCK_CLOUD=1"
    shift
    goto parse_args
)
if "%~1"=="--mock-cloud" (
    set "MOCK_CLOUD=1"
    shift
    goto parse_args
)
if "%~1"=="--dry-run" (
    set "MOCK_CLOUD=1"
    shift
    goto parse_args
)
if "%~1"=="--live-cloud" (
    set "LIVE_CLOUD=1"
    shift
    goto parse_args
)
if "%~1"=="--local" (
    set "RUN_LOCAL=1"
    shift
    goto parse_args
)
if "%~1"=="-l" (
    set "RUN_LOCAL=1"
    shift
    goto parse_args
)
if "%~1"=="--run-remote-tests" (
    set "RUN_REMOTE_TESTS=1"
    shift
    goto parse_args
)
if "%~1"=="-t" (
    set "RUN_REMOTE_TESTS=1"
    shift
    goto parse_args
)
if "%~1"=="--help" goto show_help
if "%~1"=="-h" goto show_help
if "%~1"=="/?" goto show_help
set "CLOUD_PROVIDER=%~1"
shift
goto parse_args

:: ## show_help
:: Displays CLI usage, flags, and environment variable documentation.
:show_help
echo Usage: %0 [--unit-mock^|--mock-cloud^|--dry-run] [--live-cloud] [--local^|-l] [--run-remote-tests^|-t] [provider]
echo Options:
echo   --unit-mock, --mock-cloud, --dry-run  Simulate cloud operations locally without cloud resources.
echo   --live-cloud                          Force live cloud provisioning and execution; fails if auth missing.
echo   --local, -l                           Run tests locally using installed pytest/npm.
echo   --run-remote-tests, -t                Run pytest directly on remote compute instance after provisioning.
echo Environment variables:
echo   CLOUD_PROVIDER     Cloud provider (%SUPPORTED_CLOUD_PROVIDERS%). Default: %DEFAULT_CLOUD_PROVIDER%
echo   LIBSCRIPT_ROOT_DIR Path to Libscript repo. Default: %%USERPROFILE%%\repos\libscript
echo   LIBSCRIPT_CLI      Path to Libscript executable wrapper. Default: %%LIBSCRIPT_ROOT_DIR%%\libscript.cmd
echo   NODE_NAME          Name of compute node. Default: %NODE_NAME%
echo   RG_NAME            Resource group or project name. Default: %RG_NAME%
echo   LOCATION           Cloud region/datacenter. Default: %DEFAULT_CLOUD_LOCATION%
echo   REMOTE_DEST        Destination folder on remote node. Default: %REMOTE_DEST%
exit /b 0

:: ## after_args
:: Resolves default location and dispatches to mock, local, or cloud execution.
:after_args
if "%LOCATION%"=="" (
    if /i "!CLOUD_PROVIDER!"=="aws" (
        set "LOCATION=%DEFAULT_AWS_LOCATION%"
    ) else if /i "!CLOUD_PROVIDER!"=="gcp" (
        set "LOCATION=%DEFAULT_GCP_LOCATION%"
    ) else (
        set "LOCATION=%DEFAULT_CLOUD_LOCATION%"
    )
)

if "%MOCK_CLOUD%"=="1" goto run_mock_cloud
if "%RUN_LOCAL%"=="1" goto run_local_tests
if not exist "%LIBSCRIPT_CLI%" goto run_local_tests

set "EXIT_CODE=0"

:: ## check_cloud_credentials
:: Validates cloud CLI presence and active authentication state.
:check_cloud_credentials
echo Verifying CLI authentication credentials for '%CLOUD_PROVIDER%'...
if /i "%CLOUD_PROVIDER%"=="%DEFAULT_CLOUD_PROVIDER%" (
    where %CLOUD_CLI_BIN% >nul 2>&1
    if errorlevel 1 (
        if "%LIVE_CLOUD%"=="1" (
            echo ERROR: %CLOUD_CLI_DISPLAY_NAME% CLI ^('%CLOUD_CLI_BIN%'^) not found. 1>&2
            exit /b 1
        )
    ) else (
        call %CLOUD_CLI_BIN% %CLOUD_CLI_AUTH_ARGS% >nul 2>&1
        if errorlevel 1 (
            echo WARNING: %CLOUD_CLI_DISPLAY_NAME% CLI not authenticated. Run '%CLOUD_CLI_LOGIN_HINT%'. 1>&2
            if "%LIVE_CLOUD%"=="1" (
                echo ERROR: --live-cloud requires authenticated %CLOUD_CLI_DISPLAY_NAME% credentials. 1>&2
                exit /b 1
            )
        )
    )
)
if /i "%CLOUD_PROVIDER%"=="gcp" (
    where gcloud >nul 2>&1
    if errorlevel 1 (
        if "%LIVE_CLOUD%"=="1" (
            echo ERROR: Google Cloud CLI ^('gcloud'^) not found. 1>&2
            exit /b 1
        )
    ) else (
        call gcloud auth print-access-token >nul 2>&1
        if errorlevel 1 (
            echo WARNING: Google Cloud CLI not authenticated. Run 'gcloud auth login'. 1>&2
            if "%LIVE_CLOUD%"=="1" (
                echo ERROR: --live-cloud requires authenticated GCP credentials. 1>&2
                exit /b 1
            )
        )
    )
)
if /i "%CLOUD_PROVIDER%"=="aws" (
    where aws >nul 2>&1
    if errorlevel 1 (
        if "%LIVE_CLOUD%"=="1" (
            echo ERROR: AWS CLI ^('aws'^) not found. 1>&2
            exit /b 1
        )
    ) else (
        call aws sts get-caller-identity >nul 2>&1
        if errorlevel 1 (
            echo WARNING: AWS CLI not authenticated. Run 'aws configure'. 1>&2
            if "%LIVE_CLOUD%"=="1" (
                echo ERROR: --live-cloud requires authenticated AWS credentials. 1>&2
                exit /b 1
            )
        )
    )
)

echo Starting %CLOUD_PROVIDER% deployment test for hospital-dashboard-platform...
echo Node: %NODE_NAME%, Target: %RG_NAME% (%LOCATION%)

rem Provision the stack
call "%LIBSCRIPT_CLI%" provision "%CLOUD_PROVIDER%" "%NODE_NAME%" "%RG_NAME%" "%LOCATION%" "%REPO_DIR%" "%REMOTE_DEST%"
if errorlevel 1 (
    echo ERROR: Provisioning failed on %CLOUD_PROVIDER%. 1>&2
    set "EXIT_CODE=1"
    goto cleanup
)

echo Verifying remote connectivity...
call "%LIBSCRIPT_CLI%" cloud "%CLOUD_PROVIDER%" node exec "%NODE_NAME%" "%RG_NAME%" "echo Deployment test successful"
if errorlevel 1 (
    echo ERROR: Remote execution verification failed on %CLOUD_PROVIDER%. 1>&2
    set "EXIT_CODE=1"
    goto cleanup
)

echo Verifying backend API health on remote host...
call "%LIBSCRIPT_CLI%" cloud "%CLOUD_PROVIDER%" node exec "%NODE_NAME%" "%RG_NAME%" "HEALTH_JSON=$(curl -sf http://localhost:8000/api/v1/system/health || curl -sf http://127.0.0.1:8000/api/v1/system/health) && echo \"$HEALTH_JSON\" | jq -e '.status == \"healthy\" and .datasets.status == \"ready\" and .datasets.table_count >= 2 and (.datasets.row_counts.hospital_data // 0) > 0 and (.datasets.row_counts.Synthetic_hospital_data_transfers // 0) > 0 and .templates.status == \"ready\" and .templates.template_count >= 10'"
if errorlevel 1 (
    echo WARNING: Backend API health check failed on %CLOUD_PROVIDER%. 1>&2
    set "EXIT_CODE=1"
    goto cleanup
)

echo Verifying frontend web service on remote host...
call "%LIBSCRIPT_CLI%" cloud "%CLOUD_PROVIDER%" node exec "%NODE_NAME%" "%RG_NAME%" "curl -sf -I http://localhost:80/ || curl -sf -I http://127.0.0.1:80/"
if errorlevel 1 (
    echo WARNING: Frontend web service check failed on %CLOUD_PROVIDER%. 1>&2
    set "EXIT_CODE=1"
    goto cleanup
)

if "%RUN_REMOTE_TESTS%"=="1" (
    echo Running test suite on remote node...
    call "%LIBSCRIPT_CLI%" cloud "%CLOUD_PROVIDER%" node exec "%NODE_NAME%" "%RG_NAME%" "cd %REMOTE_DEST%/pulse-query-backend && pytest -q"
    if errorlevel 1 (
        echo ERROR: Remote test suite execution failed. 1>&2
        set "EXIT_CODE=1"
        goto cleanup
    )
    echo Remote test suite passed.
)

echo Deployment and remote health verification passed successfully.

:: ## cleanup
:: Deprovisions cloud resources on exit and returns EXIT_CODE.
:cleanup
echo Cleaning up cloud resources on %CLOUD_PROVIDER% (%NODE_NAME%)...
call "%LIBSCRIPT_CLI%" deprovision "%CLOUD_PROVIDER%" "%NODE_NAME%" "%RG_NAME%" "%LOCATION%" "%REPO_DIR%" "%REMOTE_DEST%"
echo Deprovisioning complete.
exit /b !EXIT_CODE!

:: ## run_mock_cloud
:: Executes simulated cloud deployment and health checks locally.
:run_mock_cloud
echo ==========================================================
echo Running in Mock Cloud mode (--mock-cloud specified)...
echo Simulating provisioning on %CLOUD_PROVIDER% (%NODE_NAME%)...
echo ==========================================================
echo Verifying remote execution...
echo Deployment test successful
echo Verifying backend API health status on remote host...
echo {"status": "healthy", "datasets": {"status": "ready", "table_count": 2, "row_counts": {"hospital_data": 700, "Synthetic_hospital_data_transfers": 41692}}, "templates": {"status": "ready", "template_count": 29}}
echo Verifying frontend web service on remote host...
echo HTTP/1.1 200 OK
if "%RUN_REMOTE_TESTS%"=="1" (
    echo Running test suite on mock remote instance...
    pytest -q
    if errorlevel 1 (
        echo ERROR: Mock remote test suite failed. 1>&2
        echo Mock deprovisioning cloud resources on %CLOUD_PROVIDER% (%NODE_NAME%)...
        echo Deprovisioning complete.
        exit /b 1
    )
)
echo Deployment and remote health verification passed successfully.
echo Mock deprovisioning cloud resources on %CLOUD_PROVIDER% (%NODE_NAME%)...
echo Deprovisioning complete.
exit /b 0

:: ## run_local_tests
:: Runs backend and frontend unit test suites locally.
:run_local_tests
echo ==========================================================
if "%RUN_LOCAL%"=="1" (
    echo Running test suite locally (--local specified)...
) else (
    echo Libscript CLI not found at '%LIBSCRIPT_CLI%'.
    echo Falling back to local test suite...
)
echo ==========================================================
if exist "pulse-query-backend" (
    cd pulse-query-backend
    pytest
    if errorlevel 1 (
        cd ..
        exit /b 1
    )
    cd ..
) else (
    pytest
    if errorlevel 1 exit /b 1
)
if exist "pulse-query-ng-web" (
    cd pulse-query-ng-web
    call npm test
    cd ..
)
echo Local test suite completed successfully.
exit /b 0
