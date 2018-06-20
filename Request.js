class Request {
  constructor({
    payload, command, message,
  }) {
    this.payload = payload;
    this.command = command;
    this.message = message;
    this.isResponse = false;
    this.isRequest = true;
  }
}

module.exports = Request;
