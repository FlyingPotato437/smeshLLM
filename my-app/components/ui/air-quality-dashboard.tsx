'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { 
  Download, 
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
  MessageSquare
} from 'lucide-react'

interface AirQualityData {
  id: string
  timestamp: Date
  location: string
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
  pollutant: string
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

const generateMockData = (): AirQualityData[] => {
  const locations = ['Downtown', 'Industrial Area', 'Residential Zone', 'Park District', 'Highway Junction']
  const data: AirQualityData[] = []
  
  for (let i = 0; i < 100; i++) {
    const timestamp = new Date(Date.now() - i * 3600000)
    const location = locations[Math.floor(Math.random() * locations.length)]
    
    data.push({
      id: `data-${i}`,
      timestamp,
      location,
      pm25: Math.round(Math.random() * 50 + 10),
      pm10: Math.round(Math.random() * 80 + 20),
      no2: Math.round(Math.random() * 40 + 5),
      o3: Math.round(Math.random() * 60 + 10),
      co: Math.round(Math.random() * 15 + 1),
      so2: Math.round(Math.random() * 20 + 2),
      aqi: Math.round(Math.random() * 150 + 50),
      temperature: Math.round(Math.random() * 20 + 15),
      humidity: Math.round(Math.random() * 40 + 40),
      windSpeed: Math.round(Math.random() * 15 + 2)
    })
  }
  
  return data.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
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

const AirQualityDashboard: React.FC = () => {
  const [data, setData] = useState<AirQualityData[]>([])
  const [uploadedData, setUploadedData] = useState<AirQualityData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [_currentPage, _setCurrentPage] = useState(1)
  const [_sortField, _setSortField] = useState<keyof AirQualityData>('timestamp')
  const [_sortDirection, _setSortDirection] = useState<'asc' | 'desc'>('desc')
  const [searchTerm, _setSearchTerm] = useState('')
  const [filters, _setFilters] = useState<FilterOptions>({
    dateRange: { from: null, to: null },
    location: 'all',
    pollutant: 'all',
    aqiThreshold: 'all'
  })
  const [_realTimeEnabled, _setRealTimeEnabled] = useState(false)
  const [_selectedView, _setSelectedView] = useState('table')
  const [_isUploading, setIsUploading] = useState(false)
  const _fileInputRef = useRef<HTMLInputElement>(null)

  const _itemsPerPage = 10

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        await new Promise(resolve => setTimeout(resolve, 1000))
        const mockData = generateMockData()
        setData(mockData)
        setError(null)
      } catch (err) {
        setError('Failed to load air quality data. Please try again.')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [])

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsUploading(true)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const csv = e.target?.result as string
        const lines = csv.split('\n')
        const headers = lines[0].split(',').map(h => h.trim())
        
        const parsedData: AirQualityData[] = lines.slice(1)
          .filter(line => line.trim())
          .map((line, index) => {
            const values = line.split(',').map(v => v.trim())
            return {
              id: `uploaded-${index}`,
              timestamp: new Date(values[0] || Date.now()),
              location: values[1] || 'Unknown',
              pm25: parseFloat(values[2]) || 0,
              pm10: parseFloat(values[3]) || 0,
              no2: parseFloat(values[4]) || 0,
              o3: parseFloat(values[5]) || 0,
              co: parseFloat(values[6]) || 0,
              so2: parseFloat(values[7]) || 0,
              aqi: parseFloat(values[8]) || 0,
              temperature: parseFloat(values[9]) || 0,
              humidity: parseFloat(values[10]) || 0,
              windSpeed: parseFloat(values[11]) || 0
            }
          })
        
        setUploadedData(parsedData)
        setData(prev => [...parsedData, ...prev])
        setError(null)
        
        // Store in session for AI assistant
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('uploadedAirQualityData', JSON.stringify(parsedData))
        }
      } catch (error) {
        setError('Error parsing CSV file. Please check the format.')
      } finally {
        setIsUploading(false)
      }
    }
    reader.readAsText(file)
  }

  const combinedData = useMemo(() => {
    return [...uploadedData, ...data]
  }, [uploadedData, data])

  const filteredData = useMemo(() => {
    return combinedData.filter(item => {
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
  }, [combinedData, searchTerm, filters])

  const chartData: ChartDataPoint[] = useMemo(() => {
    return combinedData.slice(0, 24).reverse().map(item => ({
      time: item.timestamp.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      pm25: item.pm25,
      pm10: item.pm10,
      no2: item.no2,
      o3: item.o3,
      aqi: item.aqi
    }))
  }, [combinedData])

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
              <p className="text-gray-400">Real-time environmental monitoring and analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Label htmlFor="file-upload" className="cursor-pointer">
              <Button variant="outline" size="sm" className="bg-[#1a1a1a] border-gray-700 text-gray-300 hover:bg-[#2a2a2a] hover:text-white" asChild>
                <span>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload CSV
                </span>
              </Button>
              <Input
                id="file-upload"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </Label>
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
                {Math.round(combinedData.reduce((sum, item) => sum + item.aqi, 0) / combinedData.length || 0)}
              </div>
              <p className="text-xs text-gray-400">
                <TrendingDown className="inline h-3 w-3 mr-1" />
                2.5% from last hour
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
                {Math.round(combinedData.reduce((sum, item) => sum + item.pm25, 0) / combinedData.length || 0)} μg/m³
              </div>
              <p className="text-xs text-gray-400">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                1.2% from last hour
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
                {Math.round(combinedData.reduce((sum, item) => sum + item.temperature, 0) / combinedData.length || 0)}°C
              </div>
              <p className="text-xs text-gray-400">
                <TrendingUp className="inline h-3 w-3 mr-1" />
                0.8% from last hour
              </p>
            </CardContent>
          </Card>

          <Card className="bg-[#1a1a1a] border-gray-700 transition-all hover:shadow-md">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-gray-300">Data Sources</CardTitle>
              <Eye className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">
                {Array.from(new Set(combinedData.map(d => d.location))).length}
              </div>
              <p className="text-xs text-gray-400">
                <MapPin className="inline h-3 w-3 mr-1" />
                {uploadedData.length > 0 && `${uploadedData.length} uploaded`}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <Card className="bg-[#1a1a1a] border-gray-700">
          <CardHeader>
            <CardTitle className="text-white">PM2.5 Trend Analysis</CardTitle>
            <CardDescription className="text-gray-400">Real-time air quality monitoring</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleLineChart data={chartData} metric="pm25" />
          </CardContent>
        </Card>

        {/* AI Assistant Integration */}
        <Card className="bg-[#1a1a1a] border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <span className="text-[#8C1515]">🔥</span>
              AI Assistant Ready
            </CardTitle>
            <CardDescription className="text-gray-400">
              Your data is now available for AI analysis. Ask questions about patterns, trends, or get insights.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Button 
                className="bg-[#8C1515] text-white hover:bg-[#7A1212]"
                onClick={() => window.location.href = '/chat'}
              >
                Start AI Analysis
              </Button>
              <Button 
                variant="outline"
                className="bg-transparent border-gray-700 text-gray-300 hover:bg-[#2a2a2a] hover:text-white"
              >
                View Suggestions
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default AirQualityDashboard 