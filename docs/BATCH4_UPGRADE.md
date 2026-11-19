# Batch 4 upgrade instructions (Windows PowerShell)

This update is intended to be applied to the existing Batch 3 working folder so your local `.env`, `package-lock.json` and Drizzle migration history are preserved.

1. Stop both Vite and the Express API (`Ctrl+C` in the terminal running `npm run dev`).
2. Make a backup of the project folder and a PostgreSQL backup before schema changes. For example, from the parent directory:

   ```powershell
   Copy-Item .\return4me-new .\return4me-new-backup -Recurse
   ```

   Use `pg_dump` with your own local connection parameters to back up any database that already contains useful data.

3. Extract the Batch 4 ZIP into a separate temporary directory.
4. Copy the updated project files over your existing project, excluding local secrets, installed packages and migration history. From the parent directory, adjust the extracted folder name if necessary:

   ```powershell
   robocopy .\return4me-new-batch4\return4me-new .\return4me-new /E /XD node_modules .git /XF .env package-lock.json
   ```

   `robocopy` may return exit codes 1–7 for successful copy/update results; 8 or greater indicates a copy failure. Inspect the summary before continuing.

5. Confirm that your existing `.env`, `server/db/migrations/` folder and `package-lock.json` still exist. Do not share `.env` or secrets.
6. From the existing project root, run:

   ```powershell
   npm install
   npm run db:generate
   npm run db:migrate
   npm run typecheck
   npm test
   npm run build
   ```

7. Start the application with `npm run dev` and check `http://localhost:4000/api/health` and `http://localhost:5173`.

If a migration fails, stop; do not delete `server/db/migrations/`, edit the Drizzle journal manually or continue to later stages. Capture the complete error with secrets redacted so it can be diagnosed safely.

Batch 4 has not been tested against your local Windows database by this chat session. Generate and apply the migration only after the backup and then report the exact command results.
