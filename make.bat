@echo off
setlocal

if "%DOCS_DIR%"=="" set DOCS_DIR=docs
if "%COMPOSE_FILE%"=="" set COMPOSE_FILE=docker-compose.yml

if "%~1"=="" goto help
if "%~1"=="help" goto help
if "%~1"=="build_docker" goto build_docker
if "%~1"=="run_docker" goto run_docker
if "%~1"=="test_docker" goto test_docker
if "%~1"=="clean_docker" goto clean_docker
if "%~1"=="install_base" goto install_base
if "%~1"=="install_deps" goto install_deps
if "%~1"=="build_docs" goto build_docs
if "%~1"=="build" goto build
if "%~1"=="dev_backend" goto dev_backend
if "%~1"=="serve" goto serve
if "%~1"=="test" goto test
if "%~1"=="fmt" goto fmt

echo Unknown target: %~1
goto help

:help
echo Available commands:
echo   build_docker  Build the docker containers
echo   run_docker    Run the docker containers
echo   test_docker   Run tests in docker containers
echo   clean_docker  Clean up docker containers
echo   install_base  Install language runtime and tools
echo   install_deps  Install local dependencies
echo   build_docs    Build the API docs (override with DOCS_DIR=%%DOCS_DIR%%)
echo   build         Build the frontend and backend
echo   dev_backend   Start the local dev server backend
echo   serve         Serve the frontend behind the backend local dir static file server (which is enabled in DEBUG mode only)
echo   test          Run tests locally
echo   fmt           Format the frontend and backend code
echo   help          Show help text
goto :eof

:get_docker_compose
where docker-compose >nul 2>&1
if not errorlevel 1 (
    set DOCKER_COMPOSE=docker-compose
    goto :eof
)
set DOCKER_COMPOSE=docker compose
goto :eof

:build_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% build
goto :eof

:run_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% up
goto :eof

:test_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm backend pytest
%DOCKER_COMPOSE% -f %COMPOSE_FILE% run --rm frontend npm run test
goto :eof

:clean_docker
call :get_docker_compose
%DOCKER_COMPOSE% -f %COMPOSE_FILE% down -v
goto :eof

:activate_venv
for /d %%d in (.venv venv .venv-* venv-* pulse-query-backend\.venv pulse-query-backend\venv pulse-query-backend\.venv-* pulse-query-backend\venv-*) do (
    if exist "%~dp0%%d\Scripts\activate.bat" (
        call "%~dp0%%d\Scripts\activate.bat"
        goto :eof
    )
)
goto :eof

:install_base
call :activate_venv
python3 -m pip install --upgrade pip
call npm install -g npm
goto :eof

:install_deps
call :activate_venv
cd pulse-query-backend
python3 -m pip install -r requirements.txt -r requirements-dev.txt
cd ..\pulse-query-ng-web
call npm install
cd ..
goto :eof

:build_docs
if not exist "%DOCS_DIR%" mkdir "%DOCS_DIR%"
call :activate_venv
cd pulse-query-backend
interrogate -vv --fail-under=100 src/app
if errorlevel 1 (
    cd ..
    goto :eof
)
cd ..\pulse-query-ng-web
call npm run docs
cd ..
echo Docs built in %DOCS_DIR%
goto :eof

:build
cd pulse-query-ng-web
call npm run build
if errorlevel 1 (
    cd ..
    goto :eof
)
cd ..\pulse-query-backend
call :activate_venv
python3 -m pip install -e .
cd ..
goto :eof

:dev_backend
call :activate_venv
cd pulse-query-backend
uvicorn app.main:app --reload --port 8000
cd ..
goto :eof

:serve
call :activate_venv
cd pulse-query-backend
set DEBUG=1
uvicorn app.main:app --reload --port 8000
cd ..
goto :eof

:test
call :activate_venv
cd pulse-query-backend
pytest
if errorlevel 1 (
    cd ..
    goto :eof
)
cd ..\pulse-query-ng-web
call npm run test
cd ..
goto :eof

:fmt
call :activate_venv
ruff format .
if errorlevel 1 goto :eof
cd pulse-query-ng-web
call npm run format
cd ..
goto :eof

