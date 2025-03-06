@echo off
REM CT-Stream Domain Extractor Runner
REM
REM This script runs the standalone domain extractor with specified options.
REM
REM Usage:
REM   run-domain-extractor.bat [options]
REM
REM Examples:
REM   run-domain-extractor.bat --output=domains.json
REM   run-domain-extractor.bat --filter=example.com --format=text

setlocal enabledelayedexpansion

REM Set the script directory
set "SCRIPT_DIR=%~dp0"
set "PROJECT_ROOT=%SCRIPT_DIR%.."

REM Check if node is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo Error: Node.js is required but not installed.
    exit /b 1
)

REM Default options
set "OUTPUT=domains.json"
set "FORMAT=json"
set "MAX_DOMAINS=100000"
set "SAVE_INTERVAL=60"
set "TRACK_WILDCARDS=0"
set "FILTER="
set "SHOW_HELP=0"

REM Parse command line arguments
for %%a in (%*) do (
    set "ARG=%%a"
    
    if "!ARG:~0,9!"=="--output=" (
        set "OUTPUT=!ARG:~9!"
    ) else if "!ARG:~0,9!"=="--format=" (
        set "FORMAT=!ARG:~9!"
    ) else if "!ARG:~0,9!"=="--filter=" (
        set "FILTER=!ARG:~9!"
    ) else if "!ARG:~0,13!"=="--max-domains=" (
        set "MAX_DOMAINS=!ARG:~13!"
    ) else if "!ARG:~0,15!"=="--save-interval=" (
        set "SAVE_INTERVAL=!ARG:~15!"
    ) else if "!ARG!"=="--track-wildcards" (
        set "TRACK_WILDCARDS=1"
    ) else if "!ARG!"=="--help" (
        set "SHOW_HELP=1"
    ) else (
        echo Unknown option: !ARG!
        echo Use --help to see available options.
    )
)

REM Show help
if %SHOW_HELP% equ 1 (
    echo CT-Stream Domain Extractor Runner
    echo.
    echo Usage:
    echo   run-domain-extractor.bat [options]
    echo.
    echo Options:
    echo   --output=file.json    Output file for domains (default: domains.json^)
    echo   --format=json^|text    Output format (default: json^)
    echo   --filter=pattern      Only include domains matching this pattern
    echo   --max-domains=N       Maximum number of domains to collect (default: 100000^)
    echo   --save-interval=N     Save interval in seconds (default: 60^)
    echo   --track-wildcards     Track wildcard domains (*.example.com^)
    echo   --help                Show this help message
    exit /b 0
)

REM Build command arguments
set "CMD_ARGS=--output=%OUTPUT% --format=%FORMAT% --max-domains=%MAX_DOMAINS% --save-interval=%SAVE_INTERVAL%"

if defined FILTER (
    set "CMD_ARGS=%CMD_ARGS% --filter=%FILTER%"
)

if %TRACK_WILDCARDS% equ 1 (
    set "CMD_ARGS=%CMD_ARGS% --track-wildcards"
)

REM Print configuration
echo CT-Stream Domain Extractor
echo ==========================
echo Output file: %OUTPUT%
echo Format: %FORMAT%
echo Max domains: %MAX_DOMAINS%
echo Save interval: %SAVE_INTERVAL% seconds
if defined FILTER (
    echo Filter: %FILTER%
)
if %TRACK_WILDCARDS% equ 1 (
    echo Track wildcards: Yes
) else (
    echo Track wildcards: No
)
echo.

REM Run the extractor
echo Starting domain extractor...
cd /d "%PROJECT_ROOT%"
node "%SCRIPT_DIR%standalone-domain-extractor.js" %CMD_ARGS%

REM Exit with the extractor's exit code
exit /b %ERRORLEVEL%