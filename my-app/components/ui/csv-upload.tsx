'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileText, CheckCircle, AlertCircle, X, UploadCloud } from 'lucide-react';

interface CSVUploadProps {
  onDataUploaded?: (data: any) => void;
  onSessionCreated?: (sessionId: string) => void;
  className?: string;
}

interface ParsedCSVData {
  headers: string[];
  rows: any[];
  filename: string;
}

export const CSVUpload: React.FC<CSVUploadProps> = ({
  onDataUploaded,
  onSessionCreated,
  className = ''
}) => {
  const [csvData, setCsvData] = useState<ParsedCSVData | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentStage, setCurrentStage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Simple CSV parser
  const parseCSV = (content: string, filename: string): ParsedCSVData => {
    const lines = content.trim().split('\n');
    if (lines.length === 0) {
      throw new Error('CSV file is empty');
    }

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = lines.slice(1).map((line, index) => {
      const values = line.split(',').map(v => v.trim());
      if (values.length !== headers.length) {
        console.warn(`Row ${index + 1} has ${values.length} columns, expected ${headers.length}`);
      }
      
      const row: any = {};
      headers.forEach((header, i) => {
        row[header] = values[i] || '';
      });
      return row;
    });

    return { headers, rows, filename };
  };

  // Generate simple session ID
  const generateSessionId = () => {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  };

  // Progress tracking function
  const updateProgress = (stage: string, percent: number) => {
    setCurrentStage(stage);
    setUploadProgress(percent);
    console.log(`📊 ${stage}: ${percent}%`);
  };

  // File processing function
  const processFile = async (file: File) => {
    setIsUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');
    setUploadProgress(0);

    try {
      updateProgress('Validating file', 10);
      console.log('📁 Starting file upload:', file.name, 'Size:', file.size);
      
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.csv')) {
        throw new Error('Please upload a CSV file');
      }

      // Check file size (max 20MB)
      if (file.size > 20 * 1024 * 1024) {
        throw new Error('File size must be less than 20MB');
      }

      // Show file size info
      const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
      console.log(`📏 File size: ${fileSizeMB}MB`);

      updateProgress('Reading file content', 20);
      console.log('📖 Reading file content...');
      const content = await file.text();
      console.log('📄 File content length:', content.length);
      
      if (!content.trim()) {
        throw new Error('File appears to be empty');
      }

      updateProgress('Parsing CSV data', 30);
      console.log('🔄 Parsing CSV for preview...');
      const parsedData = parseCSV(content, file.name);
      console.log('📊 Parsed data (first pass):', parsedData.rows.length, 'rows');

      // For large files, limit preview data
      const previewRows = parsedData.rows.length > 10000 ? 
        parsedData.rows.slice(0, 10000) : parsedData.rows;
      
      if (parsedData.rows.length > 10000) {
        console.log(`📋 Large file detected (${parsedData.rows.length} rows), limiting preview to 10,000 rows`);
      }

      // Generate session ID for front-end preview only
      const newSessionId = generateSessionId();
      setSessionId(newSessionId);

      updateProgress('Uploading to server', 40);
      console.log(`⬆️ Uploading ${fileSizeMB}MB file to server for ingestion…`);

      // Create a XMLHttpRequest for progress tracking
      const uploadPromise = new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progressPercent = Math.round((event.loaded / event.total) * 30) + 40; // 40-70%
            updateProgress('Uploading to server', progressPercent);
          }
        });

        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const result = JSON.parse(xhr.responseText);
              resolve(result);
            } catch (e) {
              reject(new Error('Invalid server response'));
            }
          } else {
            try {
              const error = JSON.parse(xhr.responseText);
              reject(new Error(error.error || 'Upload failed'));
            } catch (e) {
              reject(new Error(`Server error: ${xhr.status}`));
            }
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Network error during upload'));
        });

        xhr.open('POST', '/api/upload-csv');
        xhr.setRequestHeader('Content-Type', 'text/csv');
        xhr.setRequestHeader('X-Session-Id', newSessionId);
        xhr.setRequestHeader('X-Filename', file.name);
        xhr.send(content);
      });

      const uploadResult = await uploadPromise;
      updateProgress('Processing data', 80);
      console.log('✅ CSV ingested:', uploadResult);
      
      // Check if data was successfully inserted into database
      if (uploadResult.success && uploadResult.inserted > 0) {
        console.log(`🎉 Successfully inserted ${uploadResult.inserted} records into database!`);
        setErrorMessage(`✅ Success! ${uploadResult.inserted} records inserted into database.`);
      } else if (uploadResult.success && uploadResult.inserted === 0) {
        console.warn('⚠️ Upload succeeded but no records were inserted into database');
        setErrorMessage('⚠️ Upload completed but no records were saved to database. Check server logs.');
      }

      // Optional: push a lightweight copy to session-data so dashboard can preview
      try {
        updateProgress('Saving preview data', 90);
        console.log('📋 Saving preview data to session...');
        const sessionResponse = await fetch('/api/session-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: newSessionId,
            csvData: previewRows.slice(0, 1000), // Always limit session data to 1000 rows
            headers: parsedData.headers,
            filename: parsedData.filename
          })
        });
        
        if (!sessionResponse.ok) {
          console.warn('⚠️ Session data storage failed (non-critical):', await sessionResponse.text());
        } else {
          console.log('✅ Session data saved');
        }
      } catch (sessionError) {
        console.warn('⚠️ Session data storage failed (non-critical):', sessionError);
      }

      updateProgress('Complete', 100);
      
      // Update state
      setCsvData({
        ...parsedData,
        rows: previewRows // Use preview data for UI
      });
      setUploadStatus('success');
      
      // Call callbacks
      if (onDataUploaded) {
        onDataUploaded(parsedData);
      }
      
      if (onSessionCreated) {
        onSessionCreated(newSessionId);
      }

    } catch (error) {
      console.error('💥 Upload error:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to upload file');
      setUploadStatus('error');
      setUploadProgress(0);
    } finally {
      setIsUploading(false);
      setTimeout(() => {
        setUploadProgress(0);
        setCurrentStage('');
      }, 2000);
    }
  };

  // File upload handler
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  // Drag and drop handlers
  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);

    const files = Array.from(event.dataTransfer.files);
    const csvFile = files.find(file => file.name.toLowerCase().endsWith('.csv'));
    
    if (!csvFile) {
      setErrorMessage('Please drop a CSV file');
      setUploadStatus('error');
      return;
    }

    if (files.length > 1) {
      setErrorMessage('Please drop only one CSV file at a time');
      setUploadStatus('error');
      return;
    }

    await processFile(csvFile);
  }, []);

  // Clear data
  const handleClear = () => {
    setCsvData(null);
    setSessionId(null);
    setUploadStatus('idle');
    setErrorMessage('');
    setUploadProgress(0);
    setCurrentStage('');
    
    // Clear file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Click to select file
  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Upload Area */}
      <Card className="bg-[#1a1a1a] border-gray-700">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="mb-4">
              <div
                onClick={handleClick}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`cursor-pointer inline-flex flex-col items-center gap-3 p-8 border-2 border-dashed transition-all duration-200 w-full relative overflow-hidden ${
                  isDragOver 
                    ? 'border-[#8C1515] bg-[#8C1515]/10 scale-[1.02]' 
                    : isUploading 
                    ? 'border-blue-500 bg-blue-500/10' 
                    : 'border-gray-600 hover:border-[#8C1515] hover:bg-[#8C1515]/5'
                }`}
              >
                {isUploading ? (
                  <>
                    <UploadCloud className="w-12 h-12 text-blue-400 animate-bounce" />
                    <div className="space-y-2">
                      <span className="text-blue-400 font-medium">{currentStage}</span>
                      <div className="w-64 bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300 ease-out"
                          style={{ width: `${uploadProgress}%` }}
                        />
                      </div>
                      <span className="text-blue-300 text-sm">{uploadProgress}%</span>
                    </div>
                  </>
                ) : isDragOver ? (
                  <>
                    <UploadCloud className="w-12 h-12 text-[#8C1515] animate-pulse" />
                    <span className="text-[#8C1515] font-medium text-lg">Drop your CSV file here</span>
                    <span className="text-gray-300 text-sm">Release to upload</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-10 h-10 text-gray-400" />
                    <div className="space-y-1">
                      <span className="text-white font-medium text-lg">Drag & drop your CSV file</span>
                      <span className="text-gray-400 text-sm">or click to browse</span>
                    </div>
                    <span className="text-gray-500 text-xs">Support for sensor data with coordinates (max 20MB)</span>
                  </>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
            </div>

            {/* Upload Status */}
            {uploadStatus === 'error' && errorMessage && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/30 p-3 rounded">
                <AlertCircle className="w-4 h-4" />
                <span>{errorMessage}</span>
              </div>
            )}

            {uploadStatus === 'success' && csvData && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-green-400 bg-green-400/10 border border-green-400/30 p-3 rounded">
                  <CheckCircle className="w-4 h-4" />
                  <span>CSV uploaded successfully!</span>
                </div>

                {/* Data Summary */}
                <div className="bg-[#111111] border border-gray-700 p-4 rounded">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-[#8C1515]" />
                      <span className="text-white font-medium">{csvData.filename}</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClear}
                      className="border-gray-600 text-gray-400 hover:text-white"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Clear
                    </Button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400">Rows:</span>
                      <span className="text-white ml-2">{csvData.rows.length.toLocaleString()}</span>
                    </div>
                    <div>
                      <span className="text-gray-400">Columns:</span>
                      <span className="text-white ml-2">{csvData.headers.length}</span>
                    </div>
                  </div>

                  {/* Column Preview */}
                  <div className="mt-3">
                    <div className="text-gray-400 text-sm mb-1">Columns:</div>
                    <div className="flex flex-wrap gap-1">
                      {csvData.headers.map((header, index) => (
                        <span
                          key={index}
                          className="text-xs bg-[#8C1515]/20 text-[#8C1515] px-2 py-1 border border-[#8C1515]/30 rounded"
                        >
                          {header}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Data Preview */}
                  {csvData.rows.length > 0 && (
                    <div className="mt-3">
                      <div className="text-gray-400 text-sm mb-1">First Row Preview:</div>
                      <div className="bg-[#0a0a0a] border border-gray-800 p-2 text-xs text-gray-300 font-mono overflow-x-auto rounded">
                        {JSON.stringify(csvData.rows[0], null, 2)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Session Info */}
      {sessionId && (
        <Card className="bg-[#1a1a1a] border-gray-700">
          <CardContent className="p-4">
            <div className="text-sm">
              <span className="text-gray-400">Session ID:</span>
              <span className="text-white ml-2 font-mono">{sessionId}</span>
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Data will be available for 24 hours and can be used by AI assistant
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}; 