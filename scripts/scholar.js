#!/usr/bin/env node

const { startServer } = require("../server/server");

const command = process.argv[2] || "start";

if (command === "start") {
  startServer();
} else {
  console.error(`Unknown scholar command: ${command}`);
  console.error("Usage: scholar start");
  process.exit(1);
}
