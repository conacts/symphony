import { Command } from "@oclif/core";

export abstract class BaseCommand extends Command {
  static baseFlags = {};

  protected printJson(payload: unknown): void {
    this.log(JSON.stringify(payload, null, 2));
  }
}
