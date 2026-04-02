import {
  SymphonyPromptContractError,
  SymphonyRuntimeManifestError,
  runSymphonyRuntimeDoctor
} from "@symphony/runtime-contract";

async function main(): Promise<void> {
  const report = await runSymphonyRuntimeDoctor({
    repoRoot: process.cwd(),
    environmentSource: process.env
  });

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error: unknown) => {
  if (
    error instanceof SymphonyRuntimeManifestError ||
    error instanceof SymphonyPromptContractError
  ) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  throw error;
});
