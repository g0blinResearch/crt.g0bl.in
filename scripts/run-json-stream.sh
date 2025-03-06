#!/bin/bash
# CT-Stream JSON Stream Runner
# 
# This script runs the JSON stream tool to display Certificate Transparency logs
# in real-time as JSON objects.

echo "CT-Stream JSON Stream"
echo "---------------------"

# Change to the project directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
cd "$SCRIPT_DIR/.."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js is not installed or not in the PATH."
  echo "Please install Node.js from https://nodejs.org/"
  exit 1
fi

# Run with provided arguments
if [ $# -eq 0 ]; then
  echo "Running with default options. Use --help to see available options."
  node scripts/json-stream.js
else
  echo "Running with options: $@"
  node scripts/json-stream.js "$@"
fi