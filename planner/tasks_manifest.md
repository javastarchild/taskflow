# Task Queue Manifest Guide

This file serves as the central guide for initializing and referencing the task queue system located in `./tasks/`.

## Protocol
Tasks are expected to be structured under unique UUID subdirectories within the `./tasks` folder. Each subdirectory must contain a primary markdown description (e.g., `README.md`) detailing the task goals, required artifacts, and any necessary context or dependencies.

**Structure:**
```
./tasks/{new-uuid}/
├── README.md  # Primary goal statement and description.
├── supporting/ # Code snippets, initial drafts, etc.
└── ...
```
The worker agent must systematically examine *all* subdirectories in `./tasks` to understand the complete workload before commencing work on any single task.