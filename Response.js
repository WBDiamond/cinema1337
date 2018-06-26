#!/usr/bin/env node

class Response {
  constructor({
    payload, command, error, message,
  }) {
    this.payload = payload;
    this.command = command;
    this.message = message;
    this.error = error;
    this.success = !error;
    this.isResponse = true;
    this.isRequest = false;
  }
}

module.exports = Response;
