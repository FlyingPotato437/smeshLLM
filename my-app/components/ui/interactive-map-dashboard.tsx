'use client'

import React, { useState, useRef, useMemo } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { 
  Upload,
  Home,
  MessageSquare,
  Download,
  MapPin,
  BarChart3,
  Table as TableIcon,
  AlertTriangle,
  Wind,
  Thermometer,
  Droplets,
  Eye
} from 'lucide-react'

interface AirQualityData {
  id: string
  timestamp: Date
  location: string
  latitude: number
  longitude: number
  pm25: number
  pm10: number
  no2: number
  o3: number
  co: number
  so2: number
  aqi: number
  temperature: number
  humidity: number
  windSpeed: number
}

const InteractiveMapDashboard: React.FC = () => {
  const [uploadedData, setUploadedData] = useState<AirQualityData[]>([])
  const [selectedLocation, setSelectedLocation] = useState<AirQualityData | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedView, setSelectedView] = useState('upload')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    setError(null)
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string
        const lines = csv.split('\n')
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase())
        
        // Find column indices
        const getColumnIndex = (columnName: string) => {
          const variants = {
            'timestamp': ['timestamp', 'time', 'date', 'datetime'],
            'location': ['location', 'site', 'station', 'place', 'name'],
            'latitude': ['latitude', 'lat', 'y'],
            'longitude': ['longitude', 'lng', 'lon', 'x'],
            'pm25': ['pm2.5', 'pm25', 'pm_25'],
            'pm10': ['pm10', 'pm_10'],
            'no2': ['no2', 'nitrogen_dioxide'],
            'o3': ['o3', 'ozone'],
            'co': ['co', 'carbon_monoxide'],
            'so2': ['so2', 'sulfur_dioxide'],
            'aqi': ['aqi', 'air_quality_index'],
            'temperature': ['temperature', 'temp', 't'],
            'humidity': ['humidity', 'rh', 'relative_humidity'],
            'windSpeed': ['wind_speed', 'windspeed', 'wind']
          }
          
          const possibleNames = variants[columnName as keyof typeof variants] || [columnName]
          return headers.findIndex(header => 
            possibleNames.some(name => header.includes(name))
          )
        }

        const parsedData: AirQualityData[] = lines.slice(1)
          .filter(line => line.trim())
          .map((line, index) => {
            const values = line.split(',').map(v => v.trim())
            
            return {
              id: `uploaded-${index}`,
              timestamp: new Date(values[getColumnIndex('timestamp')] || Date.now()),
              location: values[getColumnIndex('location')] || `Location ${index + 1}`,
              latitude: parseFloat(values[getColumnIndex('latitude')]) || 0,
              longitude: parseFloat(values[getColumnIndex('longitude')]) || 0,
              pm25: parseFloat(values[getColumnIndex('pm25')]) || 0,
              pm10: parseFloat(values[getColumnIndex('pm10')]) || 0,
              no2: parseFloat(values[getColumnIndex('no2')]) || 0,
              o3: parseFloat(values[getColumnIndex('o3')]) || 0,
              co: parseFloat(values[getColumnIndex('co')]) || 0,
              so2: parseFloat(values[getColumnIndex('so2')]) || 0,
              aqi: parseFloat(values[getColumnIndex('aqi')]) || 0,
              temperature: parseFloat(values[getColumnIndex('temperature')]) || 0,
              humidity: parseFloat(values[getColumnIndex('humidity')]) || 0,
              windSpeed: parseFloat(values[getColumnIndex('windSpeed')]) || 0
            }
          })
          .filter(item => item.latitude !== 0 && item.longitude !== 0) // Filter out invalid coordinates
        
        if (parsedData.length === 0) {
          throw new Error('No valid data with coordinates found. Please ensure your CSV has latitude and longitude columns.')
        }

        setUploadedData(parsedData)
        setSelectedView('map')
        
        // Store in session for AI assistant
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('uploadedAirQualityData', JSON.stringify(parsedData))
        }
      } catch (error: any) {
        setError(error.message || 'Error parsing CSV file. Please check the format and ensure it includes latitude/longitude columns.')
      } finally {
        setIsUploading(false)
      }
    }
    reader.readAsText(file)
  }

  const exportData = () => {
    const csvContent = [
      ['Timestamp', 'Location', 'Latitude', 'Longitude', 'PM2.5', 'PM10', 'NO2', 'O3', 'CO', 'SO2', 'AQI', 'Temperature', 'Humidity', 'Wind Speed'],
      ...uploadedData.map(item => [
        item.timestamp.toISOString(),
        item.location,
        item.latitude,
        item.longitude,
        item.pm25,
        item.pm10,
        item.no2,
        item.o3,
        item.co,
        item.so2,
        item.aqi,
        item.temperature,
        item.humidity,
        item.windSpeed
      ])
    ].map(row => row.join(',')).join('\n')

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'air-quality-data.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const getAqiStatus = (aqi: number) => {
    if (aqi <= 50) return { label: 'Good', color: 'bg-green-500' }
    if (aqi <= 100) return { label: 'Moderate', color: 'bg-yellow-500' }
    if (aqi <= 150) return { label: 'Unhealthy for Sensitive', color: 'bg-orange-500' }
    return { label: 'Unhealthy', color: 'bg-red-500' }
  }

  const mapBounds = useMemo(() => {
    if (uploadedData.length === 0) return null
    
    const lats = uploadedData.map(d => d.latitude)
    const lngs = uploadedData.map(d => d.longitude)
    
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
      centerLat: (Math.min(...lats) + Math.max(...lats)) / 2,
      centerLng: (Math.min(...lngs) + Math.max(...lngs)) / 2
    }
  }, [uploadedData])

  // Upload Required View
  if (uploadedData.length === 0) {
    return (
      <div className="min-h-screen bg-[#111111] p-6">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-4">
              <Button 
                onClick={() => window.location.href = '/'} 
                variant="outline" 
                size="sm"
                className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#2a2a2a] hover:text-white"
              >
                <Home className="h-4 w-4 mr-2" />
                Home
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-white">SMeshLLM Data Explorer</h1>
                <p className="text-gray-400">Upload your air quality data to get started</p>
              </div>
            </div>
          </div>

          {/* Upload Card */}
          <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="bg-[#1a1a1a] border-gray-700 w-full max-w-lg">
              <CardHeader className="text-center">
                <div className="w-16 h-16 bg-[#8C1515] rounded-full flex items-center justify-center mx-auto mb-4">
                  <Upload className="w-8 h-8 text-white" />
                </div>
                <CardTitle className="text-white text-2xl">Upload Your Data</CardTitle>
                <CardDescription className="text-gray-400">
                  Upload a CSV file with air quality data including latitude and longitude coordinates to explore your data on an interactive map.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error && (
                  <Alert className="bg-red-950 border-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <AlertDescription className="text-red-400">{error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-300">Required Columns:</h4>
                  <div className="text-xs text-gray-400 space-y-1">
                    <p>• <strong>Timestamp/Date:</strong> timestamp, time, date, datetime</p>
                    <p>• <strong>Location:</strong> location, site, station, place, name</p>
                    <p>• <strong>Coordinates:</strong> latitude/lat, longitude/lng/lon</p>
                    <p>• <strong>Air Quality:</strong> PM2.5, PM10, NO2, O3, CO, SO2, AQI</p>
                    <p>• <strong>Weather:</strong> temperature, humidity, wind_speed</p>
                  </div>
                </div>

                <div 
                  className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center hover:border-[#8C1515] transition-colors cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-300 mb-2">
                    {isUploading ? 'Processing...' : 'Click to upload or drag and drop'}
                  </p>
                  <p className="text-xs text-gray-500">CSV files only</p>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                    disabled={isUploading}
                  />
                </div>

                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full bg-[#8C1515] hover:bg-[#7A1212] text-white"
                >
                  {isUploading ? 'Processing...' : 'Choose File'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#111111] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => window.location.href = '/'} 
              variant="outline" 
              size="sm"
              className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#2a2a2a] hover:text-white"
            >
              <Home className="h-4 w-4 mr-2" />
              Home
            </Button>
            <div>
              <h1 className="text-3xl font-bold text-white">Data Explorer</h1>
              <p className="text-gray-400">{uploadedData.length} locations loaded</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => window.location.href = '/chat'}
              variant="outline" 
              size="sm"
              className="bg-[#8C1515] border-[#8C1515] text-white hover:bg-[#7A1212] hover:border-[#7A1212]"
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              AI Assistant
            </Button>
            <Button 
              onClick={exportData}
              variant="outline" 
              size="sm"
              className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#2a2a2a] hover:text-white"
            >
              <Download className="h-4 w-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-[#1a1a1a] border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Average AQI</CardTitle>
              <Wind className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Math.round(uploadedData.reduce((sum, item) => sum + item.aqi, 0) / uploadedData.length)}
              </div>
              <p className="text-xs text-gray-400">Across {uploadedData.length} locations</p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">PM2.5 Level</CardTitle>
              <Droplets className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Math.round(uploadedData.reduce((sum, item) => sum + item.pm25, 0) / uploadedData.length)} μg/m³
              </div>
              <p className="text-xs text-gray-400">Average concentration</p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Temperature</CardTitle>
              <Thermometer className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Math.round(uploadedData.reduce((sum, item) => sum + item.temperature, 0) / uploadedData.length)}°C
              </div>
              <p className="text-xs text-gray-400">Average temperature</p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Locations</CardTitle>
              <Eye className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{uploadedData.length}</div>
              <p className="text-xs text-gray-400">Monitoring stations</p>
            </CardContent>
          </Card>
        </div>

        {/* Main Content */}
        <Tabs value={selectedView} onValueChange={setSelectedView}>
          <TabsList className="grid w-full grid-cols-2 bg-[#1a1a1a]">
            <TabsTrigger value="map" className="flex items-center gap-2 data-[state=active]:bg-[#8C1515] data-[state=active]:text-white">
              <MapPin className="h-4 w-4" />
              Interactive Map
            </TabsTrigger>
            <TabsTrigger value="table" className="flex items-center gap-2 data-[state=active]:bg-[#8C1515] data-[state=active]:text-white">
              <TableIcon className="h-4 w-4" />
              Data Table
            </TabsTrigger>
          </TabsList>

          <TabsContent value="map" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Map */}
              <Card className="lg:col-span-2 bg-[#1a1a1a] border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Location Map</CardTitle>
                  <CardDescription className="text-gray-400">
                    Click on a location to view detailed metrics
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-96 bg-[#111111] border border-gray-700 rounded-lg relative overflow-hidden">
                    {/* Simple coordinate-based visualization */}
                    {mapBounds && (
                      <div className="w-full h-full relative">
                        {uploadedData.map((item, index) => {
                          const x = ((item.longitude - mapBounds.minLng) / (mapBounds.maxLng - mapBounds.minLng)) * 100
                          const y = ((mapBounds.maxLat - item.latitude) / (mapBounds.maxLat - mapBounds.minLat)) * 100
                          const status = getAqiStatus(item.aqi)
                          
                          return (
                            <button
                              key={item.id}
                              onClick={() => setSelectedLocation(item)}
                              className="absolute w-4 h-4 rounded-full border-2 border-white cursor-pointer hover:scale-125 transition-transform"
                              style={{
                                left: `${x}%`,
                                top: `${y}%`,
                                backgroundColor: status.color === 'bg-green-500' ? '#10b981' : 
                                                status.color === 'bg-yellow-500' ? '#f59e0b' : 
                                                status.color === 'bg-orange-500' ? '#f97316' : '#ef4444'
                              }}
                              title={`${item.location} - AQI: ${item.aqi}`}
                            />
                          )
                        })}
                        
                        {/* Legend */}
                        <div className="absolute bottom-4 left-4 bg-[#1a1a1a] border border-gray-700 rounded-lg p-3">
                          <h4 className="text-white text-sm font-semibold mb-2">AQI Levels</h4>
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-green-500"></div>
                              <span className="text-gray-300">Good (0-50)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                              <span className="text-gray-300">Moderate (51-100)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                              <span className="text-gray-300">Unhealthy (101-150)</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full bg-red-500"></div>
                              <span className="text-gray-300">Very Unhealthy (150+)</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Location Details */}
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">Location Details</CardTitle>
                  <CardDescription className="text-gray-400">
                    {selectedLocation ? selectedLocation.location : 'Select a location on the map'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {selectedLocation ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-center p-3 bg-[#111111] rounded-lg">
                          <div className="text-lg font-bold text-white">{selectedLocation.aqi}</div>
                          <div className="text-xs text-gray-400">AQI</div>
                          <Badge className={`mt-1 ${getAqiStatus(selectedLocation.aqi).color} text-white`}>
                            {getAqiStatus(selectedLocation.aqi).label}
                          </Badge>
                        </div>
                        <div className="text-center p-3 bg-[#111111] rounded-lg">
                          <div className="text-lg font-bold text-white">{selectedLocation.pm25}</div>
                          <div className="text-xs text-gray-400">PM2.5 μg/m³</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-gray-400">PM10:</span>
                          <span className="text-white">{selectedLocation.pm10} μg/m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">NO2:</span>
                          <span className="text-white">{selectedLocation.no2} μg/m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">O3:</span>
                          <span className="text-white">{selectedLocation.o3} μg/m³</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Temperature:</span>
                          <span className="text-white">{selectedLocation.temperature}°C</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Humidity:</span>
                          <span className="text-white">{selectedLocation.humidity}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Wind Speed:</span>
                          <span className="text-white">{selectedLocation.windSpeed} m/s</span>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-gray-700">
                        <div className="text-xs text-gray-400">
                          <p>Lat: {selectedLocation.latitude.toFixed(6)}</p>
                          <p>Lng: {selectedLocation.longitude.toFixed(6)}</p>
                          <p>Time: {selectedLocation.timestamp.toLocaleString()}</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <MapPin className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                      <p className="text-gray-400">Click on a location marker to view detailed metrics</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="table" className="space-y-4">
            <Card className="bg-[#1a1a1a] border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Data Table</CardTitle>
                <CardDescription className="text-gray-400">
                  Complete dataset with all uploaded measurements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-gray-700">
                        <TableHead className="text-gray-300">Location</TableHead>
                        <TableHead className="text-gray-300">AQI</TableHead>
                        <TableHead className="text-gray-300">PM2.5</TableHead>
                        <TableHead className="text-gray-300">PM10</TableHead>
                        <TableHead className="text-gray-300">Temp</TableHead>
                        <TableHead className="text-gray-300">Coordinates</TableHead>
                        <TableHead className="text-gray-300">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploadedData.slice(0, 50).map((item) => {
                        const status = getAqiStatus(item.aqi)
                        return (
                          <TableRow key={item.id} className="border-gray-700 hover:bg-[#2a2a2a]">
                            <TableCell className="font-medium text-gray-300">{item.location}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="font-mono text-white border-gray-600">
                                {item.aqi}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-mono text-gray-300">{item.pm25} μg/m³</TableCell>
                            <TableCell className="font-mono text-gray-300">{item.pm10} μg/m³</TableCell>
                            <TableCell className="font-mono text-gray-300">{item.temperature}°C</TableCell>
                            <TableCell className="font-mono text-xs text-gray-400">
                              {item.latitude.toFixed(4)}, {item.longitude.toFixed(4)}
                            </TableCell>
                            <TableCell>
                              <Badge className={`${status.color} text-white`}>
                                {status.label}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
                {uploadedData.length > 50 && (
                  <p className="text-gray-400 text-sm mt-4">
                    Showing first 50 of {uploadedData.length} records
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default InteractiveMapDashboard 