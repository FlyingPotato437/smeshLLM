'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Filter, 
  Search, 
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Wind,
  Thermometer,
  Droplets,
  Eye,
  MapPin,
  Upload,
  Home,
  MessageSquare,
  FileSpreadsheet,
  Map as MapIcon,
  BarChart3,
  Grid3X3
} from 'lucide-react'
import { buildLayerDataFromCsv } from '@/lib/utils/air-quality-sample'

// Dynamically import the map component to avoid SSR issues
const InteractiveMap = dynamic(() => import('./interactive-map'), { 
  ssr: false,
  loading: () => <div className="w-full h-96 bg-[#1a1a1a] border border-gray-700 rounded-lg flex items-center justify-center">
    <div className="text-gray-400">Loading map...</div>
  </div>
})

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

interface FilterOptions {
  dateRange: { from: Date | null; to: Date | null }
  location: string
  aqiThreshold: string
}

interface ChartDataPoint {
  time: string
  pm25: number
  pm10: number
  no2: number
  o3: number
  aqi: number
}

const SimpleLineChart: React.FC<{ data: ChartDataPoint[]; metric: string }> = ({ data, metric }) => {
  const maxValue = Math.max(...data.map(d => d[metric as keyof ChartDataPoint] as number))
  const minValue = Math.min(...data.map(d => d[metric as keyof ChartDataPoint] as number))
  const range = maxValue - minValue || 1

  return (
    <div className="w-full h-64 relative bg-[#1a1a1a] border border-gray-700 rounded-lg p-4">
      <div className="absolute inset-4">
        <svg width="100%" height="100%" className="overflow-visible">
          <defs>
            <linearGradient id={`gradient-${metric}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#8C1515" stopOpacity="0.3" />
              <stop offset="100%" stopColor="#8C1515" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {[0, 25, 50, 75, 100].map(percent => (
            <line
              key={percent}
              x1="0"
              y1={`${percent}%`}
              x2="100%"
              y2={`${percent}%`}
              stroke="#374151"
              strokeWidth="1"
              opacity="0.3"
            />
          ))}
          
          <polyline
            fill="none"
            stroke="#8C1515"
            strokeWidth="2"
            points={data.map((point, index) => {
              const x = (index / (data.length - 1)) * 100
              const y = 100 - ((point[metric as keyof ChartDataPoint] as number - minValue) / range) * 100
              return `${x},${y}`
            }).join(' ')}
          />
          
          <polygon
            fill={`url(#gradient-${metric})`}
            points={`0,100 ${data.map((point, index) => {
              const x = (index / (data.length - 1)) * 100
              const y = 100 - ((point[metric as keyof ChartDataPoint] as number - minValue) / range) * 100
              return `${x},${y}`
            }).join(' ')} 100,100`}
          />
          
          {data.map((point, index) => {
            const x = (index / (data.length - 1)) * 100
            const y = 100 - ((point[metric as keyof ChartDataPoint] as number - minValue) / range) * 100
            return (
              <circle
                key={index}
                cx={`${x}%`}
                cy={`${y}%`}
                r="3"
                fill="#8C1515"
                className="hover:r-4 transition-all cursor-pointer"
              />
            )
          })}
        </svg>
      </div>
      
      <div className="absolute left-0 top-4 bottom-4 flex flex-col justify-between text-xs text-gray-400">
        <span>{Math.round(maxValue)}</span>
        <span>{Math.round(minValue)}</span>
      </div>
      
      <div className="absolute bottom-0 left-4 right-4 flex justify-between text-xs text-gray-400">
        <span>{data[0]?.time}</span>
        <span>{data[Math.floor(data.length / 2)]?.time}</span>
        <span>{data[data.length - 1]?.time}</span>
      </div>
    </div>
  )
}

const UploadDataPrompt: React.FC<{ onFileUpload: (file: File) => void; isUploading: boolean }> = ({ onFileUpload, isUploading }) => {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      onFileUpload(file)
    }
  }

  return (
    <div className="min-h-screen bg-[#111111] p-6 flex items-center justify-center">
      <div className="max-w-2xl mx-auto text-center">
        {/* Home Button */}
        <div className="w-full flex justify-start mb-8">
          <Link
            href="/"
            className="flex items-center gap-2 text-gray-400 hover:text-[#8C1515] transition-colors text-sm"
          >
            <Home className="w-4 h-4" />
            Back to Home
          </Link>
        </div>

        <Card className="bg-[#1a1a1a] border-gray-700">
          <CardHeader className="text-center">
            <div className="w-16 h-16 bg-[#8C1515] rounded-full flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="w-8 h-8 text-white" />
            </div>
            <CardTitle className="text-2xl text-white">Upload Your Air Quality Data</CardTitle>
            <CardDescription className="text-gray-400">
              Upload a CSV file with your air quality data to access the Data Explorer and interactive map features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 hover:border-[#8C1515] transition-colors">
              <div className="text-center">
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-300 mb-2">
                  Drag and drop your CSV file here, or click to browse
                </p>
                <p className="text-sm text-gray-500 mb-4">
                  Expected format: datetime, fromNode, pm10Standard, pm25Standard, pm100Standard, pm10Environmental, pm25Environmental, pm100Environmental, rxSnr, rxRssi, rxTime, hopStart, hopLimit
                </p>
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="bg-[#8C1515] text-white hover:bg-[#7A1212]"
                >
                  {isUploading ? 'Uploading...' : 'Select CSV File'}
                </Button>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>

            <div className="bg-[#2a2a2a] rounded-lg p-4">
              <h3 className="text-lg font-semibold text-white mb-2">Sample Data Format</h3>
              <div className="bg-[#111111] rounded p-3 font-mono text-sm text-gray-300 overflow-x-auto">
                <div>datetime,fromNode,pm10Standard,pm25Standard,pm100Standard,pm10Environmental,pm25Environmental,pm100Environmental,rxSnr,rxRssi,rxTime,hopStart,hopLimit</div>
                <div>2026-01-25 13:59:00.437537,0x433abf20,4,6,6,4,6,6,5.5,-87,,3,3</div>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <Button 
                onClick={() => window.location.href = '/chat'}
                variant="outline" 
                className="bg-transparent border-[#8C1515] text-[#8C1515] hover:bg-[#8C1515] hover:text-white"
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Try AI Assistant
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

const EnhancedAirQualityDashboard: React.FC = () => {
  const [data, setData] = useState<AirQualityData[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasUploadedData, setHasUploadedData] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const [sortField, setSortField] = useState<keyof AirQualityData>('timestamp')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, setSearchTerm] = useState('')
  const [filters, setFilters] = useState<FilterOptions>({
    dateRange: { from: null, to: null },
    location: 'all',
    aqiThreshold: 'all'
  })
  const [selectedView, setSelectedView] = useState('table')

  const itemsPerPage = 10

  // Check if data was previously uploaded
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedData = sessionStorage.getItem('uploadedAirQualityData')
      if (storedData) {
        try {
          const parsedData = JSON.parse(storedData)
          if (parsedData && parsedData.length > 0) {
            setData(parsedData.map((item: any) => ({
              ...item,
              timestamp: new Date(item.timestamp)
            })))
            setHasUploadedData(true)
          }
        } catch (error) {
          console.error('Error loading stored data:', error)
        }
      }
    }
  }, [])

  const handleFileUpload = async (file: File) => {
    setIsUploading(true)
    setError(null)

    try {
      const text = await file.text()
      const lines = text.split('\n')
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase())

      const isMeshtasticFormat = headers.includes('fromnode') || headers.includes('from_node')
      if (isMeshtasticFormat) {
        const mapped = buildLayerDataFromCsv(text)
        const parsedData: AirQualityData[] = mapped.smokePoints.map((point, index) => ({
          id: `uploaded-${index}`,
          timestamp: point.timestamp,
          location: `Sensor ${(index % Math.max(1, mapped.sensors.length)) + 1}`,
          latitude: point.position[1],
          longitude: point.position[0],
          pm25: point.pm25 ?? point.concentration ?? 0,
          pm10: point.pm10 ?? 0,
          no2: 0,
          o3: 0,
          co: 0,
          so2: 0,
          aqi: Math.round((point.pm25 ?? point.concentration ?? 0) * 2),
          temperature: mapped.meteorology.temperature - 273.15,
          humidity: mapped.meteorology.humidity,
          windSpeed: mapped.meteorology.windSpeed
        }))

        if (parsedData.length === 0) {
          throw new Error('No valid rows found in Meshtastic-format CSV.')
        }

        setData(parsedData)
        setHasUploadedData(true)
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('uploadedAirQualityData', JSON.stringify(parsedData))
        }
        return
      }
      
      const requiredFields = ['timestamp', 'location', 'latitude', 'longitude', 'pm25', 'aqi']
      const missingFields = requiredFields.filter(field => 
        !headers.some(header => header.includes(field))
      )
      
      if (missingFields.length > 0) {
        throw new Error(`Missing required fields: ${missingFields.join(', ')}`)
      }

      const parsedData: AirQualityData[] = lines.slice(1)
        .filter(line => line.trim())
        .map((line, index) => {
          const values = line.split(',').map(v => v.trim())
          
          return {
            id: `uploaded-${index}`,
            timestamp: new Date(values[0] || Date.now()),
            location: values[1] || 'Unknown',
            latitude: parseFloat(values[2]) || 0,
            longitude: parseFloat(values[3]) || 0,
            pm25: parseFloat(values[4]) || 0,
            pm10: parseFloat(values[5]) || 0,
            no2: parseFloat(values[6]) || 0,
            o3: parseFloat(values[7]) || 0,
            co: parseFloat(values[8]) || 0,
            so2: parseFloat(values[9]) || 0,
            aqi: parseFloat(values[10]) || 0,
            temperature: parseFloat(values[11]) || 0,
            humidity: parseFloat(values[12]) || 0,
            windSpeed: parseFloat(values[13]) || 0
          }
        })
        .filter(item => item.latitude !== 0 && item.longitude !== 0) // Filter out invalid coordinates

      if (parsedData.length === 0) {
        throw new Error('No valid data rows found. Please check your CSV format.')
      }

      setData(parsedData)
      setHasUploadedData(true)
      
      // Store in session for AI assistant
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('uploadedAirQualityData', JSON.stringify(parsedData))
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Error parsing CSV file')
    } finally {
      setIsUploading(false)
    }
  }

  const filteredData = useMemo(() => {
    return data.filter(item => {
      const matchesSearch = item.location.toLowerCase().includes(searchTerm.toLowerCase())
      const matchesLocation = filters.location === 'all' || item.location === filters.location
      const matchesDateRange = (!filters.dateRange.from || item.timestamp >= filters.dateRange.from) &&
                              (!filters.dateRange.to || item.timestamp <= filters.dateRange.to)
      const matchesAqiThreshold = filters.aqiThreshold === 'all' ||
                                 (filters.aqiThreshold === 'good' && item.aqi <= 50) ||
                                 (filters.aqiThreshold === 'moderate' && item.aqi > 50 && item.aqi <= 100) ||
                                 (filters.aqiThreshold === 'unhealthy' && item.aqi > 100)

      return matchesSearch && matchesLocation && matchesDateRange && matchesAqiThreshold
    })
  }, [data, searchTerm, filters])

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      const aValue = a[sortField]
      const bValue = b[sortField]
      
      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1
      return 0
    })
  }, [filteredData, sortField, sortDirection])

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage
    return sortedData.slice(startIndex, startIndex + itemsPerPage)
  }, [sortedData, currentPage])

  const totalPages = Math.ceil(sortedData.length / itemsPerPage)

  const chartData: ChartDataPoint[] = useMemo(() => {
    return data.slice(0, 24).reverse().map(item => ({
      time: item.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      pm25: item.pm25,
      pm10: item.pm10,
      no2: item.no2,
      o3: item.o3,
      aqi: item.aqi
    }))
  }, [data])

  const getAqiStatus = (aqi: number) => {
    if (aqi <= 50) return { label: 'Good', color: 'bg-green-500' }
    if (aqi <= 100) return { label: 'Moderate', color: 'bg-yellow-500' }
    if (aqi <= 150) return { label: 'Unhealthy for Sensitive', color: 'bg-orange-500' }
    return { label: 'Unhealthy', color: 'bg-red-500' }
  }

  const handleSort = (field: keyof AirQualityData) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('asc')
    }
  }

  const exportData = () => {
    const csvContent = [
      ['Timestamp', 'Location', 'Latitude', 'Longitude', 'PM2.5', 'PM10', 'NO2', 'O3', 'CO', 'SO2', 'AQI', 'Temperature', 'Humidity', 'Wind Speed'],
      ...sortedData.map(item => [
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

  // Show upload prompt if no data is uploaded
  if (!hasUploadedData) {
    return <UploadDataPrompt onFileUpload={handleFileUpload} isUploading={isUploading} />
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#111111] p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-8 w-64 bg-gray-700" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 bg-gray-700" />
            ))}
          </div>
          <Skeleton className="h-96 bg-gray-700" />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#111111] p-6 flex items-center justify-center">
        <Alert className="max-w-md bg-[#1a1a1a] border-red-800">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-400">{error}</AlertDescription>
        </Alert>
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
              <h1 className="text-3xl font-bold text-white">SMeshLLM Data Explorer</h1>
              <p className="text-gray-400">Interactive analysis of your uploaded air quality data ({data.length} records)</p>
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
          <Card className="bg-[#1a1a1a] border-gray-700 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Average AQI</CardTitle>
              <Wind className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Math.round(data.reduce((sum, item) => sum + item.aqi, 0) / data.length || 0)}
              </div>
              <p className="text-xs text-gray-400">
                <MapPin className="inline h-3 w-3 mr-1" />
                {Array.from(new Set(data.map(d => d.location))).length} locations
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">PM2.5 Level</CardTitle>
              <Droplets className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Math.round(data.reduce((sum, item) => sum + item.pm25, 0) / data.length || 0)} μg/m³
              </div>
              <p className="text-xs text-gray-400">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                Across all stations
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Temperature</CardTitle>
              <Thermometer className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Math.round(data.reduce((sum, item) => sum + item.temperature, 0) / data.length || 0)}°C
              </div>
              <p className="text-xs text-gray-400">
                <Eye className="inline h-3 w-3 mr-1" />
                Average reading
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Data Points</CardTitle>
              <Eye className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {data.length}
              </div>
              <p className="text-xs text-gray-400">
                <FileSpreadsheet className="inline h-3 w-3 mr-1" />
                Uploaded records
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="bg-[#1a1a1a] border-gray-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-white">
              <Filter className="h-5 w-5" />
              Filters & Search
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-gray-300">Search Location</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search locations..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9 bg-[#2a2a2a] border-gray-600 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Location</Label>
                <Select value={filters.location} onValueChange={(value) => setFilters(prev => ({ ...prev, location: value }))}>
                  <SelectTrigger className="bg-[#2a2a2a] border-gray-600 text-white">
                    <SelectValue placeholder="All locations" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-gray-600">
                    <SelectItem value="all">All Locations</SelectItem>
                    {Array.from(new Set(data.map(d => d.location))).map(location => (
                      <SelectItem key={location} value={location}>{location}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">AQI Level</Label>
                <Select value={filters.aqiThreshold} onValueChange={(value) => setFilters(prev => ({ ...prev, aqiThreshold: value }))}>
                  <SelectTrigger className="bg-[#2a2a2a] border-gray-600 text-white">
                    <SelectValue placeholder="All levels" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#2a2a2a] border-gray-600">
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="good">Good (0-50)</SelectItem>
                    <SelectItem value="moderate">Moderate (51-100)</SelectItem>
                    <SelectItem value="unhealthy">Unhealthy (101+)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs value={selectedView} onValueChange={setSelectedView}>
          <TabsList className="grid w-full grid-cols-3 bg-[#1a1a1a] border border-gray-700">
            <TabsTrigger value="table" className="flex items-center gap-2 data-[state=active]:bg-[#8C1515] data-[state=active]:text-white">
              <Grid3X3 className="h-4 w-4" />
              Table View
            </TabsTrigger>
            <TabsTrigger value="charts" className="flex items-center gap-2 data-[state=active]:bg-[#8C1515] data-[state=active]:text-white">
              <BarChart3 className="h-4 w-4" />
              Charts
            </TabsTrigger>
            <TabsTrigger value="map" className="flex items-center gap-2 data-[state=active]:bg-[#8C1515] data-[state=active]:text-white">
              <MapIcon className="h-4 w-4" />
              Interactive Map
            </TabsTrigger>
          </TabsList>

          <TabsContent value="table" className="space-y-4">
            <Card className="bg-[#1a1a1a] border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Air Quality Data</CardTitle>
                <CardDescription className="text-gray-400">
                  Showing {paginatedData.length} of {sortedData.length} records
                </CardDescription>
              </CardHeader>
              <CardContent>
                {sortedData.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-400">No data matches your current filters.</p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-gray-700">
                            <TableHead 
                              className="cursor-pointer hover:bg-[#2a2a2a] transition-colors text-gray-300"
                              onClick={() => handleSort('timestamp')}
                            >
                              Timestamp {sortField === 'timestamp' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </TableHead>
                            <TableHead 
                              className="cursor-pointer hover:bg-[#2a2a2a] transition-colors text-gray-300"
                              onClick={() => handleSort('location')}
                            >
                              Location {sortField === 'location' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </TableHead>
                            <TableHead 
                              className="cursor-pointer hover:bg-[#2a2a2a] transition-colors text-gray-300"
                              onClick={() => handleSort('aqi')}
                            >
                              AQI {sortField === 'aqi' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </TableHead>
                            <TableHead 
                              className="cursor-pointer hover:bg-[#2a2a2a] transition-colors text-gray-300"
                              onClick={() => handleSort('pm25')}
                            >
                              PM2.5 {sortField === 'pm25' && (sortDirection === 'asc' ? '↑' : '↓')}
                            </TableHead>
                            <TableHead className="text-gray-300">Coordinates</TableHead>
                            <TableHead className="text-gray-300">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedData.map((item) => {
                            const status = getAqiStatus(item.aqi)
                            return (
                              <TableRow key={item.id} className="hover:bg-[#2a2a2a] transition-colors border-gray-700">
                                <TableCell className="font-mono text-sm text-gray-300">
                                  {item.timestamp.toLocaleString()}
                                </TableCell>
                                <TableCell className="font-medium text-gray-200">{item.location}</TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-mono border-gray-600 text-gray-300">
                                    {item.aqi}
                                  </Badge>
                                </TableCell>
                                <TableCell className="font-mono text-gray-300">{item.pm25} μg/m³</TableCell>
                                <TableCell className="font-mono text-sm text-gray-400">
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

                    {/* Pagination */}
                    <div className="flex items-center justify-between pt-4">
                      <div className="text-sm text-gray-400">
                        Page {currentPage} of {totalPages}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          disabled={currentPage === 1}
                          className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#2a2a2a]"
                        >
                          <ChevronLeft className="h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#2a2a2a]"
                        >
                          Next
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="charts" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">PM2.5 Trend</CardTitle>
                  <CardDescription className="text-gray-400">Recent measurements</CardDescription>
                </CardHeader>
                <CardContent>
                  <SimpleLineChart data={chartData} metric="pm25" />
                </CardContent>
              </Card>

              <Card className="bg-[#1a1a1a] border-gray-700">
                <CardHeader>
                  <CardTitle className="text-white">AQI Trend</CardTitle>
                  <CardDescription className="text-gray-400">Recent measurements</CardDescription>
                </CardHeader>
                <CardContent>
                  <SimpleLineChart data={chartData} metric="aqi" />
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="map" className="space-y-4">
            <Card className="bg-[#1a1a1a] border-gray-700">
              <CardHeader>
                <CardTitle className="text-white">Interactive Map</CardTitle>
                <CardDescription className="text-gray-400">
                  Click on markers to view detailed air quality metrics for each location
                </CardDescription>
              </CardHeader>
              <CardContent>
                <InteractiveMap data={filteredData} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

export default EnhancedAirQualityDashboard 
