class ApiResponse {
  constructor(statusCode, message = "Success") {
    this.statusCode = statusCode;
    this.data = this.data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export { ApiResponse };
