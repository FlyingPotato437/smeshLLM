import { NextRequest, NextResponse } from 'next/server';
import { dataIngestionService } from '@/lib/services/data-ingestion';
import { CSVProcessor } from '@/lib/utils/csv-processor';

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    let csvContent = '';

    // Handle different content types
    if (contentType.includes('multipart/form-data')) {
      // File upload
      const formData = await request.formData();
      const file = formData.get('file') as File;
      
      if (!file) {
        return NextResponse.json(
          { success: false, error: 'No file provided' },
          { status: 400 }
        );
      }
      
      csvContent = await file.text();
    } else if (contentType.includes('text/csv') || contentType.includes('text/plain')) {
      // Direct CSV content
      csvContent = await request.text();
    } else {
      // Assume JSON format (original webhook behavior)
      const data = await request.json();
      const result = await dataIngestionService.ingestSensorReading(data);
      return NextResponse.json(result, {
        status: result.success ? 200 : 400
      });
    }

    // Process CSV content
    if (!csvContent.trim()) {
      return NextResponse.json(
        { success: false, error: 'Empty CSV content' },
        { status: 400 }
      );
    }

    console.log('📊 Processing CSV content, length:', csvContent.length);

    // Parse CSV data
    const lines = csvContent.split('\n').filter(line => line.trim());
    if (lines.length < 2) {
      return NextResponse.json(
        { success: false, error: 'CSV must have header and at least one data row' },
        { status: 400 }
      );
    }

    const header = lines[0].toLowerCase();
    const dataRows = lines.slice(1);

    console.log('📋 CSV header:', header);
    console.log('📊 Data rows:', dataRows.length);

    // Detect CSV format and process accordingly
    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i].trim();
      if (!row) continue;

      try {
        let sensorData: any;

        // Check if this is the new simplified format
        if (header.includes('sensor_id') && header.includes('timestamp')) {
          // Parse simplified format: sensor_id,timestamp,pm25_ugm3,pm10_ugm3,temperature_c,relative_humidity_pct,latitude,longitude,altitude_m
          const values = row.split(',').map(v => v.trim());
          const headerCols = header.split(',').map(h => h.trim());
          
          const rowData: any = {};
          headerCols.forEach((col, idx) => {
            if (values[idx] !== undefined) {
              rowData[col] = values[idx];
            }
          });

          // Transform to expected format
          sensorData = {
            sensor_id: rowData.sensor_id,
            timestamp: rowData.timestamp,
            location: {
              latitude: parseFloat(rowData.latitude),
              longitude: parseFloat(rowData.longitude)
            },
            pm25_ugm3: rowData.pm25_ugm3 ? parseFloat(rowData.pm25_ugm3) : undefined,
            pm10_ugm3: rowData.pm10_ugm3 ? parseFloat(rowData.pm10_ugm3) : undefined,
            temperature_c: rowData.temperature_c ? parseFloat(rowData.temperature_c) : undefined,
            relative_humidity_pct: rowData.relative_humidity_pct ? parseFloat(rowData.relative_humidity_pct) : undefined
          };
        } else {
          // Use existing Pi sensor CSV format
          const piReading = CSVProcessor.parsePiSensorReading(row);
          if (!piReading) {
            errorCount++;
            errors.push(`Row ${i + 1}: Failed to parse Pi sensor format`);
            continue;
          }

          // Transform Pi reading to ingestion format
          sensorData = {
            sensor_id: piReading.from_node,
            timestamp: piReading.datetime,
            location: {
              latitude: piReading.latitude,
              longitude: piReading.longitude
            },
            pm25_ugm3: piReading.pm25Environmental,
            pm10_ugm3: piReading.pm10Environmental,
            temperature_c: piReading.temperature,
            relative_humidity_pct: piReading.relativeHumidity
          };
        }

        // Validate required fields
        if (!sensorData.sensor_id || !sensorData.timestamp || !sensorData.location?.latitude || !sensorData.location?.longitude) {
          errorCount++;
          errors.push(`Row ${i + 1}: Missing required fields (sensor_id, timestamp, latitude, longitude)`);
          continue;
        }

        // Ingest the sensor reading
        const result = await dataIngestionService.ingestSensorReading(sensorData);
        
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push(`Row ${i + 1}: ${result.error}`);
        }

      } catch (error) {
        errorCount++;
        errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        console.error(`Error processing row ${i + 1}:`, error);
      }
    }

    const response = {
      success: successCount > 0,
      processed: successCount,
      errors: errorCount,
      total: dataRows.length,
      message: `Successfully processed ${successCount}/${dataRows.length} sensor readings`,
      errorDetails: errorCount > 0 ? errors.slice(0, 5) : undefined // Only show first 5 errors
    };

    console.log('✅ CSV processing complete:', response);

    return NextResponse.json(response, {
      status: successCount > 0 ? 200 : 400
    });

  } catch (error) {
    console.error('💥 Sensor ingestion error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
} 