@echo off
REM CT-Stream JSON Stream Runner
REM 
REM This script runs the JSON stream tool to display Certificate Transparency logs
REM in real-time as JSON objects.

echo CT-Stream JSON Stream
echo ---------------------

REM Change to the project directory
cd /d "%~dp0\.."

REM Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo ERROR: Node.js is not installed or not in the PATH.
  echo Please install Node.js from https://nodejs.org/
  exit /b 1
)

REM Get command-line arguments
set ARGS=%*

REM If no arguments provided, run with default options
if "%ARGS%"=="" (
  echo Running with default options. Use --help to see available options.
  node scripts/json-stream.js
) else (
  echo Running with options: %ARGS%
  node scripts/json-stream.js %ARGS%
)