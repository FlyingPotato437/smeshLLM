'use client'

import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

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

interface InteractiveMapProps {
  data: AirQualityData[]
}

const InteractiveMap: React.FC<InteractiveMapProps> = ({ data }) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)

  const getMarkerColor = (aqi: number) => {
    if (aqi <= 50) return '#22c55e' // Green - Good
    if (aqi <= 100) return '#eab308' // Yellow - Moderate  
    if (aqi <= 150) return '#f97316' // Orange - Unhealthy for Sensitive
    return '#ef4444' // Red - Unhealthy
  }

  const getAqiStatus = (aqi: number) => {
    if (aqi <= 50) return 'Good'
    if (aqi <= 100) return 'Moderate'
    if (aqi <= 150) return 'Unhealthy for Sensitive'
    return 'Unhealthy'
  }

  useEffect(() => {
    if (!mapRef.current || data.length === 0) return

    // Clean up existing map
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove()
    }

    // Calculate bounds from data
    const latitudes = data.map(d => d.latitude)
    const longitudes = data.map(d => d.longitude)
    const minLat = Math.min(...latitudes)
    const maxLat = Math.max(...latitudes)
    const minLng = Math.min(...longitudes)
    const maxLng = Math.max(...longitudes)

    // Create map
    const map = L.map(mapRef.current).fitBounds([
      [minLat, minLng],
      [maxLat, maxLng]
    ], { padding: [20, 20] })

    mapInstanceRef.current = map

    // Add tile layer with dark theme
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map)

    // Group data by location to handle multiple readings per location
    const locationGroups = data.reduce((groups, item) => {
      const key = `${item.latitude}_${item.longitude}`
      if (!groups[key]) {
        groups[key] = []
      }
      groups[key].push(item)
      return groups
    }, {} as Record<string, AirQualityData[]>)

    // Add markers for each location
    Object.values(locationGroups).forEach(locationData => {
      const latest = locationData.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0]
      const color = getMarkerColor(latest.aqi)
      const status = getAqiStatus(latest.aqi)

      // Create custom marker
      const marker = L.circleMarker([latest.latitude, latest.longitude], {
        radius: 8,
        fillColor: color,
        color: '#ffffff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.8
      }).addTo(map)

      // Create popup content
      const popupContent = `
        <div style="
          background: #1a1a1a; 
          color: white; 
          padding: 16px; 
          border-radius: 8px; 
          min-width: 280px;
          font-family: system-ui, -apple-system, sans-serif;
        ">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px;">
            <div style="
              width: 12px; 
              height: 12px; 
              background: ${color}; 
              border-radius: 50%;
            "></div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 600;">${latest.location}</h3>
          </div>
          
          <div style="margin-bottom: 16px;">
            <div style="
              display: inline-block; 
              background: ${color}; 
              color: white; 
              padding: 4px 8px; 
              border-radius: 4px; 
              font-size: 12px; 
              font-weight: 600;
            ">
              AQI ${latest.aqi} - ${status}
            </div>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <div style="background: #2a2a2a; padding: 8px; border-radius: 4px;">
              <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">PM2.5</div>
              <div style="font-size: 16px; font-weight: 600; color: white;">${latest.pm25} μg/m³</div>
            </div>
            <div style="background: #2a2a2a; padding: 8px; border-radius: 4px;">
              <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">PM10</div>
              <div style="font-size: 16px; font-weight: 600; color: white;">${latest.pm10} μg/m³</div>
            </div>
            <div style="background: #2a2a2a; padding: 8px; border-radius: 4px;">
              <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Temperature</div>
              <div style="font-size: 16px; font-weight: 600; color: white;">${latest.temperature}°C</div>
            </div>
            <div style="background: #2a2a2a; padding: 8px; border-radius: 4px;">
              <div style="font-size: 11px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em;">Humidity</div>
              <div style="font-size: 16px; font-weight: 600; color: white;">${latest.humidity}%</div>
            </div>
          </div>

          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px;">
            <div style="text-align: center;">
              <div style="font-size: 11px; color: #9ca3af;">NO₂</div>
              <div style="font-size: 14px; font-weight: 600; color: white;">${latest.no2}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 11px; color: #9ca3af;">O₃</div>
              <div style="font-size: 14px; font-weight: 600; color: white;">${latest.o3}</div>
            </div>
            <div style="text-align: center;">
              <div style="font-size: 11px; color: #9ca3af;">Wind</div>
              <div style="font-size: 14px; font-weight: 600; color: white;">${latest.windSpeed} m/s</div>
            </div>
          </div>

          <div style="border-top: 1px solid #374151; padding-top: 12px;">
            <div style="font-size: 11px; color: #9ca3af;">
              Last Updated: ${latest.timestamp.toLocaleString()}
            </div>
            <div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">
              Coordinates: ${latest.latitude.toFixed(4)}, ${latest.longitude.toFixed(4)}
            </div>
            ${locationData.length > 1 ? `<div style="font-size: 11px; color: #9ca3af; margin-top: 4px;">
              ${locationData.length} total readings at this location
            </div>` : ''}
          </div>
        </div>
      `

      marker.bindPopup(popupContent, {
        maxWidth: 300,
        className: 'custom-popup'
      })

      // Add hover effects
      marker.on('mouseover', function(this: L.CircleMarker) {
        this.setStyle({
          radius: 10,
          weight: 3
        })
      })

      marker.on('mouseout', function(this: L.CircleMarker) {
        this.setStyle({
          radius: 8,
          weight: 2
        })
      })
    })

    // Add legend
    const legend = new L.Control({ position: 'bottomright' })
    legend.onAdd = function() {
      const div = L.DomUtil.create('div', 'legend')
      div.style.background = '#1a1a1a'
      div.style.color = 'white'
      div.style.padding = '12px'
      div.style.borderRadius = '8px'
      div.style.border = '1px solid #374151'
      div.style.fontSize = '12px'
      div.style.lineHeight = '1.5'

      div.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 8px;">Air Quality Index</div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <div style="width: 12px; height: 12px; background: #22c55e; border-radius: 50%;"></div>
          <span>Good (0-50)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <div style="width: 12px; height: 12px; background: #eab308; border-radius: 50%;"></div>
          <span>Moderate (51-100)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <div style="width: 12px; height: 12px; background: #f97316; border-radius: 50%;"></div>
          <span>Unhealthy for Sensitive (101-150)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div style="width: 12px; height: 12px; background: #ef4444; border-radius: 50%;"></div>
          <span>Unhealthy (151+)</span>
        </div>
      `
      return div
    }
    legend.addTo(map)

    // Clean up on unmount
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove()
        mapInstanceRef.current = null
      }
    }
  }, [data])

  if (data.length === 0) {
    return (
      <div className="w-full h-96 bg-[#1a1a1a] border border-gray-700 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-400 mb-2">No location data available</div>
          <div className="text-sm text-gray-500">Upload data with latitude and longitude coordinates to view the map</div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-96 border border-gray-700 rounded-lg overflow-hidden">
      <div ref={mapRef} className="w-full h-full" />
      <style jsx global>{`
        .custom-popup .leaflet-popup-content-wrapper {
          background: transparent !important;
          border-radius: 8px !important;
          padding: 0 !important;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5) !important;
        }
        .custom-popup .leaflet-popup-content {
          margin: 0 !important;
        }
        .custom-popup .leaflet-popup-tip {
          background: #1a1a1a !important;
          border: 1px solid #374151 !important;
        }
        .legend {
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3) !important;
        }
      `}</style>
    </div>
  )
}

export default InteractiveMap 