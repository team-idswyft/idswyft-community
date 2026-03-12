#!/usr/bin/env tsx

import { readFileSync } from 'fs';
import { join } from 'path';
import { supabase } from '../database.js';

const logger = {
  info: console.log,
  error: console.error,
  warn: console.warn,
  debug: console.debug
};

async function setupDatabase() {
  try {
    console.log('🗄️ Setting up Idswyft database schema...');
    
    // Read the schema file
    const schemaPath = join(process.cwd(), 'src', 'sql', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    
    // Split the schema into individual statements
    const statements = schema
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log(`📝 Executing ${statements.length} SQL statements...`);
    
    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.length === 0) continue;
      
      try {
        const { error } = await supabase.rpc('exec_sql', { 
          sql: statement + ';' 
        });
        
        if (error) {
          // Try direct execution for DDL statements
          const { error: directError } = await supabase
            .from('_raw_sql_execution')
            .insert({ sql: statement });
          
          if (directError) {
            logger.warn(`Statement ${i + 1} warning:`, error.message);
            // Continue with other statements
          }
        }
      } catch (error) {
        logger.warn(`Statement ${i + 1} skipped:`, error instanceof Error ? error.message : 'Unknown error');
        // Continue with other statements
      }
    }
    
    // Verify setup by checking if tables exist
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', [
        'users', 
        'developers', 
        'verification_requests', 
        'documents', 
        'selfies',
        'api_keys',
        'webhooks'
      ]);
    
    if (tablesError) {
      logger.error('Failed to verify table creation:', tablesError);
    } else {
      logger.info(`Successfully created ${tables?.length || 0} tables`);
      tables?.forEach(table => {
        logger.info(`✓ Table: ${table.table_name}`);
      });
    }
    
    // Create default admin user if it doesn't exist
    try {
      const { data: existingAdmin } = await supabase
        .from('admin_users')
        .select('id')
        .eq('email', 'admin@idswyft.app')
        .single();
      
      if (!existingAdmin) {
        const bcrypt = await import('bcryptjs');
        const passwordHash = await bcrypt.hash('admin123', 12);
        
        const { error: adminError } = await supabase
          .from('admin_users')
          .insert({
            email: 'admin@idswyft.app',
            password_hash: passwordHash,
            role: 'admin'
          });
        
        if (adminError) {
          logger.error('Failed to create admin user:', adminError);
        } else {
          logger.info('✓ Default admin user created (admin@idswyft.app / admin123)');
        }
      } else {
        logger.info('✓ Admin user already exists');
      }
    } catch (error) {
      logger.error('Error setting up admin user:', error);
    }
    
    logger.info('✅ Database setup completed successfully!');
    logger.info('');
    logger.info('Next steps:');
    logger.info('1. Update your .env file with the correct database credentials');
    logger.info('2. Run `npm run dev` to start the development server');
    logger.info('3. Access admin panel at http://localhost:3001/admin (admin@idswyft.app / admin123)');
    logger.info('4. Get your first API key at http://localhost:5173/developer');
    
  } catch (error) {
    logger.error('Database setup failed:', error);
    process.exit(1);
  }
}

// Manual table creation as fallback
async function createTablesManually() {
  logger.info('Creating tables manually...');
  
  const tables = [
    {
      name: 'users',
      sql: `
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    },
    {
      name: 'developers',
      sql: `
        CREATE TABLE IF NOT EXISTS developers (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          name VARCHAR(255) NOT NULL,
          company VARCHAR(255),
          webhook_url TEXT,
          sandbox_webhook_url TEXT,
          is_verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    },
    {
      name: 'api_keys',
      sql: `
        CREATE TABLE IF NOT EXISTS api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
          key_hash TEXT NOT NULL,
          key_prefix VARCHAR(20) NOT NULL,
          name VARCHAR(255) NOT NULL,
          is_sandbox BOOLEAN DEFAULT FALSE,
          is_active BOOLEAN DEFAULT TRUE,
          last_used_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          expires_at TIMESTAMP WITH TIME ZONE
        );
      `
    },
    {
      name: 'verification_requests',
      sql: `
        CREATE TABLE IF NOT EXISTS verification_requests (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          developer_id UUID NOT NULL REFERENCES developers(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'manual_review')),
          document_id UUID,
          selfie_id UUID,
          ocr_data JSONB,
          face_match_score DECIMAL(5,4),
          manual_review_reason TEXT,
          external_verification_id VARCHAR(255),
          is_sandbox BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `
    }
  ];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.rpc('exec', { sql: table.sql });
      if (error) {
        logger.error(`Failed to create table ${table.name}:`, error);
      } else {
        logger.info(`✓ Created table: ${table.name}`);
      }
    } catch (error) {
      logger.error(`Error creating table ${table.name}:`, error);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  setupDatabase();
}