import pool from './index';
import fs from 'fs/promises';
import path from 'path';

async function runMigration() {
  try {
    console.log('Running database migration...');

    // Use process.cwd() to find the source schema file regardless of where this script is run from
    const schemaPath = path.join(process.cwd(), 'src/db/schema.sql');
    const schema = await fs.readFile(schemaPath, 'utf-8');

    await pool.query(schema);

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
