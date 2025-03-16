#!/bin/bash
# CT-Stream Domain Extractor Runner
#
# This script runs the standalone domain extractor with specified options.
#
# Usage:
#   ./run-domain-extractor.sh [options]
#
# Examples:
#   ./run-domain-extractor.sh --output=domains.json
#   ./run-domain-extractor.sh --filter=example.com --format=text

# Set the script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is required but not installed."
    exit 1
fi

# Default options
OUTPUT="domains.json"
FORMAT="json"
MAX_DOMAINS=100000
SAVE_INTERVAL=60
TRACK_WILDCARDS=0
FILTER=""

# Parse command line arguments
for arg in "$@"; do
    case $arg in
        --output=*)
            OUTPUT="${arg#*=}"
            ;;
        --format=*)
            FORMAT="${arg#*=}"
            ;;
        --filter=*)
            FILTER="${arg#*=}"
            ;;
        --max-domains=*)
            MAX_DOMAINS="${arg#*=}"
            ;;
        --save-interval=*)
            SAVE_INTERVAL="${arg#*=}"
            ;;
        --track-wildcards)
            TRACK_WILDCARDS=1
            ;;
        --help)
            echo "CT-Stream Domain Extractor Runner"
            echo ""
            echo "Usage:"
            echo "  ./run-domain-extractor.sh [options]"
            echo ""
            echo "Options:"
            echo "  --output=file.json    Output file for domains (default: domains.json)"
            echo "  --format=json|text    Output format (default: json)"
            echo "  --filter=pattern      Only include domains matching this pattern"
            echo "  --max-domains=N       Maximum number of domains to collect (default: 100000)"
            echo "  --save-interval=N     Save interval in seconds (default: 60)"
            echo "  --track-wildcards     Track wildcard domains (*.example.com)"
            echo "  --help                Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            echo "Use --help to see available options."
            ;;
    esac
done

# Build command arguments
CMD_ARGS="--output=$OUTPUT --format=$FORMAT --max-domains=$MAX_DOMAINS --save-interval=$SAVE_INTERVAL"

if [ -n "$FILTER" ]; then
    CMD_ARGS="$CMD_ARGS --filter=$FILTER"
fi

if [ $TRACK_WILDCARDS -eq 1 ]; then
    CMD_ARGS="$CMD_ARGS --track-wildcards"
fi

# Print configuration
echo "CT-Stream Domain Extractor"
echo "=========================="
echo "Output file: $OUTPUT"
echo "Format: $FORMAT"
echo "Max domains: $MAX_DOMAINS"
echo "Save interval: $SAVE_INTERVAL seconds"
if [ -n "$FILTER" ]; then
    echo "Filter: $FILTER"
fi
if [ $TRACK_WILDCARDS -eq 1 ]; then
    echo "Track wildcards: Yes"
else
    echo "Track wildcards: No"
fi
echo ""

# Run the extractor
echo "Starting domain extractor..."
cd "$PROJECT_ROOT"
node "$SCRIPT_DIR/standalone-domain-extractor.js" $CMD_ARGS

# Exit with the extractor's exit code
exit $?