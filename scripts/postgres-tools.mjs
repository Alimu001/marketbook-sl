import { existsSync, readdirSync } from "node:fs";
import { delimiter, join } from "node:path";

export function postgresToolEnvironment() {
  const candidates = [];

  if (process.env.POSTGRES_BIN) {
    candidates.push(process.env.POSTGRES_BIN);
  }

  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const postgresRoot = join(programFiles, "PostgreSQL");
    if (existsSync(postgresRoot)) {
      const versions = readdirSync(postgresRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d+(\.\d+)?$/.test(entry.name))
        .map((entry) => entry.name)
        .sort((left, right) => Number(right) - Number(left));
      candidates.push(...versions.map((version) => join(postgresRoot, version, "bin")));
    }
  }

  const binDirectory = candidates.find((candidate) =>
    existsSync(join(candidate, process.platform === "win32" ? "pg_dump.exe" : "pg_dump")),
  );

  return binDirectory
    ? { ...process.env, PATH: `${binDirectory}${delimiter}${process.env.PATH || ""}` }
    : process.env;
}
