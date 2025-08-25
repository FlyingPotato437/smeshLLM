import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// Use service role key for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

async function applySchema() {
  console.log('🚀 Starting schema application...');
  
  try {
    // First, let's create the most critical table manually
    const createPiSensorTable = `
      CREATE TABLE IF NOT EXISTS pi_sensor_raw (
          id                BIGSERIAL PRIMARY KEY,
          sensor_uuid       UUID            NOT NULL,
          ts                TIMESTAMPTZ     NOT NULL,
          location          GEOGRAPHY(POINT, 4326) NOT NULL,
          altitude_m        REAL,
          pm25_ug_m3        REAL,
          pm10_ug_m3        REAL,
          temperature_c     REAL,
          rh_percent        REAL,
          created_at        TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    console.log('📊 Creating pi_sensor_raw table...');
    const { data: data1, error: error1 } = await supabase
      .rpc('exec', { sql: createPiSensorTable });
    
    if (error1) {
      console.log('❌ Error creating pi_sensor_raw:', error1.message);
      // Try alternative approach with raw SQL
      console.log('🔄 Trying alternative method...');
      
      // Method 2: Use postgrest direct SQL endpoint
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!
        },
        body: JSON.stringify({ sql: createPiSensorTable })
      });
      
      if (!response.ok) {
        console.log('❌ Alternative method failed:', await response.text());
        
        // Method 3: Try using simple table creation approach
        console.log('🔄 Trying simple SQL via supabase...');
        
        // Try to check if table exists first
        const { data: tables, error: checkError } = await supabase
          .from('information_schema.tables')
          .select('table_name')
          .eq('table_schema', 'public')
          .eq('table_name', 'pi_sensor_raw');
          
        if (checkError && !checkError.message.includes('does not exist')) {
          console.log('❌ Error checking tables:', checkError.message);
        } else {
          console.log('📋 Tables check result:', tables);
          
          if (!tables || tables.length === 0) {
            console.log('⚠️  Table pi_sensor_raw does not exist, needs manual creation');
            console.log('💡 Please run this SQL in Supabase SQL Editor:');
            console.log('');
            console.log(createPiSensorTable);
            console.log('');
          } else {
            console.log('✅ Table pi_sensor_raw already exists');
          }
        }
      } else {
        console.log('✅ pi_sensor_raw table created successfully');
      }
    } else {
      console.log('✅ pi_sensor_raw table created successfully');
    }

    // Create fire_detections table
    const createFireTable = `
      CREATE TABLE IF NOT EXISTS fire_detections (
          id            BIGSERIAL PRIMARY KEY,
          acquisition_ts TIMESTAMPTZ NOT NULL,
          location       GEOGRAPHY(POINT, 4326) NOT NULL,
          frp_mw         REAL,
          confidence     TEXT,
          created_at     TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    console.log('🔥 Creating fire_detections table...');
    const { data: data2, error: error2 } = await supabase
      .rpc('exec', { sql: createFireTable });
    
    if (error2) {
      console.log('❌ Error creating fire_detections:', error2.message);
      console.log('💡 Please run this SQL in Supabase SQL Editor:');
      console.log('');
      console.log(createFireTable);
      console.log('');
    } else {
      console.log('✅ fire_detections table created successfully');
    }

    // Create plume_predictions table
    const createPlumeTable = `
      CREATE TABLE IF NOT EXISTS plume_predictions (
          id               BIGSERIAL PRIMARY KEY,
          prediction_ts    TIMESTAMPTZ NOT NULL,
          generated_at     TIMESTAMPTZ NOT NULL,
          location         GEOGRAPHY(POINT, 4326) NOT NULL,
          altitude_m       REAL,
          conc_pm25_ug_m3  REAL,
          conc_pm10_ug_m3  REAL,
          model_version    TEXT     NOT NULL,
          rmse_validation  REAL,
          metadata         JSONB,
          created_at       TIMESTAMPTZ DEFAULT NOW()
      );
    `;

    console.log('🌪️  Creating plume_predictions table...');
    const { data: data3, error: error3 } = await supabase
      .rpc('exec', { sql: createPlumeTable });
    
    if (error3) {
      console.log('❌ Error creating plume_predictions:', error3.message);
      console.log('💡 Please run this SQL in Supabase SQL Editor:');
      console.log('');
      console.log(createPlumeTable);
      console.log('');
    } else {
      console.log('✅ plume_predictions table created successfully');
    }

    // Test data insertion
    console.log('🧪 Testing data insertion...');
    const testData = {
      sensor_uuid: '12345678-1234-1234-1234-123456789abc',
      ts: new Date().toISOString(),
      location: 'POINT(-122.4194 37.7749)', // San Francisco
      pm25_ug_m3: 12.5,
      temperature_c: 22.0,
      rh_percent: 65.0
    };

    const { data: insertData, error: insertError } = await supabase
      .from('pi_sensor_raw')
      .insert(testData)
      .select();

    if (insertError) {
      console.log('❌ Test insertion failed:', insertError.message);
      if (insertError.message.includes('does not exist')) {
        console.log('⚠️  Table definitely does not exist - manual schema setup required');
        console.log('');
        console.log('🔧 Complete SQL to run in Supabase SQL Editor:');
        console.log('');
        console.log('-- Enable extensions');
        console.log('CREATE EXTENSION IF NOT EXISTS postgis;');
        console.log('');
        console.log(createPiSensorTable);
        console.log('');
        console.log(createFireTable);
        console.log('');
        console.log(createPlumeTable);
        console.log('');
        console.log('-- Add indexes');
        console.log('CREATE INDEX IF NOT EXISTS idx_pi_sensor_raw_ts ON pi_sensor_raw(ts DESC);');
        console.log('CREATE INDEX IF NOT EXISTS idx_pi_sensor_raw_uuid ON pi_sensor_raw(sensor_uuid);');
        console.log('');
      }
    } else {
      console.log('✅ Test insertion successful:', insertData);
      
      // Clean up test data
      const { error: deleteError } = await supabase
        .from('pi_sensor_raw')
        .delete()
        .eq('id', insertData[0].id);
        
      if (!deleteError) {
        console.log('🧹 Test data cleaned up');
      }
    }

    console.log('🎉 Schema application completed!');

  } catch (error) {
    console.error('💥 Unexpected error:', error);
  }
}

// Run the script
if (require.main === module) {
  applySchema().then(() => {
    console.log('Script completed');
    process.exit(0);
  }).catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });
} 