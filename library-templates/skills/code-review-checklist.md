---
type: skill
name: "Code Review Checklist"
tags: [engineering, review]
owner: human
version: 1
---

When reviewing code, check in this order: correctness (does it do what it
claims), security (injection, path traversal, secrets in logs), then
simplicity (could this be shorter without losing clarity). Flag the most
severe issue first. Don't comment on formatting a linter would catch.
