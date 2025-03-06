#!/bin/bash

cat transcript.json | jq -r '
  [ .[] 
    | select((.say == "text" or .say == "reasoning" or .say == "user_feedback" or .say == "command") and .text != "") 
    | {ts, type, say, text, bot: has("partial")}
  ] 
  | map(
      "| Timestamp | Type | Say | Bot |\n|-----------|------|-----|-----|\n| \(.ts) | \(.type) | \(.say) | \(.bot) |\n```\n\(.text)\n```"
    ) 
  | join("\n\n")
' > transcript.md