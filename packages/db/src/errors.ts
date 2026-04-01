export class SymphonyDbError extends Error {
  readonly fatal = true;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SymphonyDbError";
  }
}

export class SymphonyDbMigrationError extends SymphonyDbError {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "SymphonyDbMigrationError";
  }
}
